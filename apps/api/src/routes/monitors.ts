import { Router } from "express";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { MonitorRepository, type MonitorPageRequest } from "@repo/node-utils/repositories/monitor-repository";
import { ApiPath } from "@repo/routing/api-path";
import type { MonitorUpdate, NewMonitor } from "@repo/types/monitor";
import { MAX_ALERT_THRESHOLD_MISSES, MAX_MONITOR_PAGE_SIZE, MIN_CHECK_INTERVAL_SECONDS, MONITOR_PAGE_SIZE } from "@repo/app-core/monitor-limits";
import { HttpError } from "@/errors/http-error";
import { initCatalystScopes, requireSignedInUser } from "@/middleware";
import { MonitorService } from "@/services/monitor-service";
import { toPagedResponse, toRecordResponse } from "@/utils/api";

const HTTP_URL_PATTERN = /^https?:\/\//i;
const MAX_NAME_LENGTH = 100;
/** Deliberately loose: Catalyst Mail is the real check, and this only stops a typo. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fieldsOf(body: unknown): Record<string, unknown> {
  if (typeof body !== "object" || body === null) {
    throw HttpError.BadRequest("Expected a JSON object.");
  }
  return body as Record<string, unknown>;
}

function wholeNumber(
  fields: Record<string, unknown>,
  rule: { field: string; min: number; max?: number },
): number {
  const { field, min, max = Number.MAX_SAFE_INTEGER } = rule;
  const value = fields[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    const range = max === Number.MAX_SAFE_INTEGER ? `at least ${min}` : `from ${min} to ${max}`;
    throw HttpError.BadRequest(`${field} must be a whole number ${range}.`);
  }
  return value;
}

/** A query string arrives as text, so an absent number takes the default and anything else
 *  must spell a whole number in range. A blank `name` searches for nothing. */
function toMonitorPageRequest(query: Record<string, unknown>): MonitorPageRequest {
  const { pageNo = "1", perPage = String(MONITOR_PAGE_SIZE), name = "" } = query;
  if (typeof name !== "string" || name.length > MAX_NAME_LENGTH) {
    throw HttpError.BadRequest(`name must be at most ${MAX_NAME_LENGTH} characters.`);
  }
  return {
    pageNo: wholeNumber({ pageNo: Number(pageNo) }, { field: "pageNo", min: 1 }),
    perPage: wholeNumber({ perPage: Number(perPage) }, { field: "perPage", min: 1, max: MAX_MONITOR_PAGE_SIZE }),
    nameContains: name.trim() === "" ? undefined : name.trim(),
  };
}

function text(fields: Record<string, unknown>, field: string, maxLength: number): string {
  const value = fields[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw HttpError.BadRequest(`${field} is required.`);
  }
  if (value.trim().length > maxLength) {
    throw HttpError.BadRequest(`${field} must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

function email(fields: Record<string, unknown>, field: string): string {
  const value = text(fields, field, 255);
  if (!EMAIL_PATTERN.test(value)) {
    throw HttpError.BadRequest(`${field} must be an email address.`);
  }
  return value;
}

function toNewMonitor(body: unknown): NewMonitor {
  const fields = fieldsOf(body);
  const url = text(fields, "url", 255);
  if (!HTTP_URL_PATTERN.test(url) || !URL.canParse(url)) {
    throw HttpError.BadRequest("url must be an http:// or https:// address.");
  }
  return {
    name: text(fields, "name", MAX_NAME_LENGTH),
    url,
    checkIntervalSeconds: wholeNumber(fields, { field: "checkIntervalSeconds", min: MIN_CHECK_INTERVAL_SECONDS }),
    alertThresholdMisses: wholeNumber(fields, { field: "alertThresholdMisses", min: 1, max: MAX_ALERT_THRESHOLD_MISSES }),
    alertEmail: email(fields, "alertEmail"),
  };
}

function toMonitorUpdate(body: unknown): MonitorUpdate {
  const { state } = fieldsOf(body);
  if (state !== "active" && state !== "inactive") {
    throw HttpError.BadRequest('state must be "active" or "inactive".');
  }
  return { state };
}

/** Anything that is not a monitor id cannot name a monitor, and reads as absent. */
function monitorIdOf(monitorId: string | undefined): string {
  if (monitorId === undefined || !MonitorRepository.isMonitorId(monitorId)) {
    throw HttpError.NotFound(`No monitor ${monitorId ?? ""}.`);
  }
  return monitorId;
}

export const monitorsRouter: Router = Router();

// Wipes every monitor, its cron, its probes and its alerts, then adds the two Catalyst sites
// to start from. Deliberately public - no sign-in and no role check - so a demo can be
// returned to a known state from a plain `curl`. It is
// registered above the router's sign-in, so only the Admin app is built for it.
monitorsRouter.post(ApiPath.Reset, initCatalystScopes([CatalystScope.Admin]), async (_req, res) => {
  res.json(toRecordResponse(await MonitorService.reset()));
});

// User so every route below needs a signed-in caller, checked against Catalyst; Admin for
// the reads, the writes and the schedules. Nothing filters on owner: access is to be
// controlled through Catalyst.
monitorsRouter.use(initCatalystScopes([CatalystScope.User, CatalystScope.Admin]), requireSignedInUser);

monitorsRouter.get(ApiPath.Root, async (req, res) => {
  const pageRequest = toMonitorPageRequest(req.query);
  const { monitors, count } = await MonitorService.list(pageRequest);
  res.json(toPagedResponse(monitors, pageRequest.pageNo, pageRequest.perPage, count));
});

monitorsRouter.post(ApiPath.Root, async (req, res) => {
  const monitor = await MonitorService.register(toNewMonitor(req.body));
  res.status(201).json(toRecordResponse(monitor));
});

// Ahead of `/:monitorId`, so "summary" is never taken for an id.
monitorsRouter.get(ApiPath.Summary, async (_req, res) => {
  res.json(toRecordResponse(await MonitorService.summary()));
});

monitorsRouter.get(ApiPath.MonitorId, async (req, res) => {
  res.json(toRecordResponse(await MonitorService.detail(monitorIdOf(req.params.monitorId))));
});

monitorsRouter.patch(ApiPath.MonitorId, async (req, res) => {
  const monitorId = monitorIdOf(req.params.monitorId);
  const { state } = toMonitorUpdate(req.body);
  res.json(toRecordResponse(await MonitorService.setState(monitorId, state)));
});

// Replaces every setting at once - the same body, and the same rules, as registering - and
// starts the monitor's history over.
monitorsRouter.put(ApiPath.MonitorId, async (req, res) => {
  const monitorId = monitorIdOf(req.params.monitorId);
  res.json(toRecordResponse(await MonitorService.edit(monitorId, toNewMonitor(req.body))));
});

monitorsRouter.delete(ApiPath.MonitorId, async (req, res) => {
  const monitorId = monitorIdOf(req.params.monitorId);
  await MonitorService.delete(monitorId);
  res.json(toRecordResponse({ id: monitorId }));
});

// Calls the monitor's URL now and answers with what came back - a down endpoint is a 200
// carrying `success: false`, not an error.
monitorsRouter.post(ApiPath.MonitorId + ApiPath.Check, async (req, res) => {
  res.json(toRecordResponse(await MonitorService.checkNow(monitorIdOf(req.params.monitorId))));
});

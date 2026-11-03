import { monitorProbeJob } from "@repo/node-utils/catalyst/resources";
import { HttpRequestError } from "@repo/node-utils/errors/http-request-error";
import { HttpClient } from "@repo/node-utils/http/http-client";
import { logger } from "@repo/node-utils/framework/logger";
import { MonitorRepository, type MonitorPageRequest } from "@repo/node-utils/repositories/monitor-repository";
import type {
  Alert,
  LatestAlert,
  LatestProbe,
  ListedMonitor,
  Monitor,
  MonitorDetail,
  MonitorState,
  MonitorSummary,
  NewMonitor,
  Probe,
  UrlCheckResult,
} from "@repo/types/monitor";
import { LATEST_PROBE_LIMIT, LIST_PROBE_SLOTS } from "@repo/app-core/monitor-limits";
import { HttpError } from "@/errors/http-error";
import { WireTime } from "@/utils/wire-time";

/** One page of the list as the API answers it, and how many monitors match in all. */
export interface ListedMonitorPage {
  monitors: ListedMonitor[];
  count: number;
}

/** What a reset removed, and how many monitors it started again with. */
export interface ResetResult {
  monitorsDeleted: number;
  monitorsAdded: number;
}

/**
 * Facade: every monitor operation the API offers, over `MonitorRepository` and each
 * monitor's probe schedule. A route parses the request and shapes the response; this
 * decides what happens and in which order, and how much of a monitor each answer carries.
 * A monitor that does not exist is a `HttpError.NotFound`.
 */
export class MonitorService {
  /** The probe job's own limit, so a check now answers the way a scheduled probe would. */
  private static readonly CHECK_TIMEOUT_MS = 5_000;

  /** What a reset starts again with, so a demo never opens on an empty list. Nobody is
   *  signed in to a reset, so there is no address to email their alerts to. */
  private static readonly RESET_MONITORS: NewMonitor[] = [
    { name: "Catalyst Console", url: "https://console.catalyst.zoho.com", checkIntervalSeconds: 60, alertThresholdMisses: 3, alertEmail: null },
    { name: "Catalyst", url: "https://catalyst.zoho.com", checkIntervalSeconds: 60, alertThresholdMisses: 3, alertEmail: null },
  ];

  static async list(pageRequest: MonitorPageRequest): Promise<ListedMonitorPage> {
    const { monitors, count } = await MonitorRepository.getPagedRecords(pageRequest);
    return { monitors: monitors.map((monitor) => MonitorService.toListedMonitor(monitor, LIST_PROBE_SLOTS)), count };
  }

  /** The whole fleet in counts, whatever the list is filtered to. */
  static summary(): Promise<MonitorSummary> {
    return MonitorRepository.summary();
  }

  /** Every probe the monitor keeps, and its alerts - what its drawer shows. */
  static async detail(monitorId: string): Promise<MonitorDetail> {
    const monitor = await MonitorRepository.find(monitorId);
    if (monitor === undefined) {
      throw HttpError.NotFound(`No monitor ${monitorId}.`);
    }
    return {
      ...MonitorService.toListedMonitor(monitor, LATEST_PROBE_LIMIT),
      latestAlerts: monitor.latestAlerts.map(MonitorService.toLatestAlert),
    };
  }

  /**
   * Stores the monitor, then gives it its own repeating schedule at its interval - the probe
   * job does the probing and alerting from there. Three calls, because the schedule needs the
   * monitor's id and the monitor keeps the schedule's. If scheduling fails, the monitor is
   * removed again rather than left stored with nothing probing it.
   */
  static async register(newMonitor: NewMonitor): Promise<ListedMonitor> {
    const monitor = await MonitorRepository.register(newMonitor);
    try {
      const scheduleId = await monitorProbeJob.scheduleRepeating({
        scheduleName: MonitorService.scheduleNameOf(monitor.id),
        intervalSeconds: monitor.checkIntervalSeconds,
        params: { monitorId: monitor.id },
      });
      await MonitorRepository.setScheduleId(monitor.id, scheduleId);
      return MonitorService.toListedMonitor(monitor, LIST_PROBE_SLOTS);
    } catch (error) {
      await MonitorRepository.delete(monitor.id);
      throw error;
    }
  }

  /**
   * Replaces everything the monitor was registered with, and starts its history over: the
   * checks and alerts it kept were judged against the old settings. The schedule first, and
   * only when the interval changed, so a failure there leaves the monitor as it was.
   */
  static async edit(monitorId: string, settings: NewMonitor): Promise<ListedMonitor> {
    const monitor = await MonitorRepository.find(monitorId);
    if (monitor === undefined) {
      throw HttpError.NotFound(`No monitor ${monitorId}.`);
    }
    if (settings.checkIntervalSeconds !== monitor.checkIntervalSeconds) {
      await monitorProbeJob.rescheduleRepeating(await MonitorService.scheduleIdOf(monitorId), {
        scheduleName: MonitorService.scheduleNameOf(monitorId),
        intervalSeconds: settings.checkIntervalSeconds,
        params: { monitorId },
        isActive: monitor.state === "active",
      });
    }
    await MonitorRepository.replaceSettings(monitorId, settings);
    const edited: Monitor = { ...monitor, ...settings, health: "unknown", latestProbes: [], latestAlerts: [] };
    return MonitorService.toListedMonitor(edited, LIST_PROBE_SLOTS);
  }

  /** The schedule pauses with the monitor, so an inactive monitor costs no job runs at all. */
  static async setState(monitorId: string, state: MonitorState): Promise<ListedMonitor> {
    const scheduleId = await MonitorService.scheduleIdOf(monitorId);
    await (state === "inactive"
      ? monitorProbeJob.pauseSchedule(scheduleId)
      : monitorProbeJob.resumeSchedule(scheduleId));
    const updated = await MonitorRepository.setState(monitorId, state);
    if (updated === undefined) {
      throw HttpError.NotFound(`No monitor ${monitorId}.`);
    }
    return MonitorService.toListedMonitor(updated, LIST_PROBE_SLOTS);
  }

  /** The schedule first, so a failure leaves the monitor in place to try again; its probes and
   *  alerts are columns on the row and go with it. A monitor registered before monitors had
   *  schedules has none, and is still deleted. */
  static async delete(monitorId: string): Promise<void> {
    const scheduleId = await MonitorRepository.scheduleIdOf(monitorId);
    if (scheduleId !== undefined) {
      await monitorProbeJob.deleteSchedule(scheduleId);
    }
    if (!(await MonitorRepository.delete(monitorId))) {
      throw HttpError.NotFound(`No monitor ${monitorId}.`);
    }
  }

  /** One GET to the monitor's URL, made in this request and answered as it went. Paused or
   *  not, and recorded nowhere. A non-2xx or no answer at all is the result to show, not a
   *  failure of this request. */
  static async checkNow(monitorId: string): Promise<UrlCheckResult> {
    const monitor = await MonitorRepository.find(monitorId);
    if (monitor === undefined) {
      throw HttpError.NotFound(`No monitor ${monitorId}.`);
    }
    const target = new URL(monitor.url);
    const client = new HttpClient({ baseUrl: target.origin, timeoutMs: MonitorService.CHECK_TIMEOUT_MS });
    const startedAtMs = Date.now();
    try {
      const { status } = await client.get(target.pathname + target.search);
      return MonitorService.toUrlCheckResult({ startedAtMs, statusCode: status, success: true });
    } catch (error) {
      if (!(error instanceof HttpRequestError)) {
        throw error;
      }
      return MonitorService.toUrlCheckResult({ startedAtMs, statusCode: error.status ?? null, success: false });
    }
  }

  private static toUrlCheckResult(check: { startedAtMs: number; statusCode: number | null; success: boolean }): UrlCheckResult {
    return {
      success: check.success,
      statusCode: check.statusCode,
      latencyMs: Date.now() - check.startedAtMs,
      checkedAt: WireTime.fromEpochMs(check.startedAtMs),
    };
  }

  /** Every monitor and its schedule - its probes and alerts with it - then registers
   *  `RESET_MONITORS` afresh. The schedules first: Catalyst lists none made from code, so
   *  once their monitors are gone nothing would be left to find them by. One call per
   *  schedule - the SDK has no bulk delete - and three per monitor added, as `register`. */
  static async reset(): Promise<ResetResult> {
    const scheduleIds = await MonitorRepository.allScheduleIds();
    await Promise.all(scheduleIds.map((scheduleId) => monitorProbeJob.deleteSchedule(scheduleId)));
    const monitorsDeleted = await MonitorRepository.deleteAll();
    const added = await Promise.all(MonitorService.RESET_MONITORS.map((monitor) => MonitorService.register(monitor)));
    logger.info(`Reset: deleted ${monitorsDeleted} monitors, added ${added.length}.`);
    return { monitorsDeleted, monitorsAdded: added.length };
  }

  /** Health is judged from every probe the monitor keeps; the answer carries only the newest
   *  `maxProbes`, which is all the client draws. */
  private static toListedMonitor(monitor: Monitor, maxProbes: number): ListedMonitor {
    return {
      id: monitor.id,
      name: monitor.name,
      url: monitor.url,
      checkIntervalSeconds: monitor.checkIntervalSeconds,
      alertThresholdMisses: monitor.alertThresholdMisses,
      alertEmail: monitor.alertEmail,
      state: monitor.state,
      health: monitor.health,
      maxProbes,
      latestProbes: monitor.latestProbes.slice(-maxProbes).map(MonitorService.toLatestProbe),
    };
  }

  private static toLatestProbe({ checkedAtMs, success, latencyMs, alertTriggered }: Probe): LatestProbe {
    return { checkedAt: WireTime.fromEpochMs(checkedAtMs), success, latencyMs, alertTriggered };
  }

  private static toLatestAlert({ firedAtMs, emailedTo }: Alert): LatestAlert {
    return { firedAt: WireTime.fromEpochMs(firedAtMs), emailedTo };
  }

  /** The monitor's schedule id, or a 404 when there is no monitor to act on. */
  /** Unique in the project, as Catalyst requires, and names the monitor it probes. */
  private static scheduleNameOf(monitorId: string): string {
    return `m_${monitorId}`;
  }

  private static async scheduleIdOf(monitorId: string): Promise<string> {
    const scheduleId = await MonitorRepository.scheduleIdOf(monitorId);
    if (scheduleId === undefined) {
      throw HttpError.NotFound(`No monitor ${monitorId}.`);
    }
    return scheduleId;
  }
}

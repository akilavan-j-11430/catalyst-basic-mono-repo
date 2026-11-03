import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { ApiPath } from "@repo/routing/api-path";
import type { LatestProbe, ListedMonitor, Monitor, Probe } from "@repo/types/monitor";
import { catalystAuth } from "../catalyst-auth";
import { app } from "@/app";

// `zcAuth.init` is faked for the whole workspace by test/setup.ts. The repository, the probe
// job's schedule and the session check are faked here, so no request reaches Catalyst.
const { monitorRepository, monitorProbeJob, currentUser, privateAddress } = vi.hoisted(() => ({
  monitorRepository: {
    isMonitorId: (value: string): boolean => /^\d+$/.test(value),
    getPagedRecords: vi.fn(),
    summary: vi.fn(),
    find: vi.fn(),
    register: vi.fn(),
    setState: vi.fn(),
    replaceSettings: vi.fn(async (): Promise<void> => undefined),
    allScheduleIds: vi.fn(async (): Promise<string[]> => ["cron-9", "cron-10"]),
    deleteAll: vi.fn(async (): Promise<number> => 2),
    setScheduleId: vi.fn(async (): Promise<void> => undefined),
    scheduleOf: vi.fn(async (): Promise<{ scheduleId: string | null } | undefined> => ({ scheduleId: "cron-9" })),
    clearScheduleId: vi.fn(async (): Promise<void> => undefined),
    delete: vi.fn(async (): Promise<boolean> => true),
  },
  monitorProbeJob: {
    scheduleRepeating: vi.fn(async (): Promise<string> => "cron-9"),
    rescheduleRepeating: vi.fn(async (): Promise<void> => undefined),
    deleteSchedule: vi.fn(async (): Promise<void> => undefined),
    pauseSchedule: vi.fn(async (): Promise<void> => undefined),
    resumeSchedule: vi.fn(async (): Promise<void> => undefined),
  },
  currentUser: vi.fn(async () => ({ userId: "7080", emailId: "asha@example.com" })),
  privateAddress: { isPrivateUrl: vi.fn(async (): Promise<boolean> => false) },
}));

vi.mock("@repo/node-utils/repositories/monitor-repository", () => ({ MonitorRepository: monitorRepository }));
vi.mock("@repo/node-utils/catalyst/resources", () => ({ monitorProbeJob }));
vi.mock("@repo/node-utils/catalyst/user-management", () => ({ UserManagement: { currentUser } }));
// No test resolves DNS: a URL counts as public unless a test says otherwise.
vi.mock("@repo/node-utils/http/private-address", () => ({ PrivateAddress: privateAddress }));

const V1 = ApiPath.Api + ApiPath.V1;
const MONITORS = V1 + ApiPath.Monitors;

const newMonitor = {
  name: "Checkout API",
  url: "https://checkout.example.com/health",
  checkIntervalSeconds: 120,
  alertThresholdMisses: 3,
  alertEmail: "oncall@example.com",
};

const storedMonitor: Monitor = {
  ...newMonitor,
  id: "1001",
  state: "active",
  health: "unknown",
  latestProbes: [],
  latestAlerts: [],
};

/** What the list, register and pause answer for `storedMonitor`. */
const listedMonitor: ListedMonitor = {
  ...newMonitor,
  id: "1001",
  state: "active",
  health: "unknown",
  maxProbes: 40,
  latestProbes: [],
};

/** `count` probes a minute apart, oldest first, as the repository holds them. */
function probesOf(count: number): Probe[] {
  return Array.from({ length: count }, (_, index) => ({
    checkedAtMs: Date.UTC(2026, 10, 2, 12, index),
    success: true,
    latencyMs: 42,
    alertTriggered: false,
  }));
}

/** The same probe as the API must send it - its time as ISO 8601 UTC. */
function asSent({ checkedAtMs, ...probe }: Probe): LatestProbe {
  return { ...probe, checkedAt: new Date(checkedAtMs).toISOString() };
}

describe("GET /api/v1/ping", () => {
  it("answers pong in the record envelope", async () => {
    const pong = await request(app).get(V1 + ApiPath.Ping);

    expect(pong.status).toBe(200);
    expect(pong.body).toEqual({ status: "success", data: { message: "pong" } });
  });
});

describe("an unknown path", () => {
  it("answers 404 in the error envelope", async () => {
    const notFound = await request(app).get("/api/v1/no-such-route");

    expect(notFound.status).toBe(404);
    expect(notFound.body).toEqual({
      status: "error",
      message: "The requested url does not exist.",
    });
  });
});

describe("GET /api/v1/monitors", () => {
  it("answers the first page of 20 when no page is asked for", async () => {
    monitorRepository.getPagedRecords.mockResolvedValue({ monitors: [storedMonitor], count: 1 });

    const firstPage = await request(app).get(MONITORS);

    expect(firstPage.status).toBe(200);
    expect(firstPage.body).toEqual({
      status: "success",
      data: [listedMonitor],
      pageInfo: { page: 1, perPage: 20, count: 1, totalPages: 1, hasMore: false },
    });
    expect(monitorRepository.getPagedRecords).toHaveBeenCalledExactlyOnceWith({ pageNo: 1, perPage: 20 });
  });

  it("answers the page asked for, and says more follow", async () => {
    monitorRepository.getPagedRecords.mockResolvedValue({ monitors: [storedMonitor], count: 11 });

    const secondPage = await request(app).get(MONITORS).query({ pageNo: 2, perPage: 5 });

    expect(secondPage.status).toBe(200);
    expect(secondPage.body).toEqual({
      status: "success",
      data: [listedMonitor],
      pageInfo: { page: 2, perPage: 5, count: 11, totalPages: 3, hasMore: true },
    });
    expect(monitorRepository.getPagedRecords).toHaveBeenCalledExactlyOnceWith({ pageNo: 2, perPage: 5 });
  });

  it("sends only the newest probes a row draws, while health is judged from them all", async () => {
    const probes = probesOf(45);
    monitorRepository.getPagedRecords.mockResolvedValue({
      monitors: [{ ...storedMonitor, health: "up", latestProbes: probes }],
      count: 1,
    });

    const firstPage = await request(app).get(MONITORS);

    expect(firstPage.body.data).toEqual([{ ...listedMonitor, health: "up", latestProbes: probes.slice(-40).map(asSent) }]);
  });

  it("searches by name, trimmed", async () => {
    monitorRepository.getPagedRecords.mockResolvedValue({ monitors: [storedMonitor], count: 1 });

    const found = await request(app).get(MONITORS).query({ name: "  checkout " });

    expect(found.status).toBe(200);
    expect(monitorRepository.getPagedRecords).toHaveBeenCalledExactlyOnceWith({
      pageNo: 1,
      perPage: 20,
      nameContains: "checkout",
    });
  });

  it("answers 401 when the session is not a signed-in user's, without reading anything", async () => {
    currentUser.mockRejectedValue(new Error("invalid session"));

    const rejection = await request(app).get(MONITORS);

    expect(rejection.status).toBe(401);
    expect(rejection.body).toEqual({ status: "error", message: "Sign in to continue." });
    expect(monitorRepository.getPagedRecords).not.toHaveBeenCalled();
  });

  it("answers 400 for a page size above 100 without reading anything", async () => {
    const rejection = await request(app).get(MONITORS).query({ perPage: 101 });

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({
      status: "error",
      message: "perPage must be a whole number from 1 to 100.",
    });
    expect(monitorRepository.getPagedRecords).not.toHaveBeenCalled();
  });

  it("answers 400 for a page number that is not a whole number", async () => {
    const rejection = await request(app).get(MONITORS).query({ pageNo: "two" });

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({ status: "error", message: "pageNo must be a whole number at least 1." });
  });
});

describe("POST /api/v1/monitors", () => {
  it("stores the monitor and schedules its probe job at its own interval", async () => {
    monitorRepository.register.mockResolvedValue(storedMonitor);

    const created = await request(app).post(MONITORS).send(newMonitor);

    expect(created.status).toBe(201);
    expect(created.body).toEqual({ status: "success", data: listedMonitor });
    expect(monitorRepository.register).toHaveBeenCalledWith(newMonitor);
    expect(monitorProbeJob.scheduleRepeating).toHaveBeenCalledExactlyOnceWith({
      scheduleName: "m_1001",
      intervalSeconds: 120,
      params: { monitorId: "1001" },
    });
    expect(monitorRepository.setScheduleId).toHaveBeenCalledWith("1001", "cron-9");
  });

  it("removes the monitor again when its job cannot be scheduled", async () => {
    monitorRepository.register.mockResolvedValue(storedMonitor);
    monitorProbeJob.scheduleRepeating.mockRejectedValue(new Error("no job pool"));

    const failure = await request(app).post(MONITORS).send(newMonitor);

    expect(failure.status).toBe(500);
    expect(failure.body).toEqual({ status: "error", message: "Something went wrong." });
    expect(monitorRepository.delete).toHaveBeenCalledWith("1001");
    expect(monitorRepository.setScheduleId).not.toHaveBeenCalled();
  });

  it("deletes the new schedule too when the monitor cannot keep its id", async () => {
    monitorRepository.register.mockResolvedValue(storedMonitor);
    monitorRepository.setScheduleId.mockRejectedValue(new Error("datastore unavailable"));

    const failure = await request(app).post(MONITORS).send(newMonitor);

    expect(failure.status).toBe(500);
    expect(monitorProbeJob.deleteSchedule).toHaveBeenCalledExactlyOnceWith("cron-9");
    expect(monitorRepository.delete).toHaveBeenCalledWith("1001");
  });

  it("refuses a URL inside a private network without storing anything", async () => {
    privateAddress.isPrivateUrl.mockResolvedValue(true);

    const rejection = await request(app).post(MONITORS).send({ ...newMonitor, url: "http://169.254.169.254/latest" });

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({
      status: "error",
      message: "That URL points inside a private network, which Lively does not call.",
    });
    expect(monitorRepository.register).not.toHaveBeenCalled();
  });

  it.each([
    [90, "checkIntervalSeconds must be a whole number of minutes."],
    [86_460, "checkIntervalSeconds must be a whole number from 60 to 86400."],
  ])("answers 400 for an interval of %ss", async (checkIntervalSeconds, message) => {
    const rejection = await request(app).post(MONITORS).send({ ...newMonitor, checkIntervalSeconds });

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({ status: "error", message });
    expect(monitorRepository.register).not.toHaveBeenCalled();
  });

  it("answers 400 for a threshold above 100 without storing anything", async () => {
    const rejection = await request(app)
      .post(MONITORS)
      .send({ ...newMonitor, alertThresholdMisses: 101 });

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({
      status: "error",
      message: "alertThresholdMisses must be a whole number from 1 to 100.",
    });
    expect(monitorRepository.register).not.toHaveBeenCalled();
  });

  it("answers 401 to a caller with no session, asking for the User app", async () => {
    catalystAuth.init.mockRejectedValue(new Error("missing user credentials"));

    const rejection = await request(app).post(MONITORS).send(newMonitor);

    expect(rejection.status).toBe(401);
    expect(rejection.body).toEqual({ status: "error", message: "Sign in to continue." });
    expect(catalystAuth.init).toHaveBeenCalledWith(expect.anything(), { scope: CatalystScope.User });
  });
});

describe("POST /api/v1/monitors/:monitorId/check", () => {
  // A stand-in for the monitored endpoint: /up answers 200, anything else 503.
  const upstream = createServer((req, res) => {
    res.writeHead(req.url === "/up" ? 200 : 503).end();
  });
  let upstreamUrl = "";

  beforeAll(async () => {
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  async function checkUrl(url: string): Promise<request.Response> {
    monitorRepository.find.mockResolvedValue({ ...storedMonitor, url });
    return request(app).post(`${MONITORS}/1001${ApiPath.Check}`);
  }

  it("calls the URL now and answers with what came back, recording nothing", async () => {
    const checked = await checkUrl(`${upstreamUrl}/up`);

    expect(checked.status).toBe(200);
    expect(checked.body).toEqual({
      status: "success",
      data: { success: true, statusCode: 200, latencyMs: expect.any(Number), checkedAt: expect.any(String) },
    });
    expect(monitorRepository.find).toHaveBeenCalledWith("1001");
    expect(monitorRepository.setState).not.toHaveBeenCalled();
  });

  it("answers a non-2xx as a failed check, not as an error", async () => {
    const checked = await checkUrl(`${upstreamUrl}/down`);

    expect(checked.status).toBe(200);
    expect(checked.body).toEqual({
      status: "success",
      data: { success: false, statusCode: 503, latencyMs: expect.any(Number), checkedAt: expect.any(String) },
    });
  });

  it("answers no status code when nothing came back", async () => {
    // Port 1 is never listening, so the connection is refused.
    const checked = await checkUrl("http://127.0.0.1:1/health");

    expect(checked.status).toBe(200);
    expect(checked.body.data).toEqual(expect.objectContaining({ success: false, statusCode: null }));
  });

  it("answers 404 for a monitor that does not exist", async () => {
    monitorRepository.find.mockResolvedValue(undefined);

    const missing = await request(app).post(`${MONITORS}/1001${ApiPath.Check}`);

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ status: "error", message: "No monitor 1001." });
  });

  it("refuses to call a URL inside a private network", async () => {
    privateAddress.isPrivateUrl.mockResolvedValue(true);

    const rejection = await checkUrl(`${upstreamUrl}/up`);

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({
      status: "error",
      message: "That URL points inside a private network, which Lively does not call.",
    });
  });
});

describe("PUT /api/v1/monitors/:monitorId", () => {
  const edited = { ...newMonitor, name: "Checkout", url: "https://checkout.example.com/ready" };

  it("replaces the settings and answers the monitor with its history started over", async () => {
    monitorRepository.find.mockResolvedValue({ ...storedMonitor, health: "up", latestProbes: probesOf(3) });

    const saved = await request(app).put(`${MONITORS}/1001`).send(edited);

    expect(saved.status).toBe(200);
    expect(saved.body).toEqual({ status: "success", data: { ...listedMonitor, ...edited, health: "unknown", latestProbes: [] } });
    expect(monitorRepository.replaceSettings).toHaveBeenCalledExactlyOnceWith("1001", edited);
    expect(monitorProbeJob.rescheduleRepeating).not.toHaveBeenCalled();
  });

  it("moves the schedule to a new interval, keeping a paused monitor paused", async () => {
    monitorRepository.find.mockResolvedValue({ ...storedMonitor, state: "inactive" });

    await request(app).put(`${MONITORS}/1001`).send({ ...edited, checkIntervalSeconds: 300 });

    expect(monitorProbeJob.rescheduleRepeating).toHaveBeenCalledExactlyOnceWith("cron-9", {
      scheduleName: "m_1001",
      intervalSeconds: 300,
      params: { monitorId: "1001" },
      isActive: false,
    });
  });

  it("checks the body by the same rules as registering", async () => {
    const rejection = await request(app).put(`${MONITORS}/1001`).send({ ...edited, url: "ftp://example.com" });

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({ status: "error", message: "url must be an http:// or https:// address." });
    expect(monitorRepository.replaceSettings).not.toHaveBeenCalled();
  });

  it("answers 404 for a monitor that does not exist", async () => {
    monitorRepository.find.mockResolvedValue(undefined);

    const missing = await request(app).put(`${MONITORS}/1001`).send(edited);

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ status: "error", message: "No monitor 1001." });
  });
});

describe("DELETE /api/v1/monitors/:monitorId", () => {
  it("deletes the monitor's schedule, forgets it, then deletes the monitor", async () => {
    const deleted = await request(app).delete(`${MONITORS}/1001`);

    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ status: "success", data: { id: "1001" } });
    expect(monitorProbeJob.deleteSchedule).toHaveBeenCalledExactlyOnceWith("cron-9");
    expect(monitorRepository.clearScheduleId).toHaveBeenCalledWith("1001");
    expect(monitorRepository.delete).toHaveBeenCalledWith("1001");
  });

  it("still deletes a monitor with no schedule - one whose schedule an earlier attempt already deleted", async () => {
    monitorRepository.scheduleOf.mockResolvedValue({ scheduleId: null });

    const deleted = await request(app).delete(`${MONITORS}/1001`);

    expect(deleted.status).toBe(200);
    expect(monitorProbeJob.deleteSchedule).not.toHaveBeenCalled();
    expect(monitorRepository.delete).toHaveBeenCalledWith("1001");
  });

  it("answers 404, deleting nothing, for a monitor that does not exist", async () => {
    monitorRepository.scheduleOf.mockResolvedValue(undefined);

    const missing = await request(app).delete(`${MONITORS}/1001`);

    expect(missing.status).toBe(404);
    expect(monitorProbeJob.deleteSchedule).not.toHaveBeenCalled();
    expect(monitorRepository.delete).not.toHaveBeenCalled();
  });

  it("keeps the monitor when its schedule will not delete, so the delete can be tried again", async () => {
    monitorProbeJob.deleteSchedule.mockRejectedValue(new Error("cron service down"));

    const failed = await request(app).delete(`${MONITORS}/1001`);

    expect(failed.status).toBe(500);
    expect(monitorRepository.clearScheduleId).not.toHaveBeenCalled();
    expect(monitorRepository.delete).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/monitors/:monitorId", () => {
  it("answers every probe the monitor keeps and its alerts, every time as ISO 8601 UTC", async () => {
    const probes = probesOf(45);
    const firedAtMs = Date.UTC(2026, 10, 2, 12, 30);
    monitorRepository.find.mockResolvedValue({
      ...storedMonitor,
      latestProbes: probes,
      latestAlerts: [{ firedAtMs, emailedTo: "oncall@example.com" }],
    });

    const detail = await request(app).get(`${MONITORS}/1001`);

    expect(detail.status).toBe(200);
    expect(detail.body).toEqual({
      status: "success",
      data: {
        ...listedMonitor,
        maxProbes: 100,
        latestProbes: probes.map(asSent),
        latestAlerts: [{ firedAt: "2026-11-02T12:30:00.000Z", emailedTo: "oncall@example.com" }],
      },
    });
  });

  it("answers 404 for a monitor that does not exist", async () => {
    monitorRepository.find.mockResolvedValue(undefined);

    const missing = await request(app).get(`${MONITORS}/1001`);

    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ status: "error", message: "No monitor 1001." });
  });
});

describe("PATCH /api/v1/monitors/:monitorId", () => {
  it("pauses the monitor's schedule with it when it becomes inactive", async () => {
    monitorRepository.setState.mockResolvedValue({ ...storedMonitor, state: "inactive" });

    const updated = await request(app).patch(`${MONITORS}/1001`).send({ state: "inactive" });

    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ status: "success", data: { ...listedMonitor, state: "inactive" } });
    expect(monitorProbeJob.pauseSchedule).toHaveBeenCalledExactlyOnceWith("cron-9");
    expect(monitorRepository.setState).toHaveBeenCalledWith("1001", "inactive");
  });

  it("resumes the monitor's schedule with it when it becomes active", async () => {
    monitorRepository.setState.mockResolvedValue({ ...storedMonitor, state: "active" });

    const updated = await request(app).patch(`${MONITORS}/1001`).send({ state: "active" });

    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ status: "success", data: { ...listedMonitor, state: "active" } });
    expect(monitorProbeJob.resumeSchedule).toHaveBeenCalledExactlyOnceWith("cron-9");
    expect(monitorProbeJob.pauseSchedule).not.toHaveBeenCalled();
  });

  it("answers 400 for a state that is not active or inactive", async () => {
    const rejection = await request(app).patch(`${MONITORS}/1001`).send({ state: "paused" });

    expect(rejection.status).toBe(400);
    expect(rejection.body).toEqual({ status: "error", message: 'state must be "active" or "inactive".' });
    expect(monitorRepository.setState).not.toHaveBeenCalled();
  });

  it("answers 409 for a monitor that exists but has no schedule to pause", async () => {
    monitorRepository.scheduleOf.mockResolvedValue({ scheduleId: null });

    const conflict = await request(app).patch(`${MONITORS}/1001`).send({ state: "inactive" });

    expect(conflict.status).toBe(409);
    expect(conflict.body).toEqual({ status: "error", message: "Monitor 1001 has no schedule. Delete it and add it again." });
    expect(monitorRepository.setState).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/monitors/reset", () => {
  const RESET_KEY = "reset-key-for-tests";

  beforeEach(() => {
    vi.stubEnv("RESET_KEY", RESET_KEY);
  });

  it("deletes every cron and monitor, then adds the Catalyst sites, without a signed-in caller", async () => {
    monitorRepository.register.mockResolvedValue(storedMonitor);

    const reset = await request(app).post(`${MONITORS}/reset`).set("x-reset-key", RESET_KEY);

    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ status: "success", data: { monitorsDeleted: 2, monitorsAdded: 2 } });
    expect(monitorProbeJob.deleteSchedule).toHaveBeenCalledTimes(2);
    expect(monitorRepository.register.mock.calls.map(([monitor]) => monitor)).toEqual([
      { name: "Catalyst Console", url: "https://console.catalyst.zoho.com", checkIntervalSeconds: 60, alertThresholdMisses: 3, alertEmail: null },
      { name: "Catalyst", url: "https://catalyst.zoho.com", checkIntervalSeconds: 60, alertThresholdMisses: 3, alertEmail: null },
    ]);
    expect(monitorProbeJob.scheduleRepeating).toHaveBeenCalledTimes(2);
    expect(catalystAuth.init).toHaveBeenCalledExactlyOnceWith(expect.anything(), { scope: CatalystScope.Admin });
  });

  it("carries on past a schedule that will not delete, so one stale id cannot block every reset", async () => {
    monitorRepository.register.mockResolvedValue(storedMonitor);
    monitorProbeJob.deleteSchedule.mockRejectedValueOnce(new Error("cron not found"));

    const reset = await request(app).post(`${MONITORS}/reset`).set("x-reset-key", RESET_KEY);

    expect(reset.status).toBe(200);
    expect(monitorRepository.deleteAll).toHaveBeenCalled();
  });

  it.each([
    ["no key", undefined],
    ["a wrong key", "not-the-key"],
    ["a key of the wrong length", `${RESET_KEY}-and-more`],
  ])("answers 401 for %s, before touching Catalyst", async (_case, key) => {
    const attempt = request(app).post(`${MONITORS}/reset`);
    const rejection = await (key === undefined ? attempt : attempt.set("x-reset-key", key));

    expect(rejection.status).toBe(401);
    expect(rejection.body).toEqual({ status: "error", message: "A valid reset key is required." });
    expect(catalystAuth.init).not.toHaveBeenCalled();
    expect(monitorRepository.deleteAll).not.toHaveBeenCalled();
  });

  it("stays off when no reset key is configured", async () => {
    vi.stubEnv("RESET_KEY", "");

    const rejection = await request(app).post(`${MONITORS}/reset`).set("x-reset-key", "");

    expect(rejection.status).toBe(401);
    expect(monitorRepository.deleteAll).not.toHaveBeenCalled();
  });
});

describe("the alert routes", () => {
  it("are gone - alerts ride on the monitor detail", async () => {
    const alerts = await request(app).get(`${V1}/alerts`);

    expect(alerts.status).toBe(404);
  });
});

describe("GET /api/v1/monitors/summary", () => {
  it("answers the whole fleet in counts, not as a monitor id", async () => {
    const summary = { total: 3, inactive: 1, up: 1, down: 1, unknown: 0 };
    monitorRepository.summary.mockResolvedValue(summary);

    const answered = await request(app).get(`${MONITORS}/summary`);

    expect(answered.status).toBe(200);
    expect(answered.body).toEqual({ status: "success", data: summary });
    expect(monitorRepository.find).not.toHaveBeenCalled();
  });

  it("answers 401 without a signed-in user", async () => {
    currentUser.mockRejectedValue(new Error("invalid session"));

    const rejection = await request(app).get(`${MONITORS}/summary`);

    expect(rejection.status).toBe(401);
    expect(monitorRepository.summary).not.toHaveBeenCalled();
  });
});

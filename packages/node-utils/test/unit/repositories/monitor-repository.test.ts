import { describe, expect, it, vi } from "vitest";
import { Catalyst, type CatalystApp } from "@/catalyst/catalyst";
import { CatalystScope } from "@/enums/catalyst-scope";
import { ExecutionContext, runWithContext } from "@/framework/async-context";
import { MonitorRepository, type MonitorPage, type MonitorPageRequest } from "@/repositories/monitor-repository";
import type { Alert, Monitor, Probe } from "@repo/types/monitor";

// The SDK is replaced before zcql.ts and table.ts load it, so nothing leaves the process.
const { executeZcqlQuery, updateRow, getPagedRows } = vi.hoisted(() => ({
  executeZcqlQuery: vi.fn(),
  updateRow: vi.fn(async (): Promise<object> => ({})),
  getPagedRows: vi.fn(),
}));

vi.mock("@zcatalyst/datastore", () => ({
  Datastore: class {
    executeZCQLQuery = executeZcqlQuery;
    table = (): object => ({ updateRow, getPagedRows });
  },
}));

const NOW_MS = Date.UTC(2026, 10, 2, 12);

/** Runs repository code the way a route or the job would: inside a request whose Admin app
 *  is built. */
function asAdmin<T>(work: () => Promise<T>): Promise<T> {
  const catalyst = new Catalyst();
  catalyst.setApp(CatalystScope.Admin, {} as CatalystApp);
  const context = new ExecutionContext({ executionId: "execution-1", catalyst, extras: {} });
  return runWithContext(context, work);
}

/** The page statement and the count run in parallel, so each answer is picked by statement. */
function readPage(pageRequest: MonitorPageRequest, monitorColumns: object[]): Promise<MonitorPage> {
  executeZcqlQuery.mockImplementation(async (statement: string) =>
    statement.startsWith("SELECT COUNT")
      ? [{ Monitor: { ROWID: 42 } }]
      : monitorColumns.map((columns) => ({ Monitor: columns })),
  );
  return asAdmin(() => MonitorRepository.getPagedRecords(pageRequest));
}

/** A Monitor row as ZCQL answers it. A never-probed row has no `LATEST_PROBES` or
 *  `LATEST_ALERTS` key at all. */
function monitorColumns(stored: { latestProbes?: Probe[]; latestAlerts?: Alert[] } = {}): object {
  return {
    ROWID: "1001",
    NAME: "Checkout API",
    URL: "https://checkout.example.com/health",
    CHECK_INTERVAL_SECONDS: "60",
    ALERT_THRESHOLD_MISSES: "2",
    ALERT_EMAIL: "oncall@example.com",
    STATE: "active",
    HEALTH: "up",
    ...(stored.latestProbes && { LATEST_PROBES: JSON.stringify(stored.latestProbes.map(storedLatestProbe)) }),
    ...(stored.latestAlerts && {
      LATEST_ALERTS: JSON.stringify(stored.latestAlerts.map((alert) => [alert.firedAtMs, alert.emailedTo])),
    }),
  };
}

/** How `LATEST_PROBES` stores one: `[epoch ms, latencyMs, success, alertTriggered]`. */
function storedLatestProbe(probe: Probe): number[] {
  return [probe.checkedAtMs, probe.latencyMs, probe.success ? 1 : 0, probe.alertTriggered ? 1 : 0];
}

/** A monitor as the probe job hands it back, after one probe. */
function checkedMonitor(changes: Pick<Monitor, "health" | "latestProbes" | "latestAlerts">): Monitor {
  return {
    id: "1001",
    name: "Checkout API",
    url: "https://checkout.example.com/health",
    checkIntervalSeconds: 60,
    alertThresholdMisses: 2,
    alertEmail: "oncall@example.com",
    state: "active",
    ...changes,
  };
}

function latestProbe(success: boolean): Probe {
  return { checkedAtMs: NOW_MS, success, latencyMs: 42, alertTriggered: false };
}

describe("MonitorRepository.getPagedRecords", () => {
  it("selects only the list's columns, newest first, from row 1", async () => {
    await readPage({ pageNo: 1, perPage: 20 }, []);

    expect(executeZcqlQuery).toHaveBeenCalledWith(
      "SELECT ROWID, NAME, URL, CHECK_INTERVAL_SECONDS, ALERT_THRESHOLD_MISSES, ALERT_EMAIL, STATE, HEALTH, " +
        "LATEST_PROBES FROM Monitor ORDER BY CREATEDTIME DESC, ROWID DESC LIMIT 1, 20",
    );
    expect(executeZcqlQuery).toHaveBeenCalledWith("SELECT COUNT(ROWID) FROM Monitor");
  });

  it("starts a later page one row past the pages before it", async () => {
    await readPage({ pageNo: 3, perPage: 20 }, []);

    expect(executeZcqlQuery).toHaveBeenCalledWith(expect.stringMatching(/ LIMIT 41, 20$/));
  });

  it("drops a backslash, so it cannot unescape the doubled quote after it", async () => {
    await readPage({ pageNo: 1, perPage: 20, nameContains: "x\\'" }, []);

    expect(executeZcqlQuery).toHaveBeenCalledWith("SELECT COUNT(ROWID) FROM Monitor WHERE NAME LIKE '*x''*'");
  });

  it("filters both statements on a name containing the search, quotes doubled and stars dropped", async () => {
    await readPage({ pageNo: 1, perPage: 20, nameContains: "o'brien*" }, []);

    expect(executeZcqlQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM Monitor WHERE NAME LIKE '*o''brien*' ORDER BY CREATEDTIME DESC"),
    );
    expect(executeZcqlQuery).toHaveBeenCalledWith("SELECT COUNT(ROWID) FROM Monitor WHERE NAME LIKE '*o''brien*'");
  });

  it("maps a ZCQL row onto a monitor, times as epoch ms, and reads the count by position", async () => {
    const probes = [latestProbe(true)];
    const alerts: Alert[] = [{ firedAtMs: NOW_MS, emailedTo: "oncall@example.com" }];

    const page = await readPage({ pageNo: 1, perPage: 20 }, [monitorColumns({ latestProbes: probes, latestAlerts: alerts })]);

    expect(page).toEqual({
      monitors: [
        {
          id: "1001",
          name: "Checkout API",
          url: "https://checkout.example.com/health",
          checkIntervalSeconds: 60,
          alertThresholdMisses: 2,
          alertEmail: "oncall@example.com",
          state: "active",
          health: "up",
          latestProbes: probes,
          latestAlerts: alerts,
        },
      ],
      count: 42,
    });
  });

  it("reads a never-probed monitor, whose probes and alerts ZCQL leaves out, as empty", async () => {
    const { monitors } = await readPage({ pageNo: 1, perPage: 20 }, [monitorColumns()]);

    expect(monitors[0]).toMatchObject({ latestProbes: [], latestAlerts: [] });
  });
});

describe("MonitorRepository.saveCheckResult", () => {
  it("stores health, and each probe and alert as a compact tuple of epoch ms", async () => {
    const firing: Probe = { checkedAtMs: NOW_MS, success: false, latencyMs: 5000, alertTriggered: true };
    const alert: Alert = { firedAtMs: NOW_MS, emailedTo: "oncall@example.com" };

    await asAdmin(() =>
      MonitorRepository.saveCheckResult(checkedMonitor({ health: "down", latestProbes: [firing], latestAlerts: [alert] })),
    );

    expect(updateRow).toHaveBeenCalledExactlyOnceWith({
      ROWID: "1001",
      HEALTH: "down",
      LATEST_PROBES: `[[${NOW_MS},5000,0,1]]`,
      LATEST_ALERTS: `[[${NOW_MS},"oncall@example.com"]]`,
    });
  });

  it("drops the oldest alerts when long addresses would outgrow the text column", async () => {
    const longAddress = `${"a".repeat(240)}@example.com`;
    const alerts: Alert[] = Array.from({ length: 100 }, (_, index) => ({
      firedAtMs: NOW_MS + index * 60_000,
      emailedTo: longAddress,
    }));

    await asAdmin(() =>
      MonitorRepository.saveCheckResult(checkedMonitor({ health: "down", latestProbes: [], latestAlerts: alerts })),
    );

    const [[{ LATEST_ALERTS: storedAlerts }]] = updateRow.mock.calls as unknown as [[{ LATEST_ALERTS: string }]];
    const keptAlerts = JSON.parse(storedAlerts) as [number, string][];
    expect(storedAlerts.length).toBeLessThanOrEqual(10_000);
    expect(keptAlerts.length).toBeLessThan(100);
    expect(keptAlerts.at(-1)?.[0]).toBe(alerts.at(-1)?.firedAtMs);
  });
});

describe("MonitorRepository.scheduleOf", () => {
  it("reads the schedule id through ZCQL, which reports a failure instead of hiding it", async () => {
    executeZcqlQuery.mockResolvedValue([{ Monitor: { CRON_ID: "cron-9" } }]);

    expect(await asAdmin(() => MonitorRepository.scheduleOf("1001"))).toEqual({ scheduleId: "cron-9" });
    expect(executeZcqlQuery).toHaveBeenCalledExactlyOnceWith("SELECT CRON_ID FROM Monitor WHERE ROWID = 1001");
  });

  it("tells a monitor with no schedule from a monitor that does not exist", async () => {
    executeZcqlQuery.mockResolvedValueOnce([{ Monitor: { CRON_ID: "" } }]).mockResolvedValueOnce([]);

    expect(await asAdmin(() => MonitorRepository.scheduleOf("1001"))).toEqual({ scheduleId: null });
    expect(await asAdmin(() => MonitorRepository.scheduleOf("1002"))).toBeUndefined();
  });

  it("lets a failed read fail rather than read as no schedule", async () => {
    executeZcqlQuery.mockRejectedValue(new Error("datastore unavailable"));

    await expect(asAdmin(() => MonitorRepository.scheduleOf("1001"))).rejects.toThrow();
  });
});

describe("MonitorRepository.allScheduleIds", () => {
  it("reads every page, skipping monitors with no schedule", async () => {
    getPagedRows
      .mockResolvedValueOnce({ data: [{ ROWID: "1", CRON_ID: "cron-1" }, { ROWID: "2", CRON_ID: null }], next_token: "t2", more_records: true })
      .mockResolvedValueOnce({ data: [{ ROWID: "3", CRON_ID: "cron-3" }], more_records: false });

    expect(await asAdmin(() => MonitorRepository.allScheduleIds())).toEqual(["cron-1", "cron-3"]);
    expect(getPagedRows).toHaveBeenCalledTimes(2);
  });
});

describe("MonitorRepository.replaceSettings", () => {
  it("writes every setting and empties the history, in one update", async () => {
    await asAdmin(() =>
      MonitorRepository.replaceSettings("1001", {
        name: "Checkout",
        url: "https://checkout.example.com/ready",
        checkIntervalSeconds: 300,
        alertThresholdMisses: 5,
        alertEmail: null,
      }),
    );

    expect(updateRow).toHaveBeenCalledExactlyOnceWith({
      ROWID: "1001",
      NAME: "Checkout",
      URL: "https://checkout.example.com/ready",
      CHECK_INTERVAL_SECONDS: "300",
      ALERT_THRESHOLD_MISSES: "5",
      ALERT_EMAIL: "",
      HEALTH: "unknown",
      LATEST_PROBES: "",
      LATEST_ALERTS: "",
    });
  });
});

describe("MonitorRepository.setState", () => {
  it("sets the state and starts health over at unknown, in one statement", async () => {
    executeZcqlQuery.mockResolvedValue([{ Monitor: { ...monitorColumns(), STATE: "inactive", HEALTH: "unknown" } }]);

    const updated = await asAdmin(() => MonitorRepository.setState("1001", "inactive"));

    expect(executeZcqlQuery).toHaveBeenCalledExactlyOnceWith(
      "UPDATE Monitor SET STATE = 'inactive', HEALTH = 'unknown' WHERE ROWID = 1001",
    );
    expect(updated).toMatchObject({ state: "inactive", health: "unknown" });
  });
});

describe("MonitorRepository.summary", () => {
  it("counts the whole table in one grouped statement", async () => {
    executeZcqlQuery.mockResolvedValue([]);

    await asAdmin(() => MonitorRepository.summary());

    expect(executeZcqlQuery).toHaveBeenCalledExactlyOnceWith(
      "SELECT STATE, HEALTH, COUNT(ROWID) FROM Monitor GROUP BY STATE, HEALTH",
    );
  });

  it("counts active monitors by health and inactive ones apart, whatever their health", async () => {
    executeZcqlQuery.mockResolvedValue([
      { Monitor: { STATE: "active", HEALTH: "up", "COUNT(ROWID)": "4" } },
      { Monitor: { STATE: "active", HEALTH: "down", "COUNT(ROWID)": "2" } },
      { Monitor: { STATE: "active", HEALTH: "unknown", "COUNT(ROWID)": "1" } },
      { Monitor: { STATE: "inactive", HEALTH: "unknown", "COUNT(ROWID)": "3" } },
    ]);

    const summary = await asAdmin(() => MonitorRepository.summary());

    expect(summary).toEqual({ total: 10, inactive: 3, up: 4, down: 2, unknown: 1 });
  });

  it("reads the count under the key REST gives it, too", async () => {
    executeZcqlQuery.mockResolvedValue([{ Monitor: { ROWID: 1, HEALTH: "unknown", STATE: "active" } }]);

    const summary = await asAdmin(() => MonitorRepository.summary());

    expect(summary).toEqual({ total: 1, inactive: 0, up: 0, down: 0, unknown: 1 });
  });

  it("answers zeros for an empty table", async () => {
    executeZcqlQuery.mockResolvedValue([]);

    expect(await asAdmin(() => MonitorRepository.summary())).toEqual({
      total: 0,
      inactive: 0,
      up: 0,
      down: 0,
      unknown: 0,
    });
  });
});

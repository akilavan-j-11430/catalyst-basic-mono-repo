import { describe, expect, it } from "vitest";
import type { Alert, Monitor, Probe } from "@repo/types/monitor";
import { LATEST_ALERT_LIMIT, LATEST_PROBE_LIMIT } from "@repo/app-core/monitor-limits";
import { MonitorProbe, type CheckOutcome, type UrlCheck } from "@/monitor-probe";

const NOW_MS = Date.UTC(2026, 10, 2, 12);
const EARLIER_MS = Date.UTC(2026, 10, 1, 8);
const THRESHOLD = 3;

function monitor(overrides: Partial<Monitor> = {}): Monitor {
  return {
    id: "1001",
    name: "Checkout API",
    url: "https://checkout.example.com/health",
    checkIntervalSeconds: 60,
    alertThresholdMisses: THRESHOLD,
    alertEmail: "oncall@example.com",
    state: "active",
    health: "unknown",
    latestProbes: [],
    latestAlerts: [],
    ...overrides,
  };
}

function check(success: boolean): UrlCheck {
  return { checkedAtMs: NOW_MS, latencyMs: 42, success };
}

function stored(success: boolean): Probe {
  return { ...check(success), alertTriggered: false };
}

/** Feeds checks through `recordCheck` the way successive runs would: each run's monitor
 *  carries the latest probes the run before it saved. */
function runSequence(results: boolean[]): { alerts: number; latestProbes: Probe[] } {
  let alerts = 0;
  let latestProbes: Probe[] = [];
  for (const success of results) {
    const outcome = MonitorProbe.recordCheck(monitor({ latestProbes }), check(success));
    alerts += outcome.isAlertFired ? 1 : 0;
    latestProbes = outcome.updatedMonitor.latestProbes;
  }
  return { alerts, latestProbes };
}

/** A miss on a monitor whose latest probes are `before`, oldest first. */
function missAfter(before: boolean[], overrides: Partial<Monitor> = {}): CheckOutcome {
  return MonitorProbe.recordCheck(monitor({ latestProbes: before.map(stored), ...overrides }), check(false));
}

describe("MonitorProbe.recordCheck", () => {
  it("fires exactly one alert per down streak", () => {
    expect(runSequence([false, false, false, false, false]).alerts).toBe(1);
  });

  it("marks only the miss that fired the alert on the monitor's latest probes", () => {
    const { latestProbes } = runSequence([true, false, false, false, false]);
    expect(latestProbes.map((latestProbe) => latestProbe.alertTriggered)).toEqual([false, false, false, true, false]);
  });

  it("lets a recovery start a new streak that can alert again", () => {
    expect(runSequence([false, false, false, true, false, false, false]).alerts).toBe(2);
  });

  it("does not fire while the misses in a row are still under the threshold", () => {
    expect(missAfter([true, false]).isAlertFired).toBe(false);
  });

  it("keeps the probe on the monitor, flagged when it fired", () => {
    expect(missAfter([true, false, false]).updatedMonitor.latestProbes.at(-1)).toEqual({
      checkedAtMs: NOW_MS,
      success: false,
      latencyMs: 42,
      alertTriggered: true,
    });
  });

  it("appends the alert, with the address it was emailed to, after the earlier ones", () => {
    const earlier: Alert = { firedAtMs: EARLIER_MS, emailedTo: "oncall@example.com" };
    expect(missAfter([false, false], { latestAlerts: [earlier] }).updatedMonitor.latestAlerts).toEqual([
      earlier,
      { firedAtMs: NOW_MS, emailedTo: "oncall@example.com" },
    ]);
  });

  it("leaves the alerts alone when the probe fires nothing", () => {
    const earlier: Alert = { firedAtMs: EARLIER_MS, emailedTo: null };
    expect(MonitorProbe.recordCheck(monitor({ latestAlerts: [earlier] }), check(true)).updatedMonitor.latestAlerts).toEqual([
      earlier,
    ]);
  });

  it("addresses the alert's email to the monitor's alert email", () => {
    expect(missAfter([false, false]).alertNotice).toEqual({
      to: "oncall@example.com",
      monitorName: "Checkout API",
      message: "Checkout API missed 3 consecutive checks (https://checkout.example.com/health)",
      firedAtMs: NOW_MS,
    });
  });

  it("records the alert without an email on a monitor that has none", () => {
    const outcome = missAfter([false, false], { alertEmail: null });
    expect(outcome.isAlertFired).toBe(true);
    expect(outcome.alertNotice).toBeUndefined();
    expect(outcome.updatedMonitor.latestAlerts).toEqual([{ firedAtMs: NOW_MS, emailedTo: null }]);
  });

  it("is up after a success and stays up through misses under the threshold", () => {
    expect(MonitorProbe.recordCheck(monitor(), check(true)).updatedMonitor.health).toBe("up");
    expect(missAfter([true, false]).updatedMonitor.health).toBe("up");
  });

  it("is down from the miss that fires the alert, and while the misses go on", () => {
    expect(missAfter([true, false, false]).updatedMonitor.health).toBe("down");
    expect(missAfter([false, false, false, false]).updatedMonitor.health).toBe("down");
  });

  it("keeps only the latest probes and alerts on the monitor", () => {
    const fullAlerts: Alert[] = Array.from({ length: LATEST_ALERT_LIMIT }, () => ({
      firedAtMs: EARLIER_MS,
      emailedTo: null,
    }));
    const passing = Array.from({ length: LATEST_PROBE_LIMIT - 2 }, () => true);
    const outcome = missAfter([...passing, false, false], { latestAlerts: fullAlerts });
    expect(outcome.updatedMonitor.latestProbes).toHaveLength(LATEST_PROBE_LIMIT);
    expect(outcome.updatedMonitor.latestAlerts).toHaveLength(LATEST_ALERT_LIMIT);
    expect(outcome.updatedMonitor.latestAlerts.at(-1)?.firedAtMs).toBe(NOW_MS);
  });
});

describe("MonitorProbe.isAsRead", () => {
  const read = monitor({ latestProbes: [stored(true)] });

  it("is true for a monitor nobody touched while it was probed", () => {
    expect(MonitorProbe.isAsRead(read, { ...read })).toBe(true);
  });

  it.each([
    ["deleted", undefined],
    ["paused", { ...read, state: "inactive" as const }],
    ["edited to a new URL", { ...read, url: "https://checkout.example.com/ready" }],
    ["edited to a new threshold", { ...read, alertThresholdMisses: 1 }],
    ["edited, so its history was cleared", { ...read, latestProbes: [] }],
    ["saved by another run first", { ...read, latestProbes: [stored(true), { ...stored(false), checkedAtMs: NOW_MS + 60_000 }] }],
  ])("is false for a monitor %s meanwhile", (_case, current) => {
    expect(MonitorProbe.isAsRead(read, current)).toBe(false);
  });
});

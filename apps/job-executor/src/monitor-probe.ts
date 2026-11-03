import { Mail, type MailMessage } from "@repo/node-utils/catalyst/mail";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { logger } from "@repo/node-utils/framework/logger";
import { HttpRequestError } from "@repo/node-utils/errors/http-request-error";
import { HttpClient } from "@repo/node-utils/http/http-client";
import { MonitorRepository } from "@repo/node-utils/repositories/monitor-repository";
import { AlertMessage } from "@repo/app-core/alert-message";
import type { Monitor, Probe } from "@repo/types/monitor";
import { LATEST_ALERT_LIMIT, LATEST_PROBE_LIMIT } from "@repo/app-core/monitor-limits";
import { env } from "@/env";

/** One GET against a monitor's URL, before the alert decision marks it. */
export type UrlCheck = Omit<Probe, "alertTriggered">;

/** One fired alert, addressed to the monitor's alert email. */
export interface AlertNotice {
  to: string;
  monitorName: string;
  /** The alert's message - what the monitor's page shows. */
  message: string;
  firedAtMs: number;
}

/** What one check changes on its monitor, whether it fired the alert, and - when it fired
 *  on a monitor with an alert email - the email to send. */
export interface CheckOutcome {
  /** The monitor as this check left it: its new health, latest probes and alerts. */
  updatedMonitor: Monitor;
  isAlertFired: boolean;
  alertNotice?: AlertNotice;
}

/**
 * The probe job: each monitor's repeating schedule runs it at that monitor's interval. One
 * GET, then the monitor's health and the alert decision - edge-triggered, judged from the
 * monitor's latest probes. A miss counts the unbroken run of misses ending in it: the alert
 * fires when that run is exactly N (the alert threshold), so once per outage - a longer run
 * means it already fired. N is at most `LATEST_PROBE_LIMIT`, so the probes the monitor keeps
 * always reach far enough.
 *
 * Calls per run: one monitor read, one monitor update, and one email when the alert fires.
 */
export class MonitorProbe {
  private static readonly PROBE_TIMEOUT_MS = 5_000;
  private static readonly SENDER_NAME = "Lively";

  static async run(monitorId: string): Promise<void> {
    const monitor = await MonitorRepository.find(monitorId);
    // A paused monitor's schedule is paused and a deleted one's is gone; this catches a run
    // that was already queued when that happened.
    if (monitor === undefined || monitor.state === "inactive") {
      logger.info(`Monitor ${monitorId} is gone or inactive; nothing to probe.`);
      return;
    }
    const outcome = MonitorProbe.recordCheck(monitor, await MonitorProbe.getUrlCheck(monitor.url));
    await MonitorRepository.saveCheckResult(outcome.updatedMonitor);
    // After the save, so the monitor's page already shows the alert the email announces.
    if (outcome.alertNotice) {
      await MonitorProbe.sendAlert(outcome.alertNotice);
    }
  }

  /** Pure - no Catalyst call and no network - so the tests drive it directly. */
  static recordCheck(monitor: Monitor, check: UrlCheck): CheckOutcome {
    const consecutiveMisses = check.success ? 0 : 1 + MonitorProbe.getMissesSinceLastSuccess(monitor.latestProbes);
    const isAlertFired = consecutiveMisses === monitor.alertThresholdMisses;
    const firedAlerts = isAlertFired ? [{ firedAtMs: check.checkedAtMs, emailedTo: monitor.alertEmail }] : [];
    const updatedMonitor: Monitor = {
      ...monitor,
      // Down from the miss that fires the alert until the next success, as the alert judges it.
      health: consecutiveMisses >= monitor.alertThresholdMisses ? "down" : "up",
      latestProbes: [...monitor.latestProbes, { ...check, alertTriggered: isAlertFired }].slice(-LATEST_PROBE_LIMIT),
      latestAlerts: [...monitor.latestAlerts, ...firedAlerts].slice(-LATEST_ALERT_LIMIT),
    };
    if (!isAlertFired || monitor.alertEmail === null) {
      return { updatedMonitor, isAlertFired };
    }
    const alertNotice = MonitorProbe.toAlertNotice({ monitor, alertEmail: monitor.alertEmail, firedAtMs: check.checkedAtMs });
    return { updatedMonitor, isAlertFired, alertNotice };
  }

  private static toAlertNotice(alert: { monitor: Monitor; alertEmail: string; firedAtMs: number }): AlertNotice {
    return {
      to: alert.alertEmail,
      monitorName: alert.monitor.name,
      message: AlertMessage.of(alert.monitor, alert.monitor.alertThresholdMisses),
      firedAtMs: alert.firedAtMs,
    };
  }

  /** A failed or unconfigured send is logged and dropped rather than thrown: the alert is
   *  already saved on the monitor, and a mail problem must not fail the job and set Catalyst
   *  retrying a probe that already ran. */
  private static async sendAlert(notice: AlertNotice): Promise<void> {
    const from = env.optional("ALERT_SENDER_EMAIL");
    if (from === undefined) {
      logger.warn(`ALERT_SENDER_EMAIL is not set; the alert email to ${notice.to} was not sent.`);
      return;
    }
    try {
      await Mail.runIn(CatalystScope.Admin).send(MonitorProbe.toMailMessage(notice, from));
    } catch (error) {
      logger.error(`Alert email to ${notice.to} failed:`, error);
    }
  }

  private static toMailMessage(notice: AlertNotice, from: string): MailMessage {
    return {
      from,
      fromName: MonitorProbe.SENDER_NAME,
      to: notice.to,
      subject: `${notice.monitorName} is down`,
      text: `${notice.message}\n\nFired at ${new Date(notice.firedAtMs).toISOString()} (UTC).\n\nOne email is sent per outage; the next comes only after ${notice.monitorName} answers again and then goes down.`,
    };
  }

  /** How many probes at the end of the list are misses - all of them if none succeeded. */
  private static getMissesSinceLastSuccess(probes: Probe[]): number {
    const lastSuccessIndex = probes.map((probe) => probe.success).lastIndexOf(true);
    return probes.length - 1 - lastSuccessIndex;
  }

  /** A non-2xx and an unreachable host are both misses. */
  private static async getUrlCheck(url: string): Promise<UrlCheck> {
    const target = new URL(url);
    const client = new HttpClient({ baseUrl: target.origin, timeoutMs: MonitorProbe.PROBE_TIMEOUT_MS });
    const startedAtMs = Date.now();
    try {
      await client.get(target.pathname + target.search);
      return { checkedAtMs: startedAtMs, latencyMs: Date.now() - startedAtMs, success: true };
    } catch (error) {
      if (!(error instanceof HttpRequestError)) {
        throw error;
      }
      return { checkedAtMs: startedAtMs, latencyMs: Date.now() - startedAtMs, success: false };
    }
  }
}

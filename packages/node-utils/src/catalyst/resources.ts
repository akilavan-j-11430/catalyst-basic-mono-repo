import { Job } from "@/catalyst/job";
import { Table } from "@/catalyst/table";
import type { MonitorHealth, MonitorState } from "@repo/types/monitor";

/** Data Store answers every int column as a string, so the rows say so. */
/** An endpoint being watched, plus the read model of its latest probes - kept on the row
 *  so one read answers both the list and the uptime bars. */
export interface MonitorRow {
  NAME: string;
  URL: string;
  CHECK_INTERVAL_SECONDS: string;
  ALERT_THRESHOLD_MISSES: string;
  /** Written by the pause and resume route. */
  STATE: MonitorState;
  /** Written by the probe job on every probe, and reset to `unknown` when the state changes. */
  HEALTH: MonitorHealth;
  /** JSON array of the latest probes, oldest first, capped at `LATEST_PROBE_LIMIT`, each a
   *  compact tuple the monitor repository reads and writes. Unset until the first probe. */
  LATEST_PROBES?: string;
  /** JSON array of the epoch ms each alert fired at, oldest first, capped at
   *  `LATEST_ALERT_LIMIT`. Unset until the first probe. */
  LATEST_ALERTS?: string;
  /** Where alerts are emailed. Optional in the table only because rows registered before
   *  alerts were emailed have none; the API requires it on every new monitor. */
  ALERT_EMAIL?: string;
  /** The monitor's Periodic cron. Catalyst lists no cron made from code, so this is the
   *  only handle for pausing or deleting it. */
  CRON_ID?: string;
}

export const monitorTable = Table.create<MonitorRow>("Monitor");

/** Every probe job runs in one Function pool and lands in the `job-executor` function,
 *  which dispatches on the job name. */
const JOB_POOL = "LivelyJobPool";
const JOB_FUNCTION = "job-executor";

/** Probes one monitor and decides its alert. Each monitor runs it on its own Periodic
 *  cron, at its own interval. */
export const monitorProbeJob = Job.create<{ monitorId: string }>({
  jobName: "probe",
  aliasName: "monitor_probe",
  jobPoolName: JOB_POOL,
  jobTargetFunctionName: JOB_FUNCTION,
});

/** An HTTP endpoint to watch, as the register form submits it. */
export interface NewMonitor {
  name: string;
  url: string;
  checkIntervalSeconds: number;
  alertThresholdMisses: number;
  /** Where this monitor's alerts are emailed. `null` - only the monitors a reset adds -
   *  records its alerts without emailing them. */
  alertEmail: string | null;
}

/** Whether the monitor is being probed - `inactive` once the user pauses it. */
export type MonitorState = "active" | "inactive";

/** What the monitor's latest probes say - `unknown` until its first probe. Judged from the
 *  probes alone, so an inactive monitor keeps the health it had when it stopped. */
export type MonitorHealth = "up" | "down" | "unknown";

/** One of a monitor's newest probes, as the API sends it. */
export interface LatestProbe {
  /** ISO 8601 UTC, formatted by the API. */
  checkedAt: string;
  success: boolean;
  latencyMs: number;
  /** True on the miss that reached the threshold and fired the monitor's alert. */
  alertTriggered: boolean;
}

/** One alert a monitor fired, as the API sends it: when, and the address it was emailed
 *  to - `null` when the monitor had no alert email. Its miss count is the monitor's
 *  threshold, which never changes after registration. */
export interface LatestAlert {
  /** ISO 8601 UTC, formatted by the API. */
  firedAt: string;
  emailedTo: string | null;
}

/** What a monitor is, apart from the probes and alerts it keeps - the part the server's
 *  own monitor and every answer about one share. */
export interface RegisteredMonitor extends Omit<NewMonitor, "alertEmail"> {
  id: string;
  /** Null on a monitor registered before alerts were emailed - it alerts on screen only. */
  alertEmail: string | null;
  state: MonitorState;
  health: MonitorHealth;
}

/** A monitor as the list, register and pause answer it: `latestProbes` holds at most the
 *  newest `maxProbes`, oldest first, and the client draws `maxProbes` slots, leaving the
 *  rest empty. */
export interface ListedMonitor extends RegisteredMonitor {
  maxProbes: number;
  latestProbes: LatestProbe[];
}

/** One of a monitor's newest probes, as the server keeps it. Server-side only: times stay
 *  epoch ms until the API formats them into a `LatestProbe`. */
export interface Probe {
  checkedAtMs: number;
  success: boolean;
  latencyMs: number;
  /** True on the miss that reached the threshold and fired the monitor's alert. */
  alertTriggered: boolean;
}

/** One alert a monitor fired, as the server keeps it. Server-side only: the API formats it
 *  into a `LatestAlert`. */
export interface Alert {
  firedAtMs: number;
  emailedTo: string | null;
}

/** A monitor with everything it keeps - what the repository reads and the probe job
 *  updates. Server-side only: the API answers `ListedMonitor` or `MonitorDetail` instead. */
export interface Monitor extends RegisteredMonitor {
  /** Oldest first, at most `LATEST_PROBE_LIMIT` long. Empty until the first probe. */
  latestProbes: Probe[];
  /** Oldest first, at most `LATEST_ALERT_LIMIT` long. */
  latestAlerts: Alert[];
}

/** One monitor in full, for its page: every probe it keeps, and its alerts, oldest first. */
export interface MonitorDetail extends ListedMonitor {
  latestAlerts: LatestAlert[];
}

/** The whole fleet in counts. Health is counted over active monitors only - an inactive
 *  one's health has been reset to `unknown` and says nothing about its endpoint. */
export interface MonitorSummary {
  total: number;
  inactive: number;
  /** Active monitors by health. */
  up: number;
  down: number;
  unknown: number;
}

/** One GET to a monitor's URL made on request - "Check now". Recorded nowhere: it moves
 *  neither the monitor's health nor its alerts. */
export interface UrlCheckResult {
  /** True for a 2xx. */
  success: boolean;
  /** `null` when nothing came back - a timeout, a DNS failure, a refused connection. */
  statusCode: number | null;
  latencyMs: number;
  checkedAt: string;
}

/** What can change on a monitor once it is registered. */
export interface MonitorUpdate {
  state: MonitorState;
}

import { monitorTable, type MonitorRow } from "@/catalyst/resources";
import type { StoredRow } from "@/catalyst/table";
import { Zcql, type ZcqlColumns, type ZcqlRow } from "@/catalyst/zcql";
import { CatalystScope } from "@/enums/catalyst-scope";
import type {
  Alert,
  Monitor,
  MonitorState,
  MonitorSummary,
  NewMonitor,
  Probe,
} from "@repo/types/monitor";

/** Which page of the monitor list to read, optionally only names containing some text. */
export interface MonitorPageRequest {
  pageNo: number;
  perPage: number;
  nameContains?: string;
}

/** One page of the monitor list, and how many monitors match in all. */
export interface MonitorPage {
  monitors: Monitor[];
  count: number;
}

/** One latest probe as `LATEST_PROBES` stores it: `[checkedAt epoch ms, latencyMs, success,
 *  alertTriggered]`, flags as 1/0. Keyed objects would put 100 probes at ~9,700 of the text
 *  column's 10,000 characters; this puts them at ~2,500. */
type StoredLatestProbe = [number, number, 0 | 1, 0 | 1];

/** One alert as `LATEST_ALERTS` stores it: `[firedAt epoch ms, emailedTo]`. */
type StoredLatestAlert = [number, string | null];

/** The columns a monitor is built from - all the list reads, so it selects no more. */
type MonitorColumns = Pick<
  StoredRow<MonitorRow>,
  | "ROWID"
  | "NAME"
  | "URL"
  | "CHECK_INTERVAL_SECONDS"
  | "ALERT_THRESHOLD_MISSES"
  | "ALERT_EMAIL"
  | "STATE"
  | "HEALTH"
  | "LATEST_PROBES"
  | "LATEST_ALERTS"
>;

/**
 * Repository: every Data Store read and write of monitors, and the only code naming their
 * columns. Global by design - nothing filters on owner; access is to be controlled through
 * Catalyst.
 *
 * Catalyst's quirks stay here: ints arrive as strings, the latest probes and alerts as
 * compact JSON text, a 1-based `LIMIT`, and every id interpolated into ZCQL is checked to be
 * digits first.
 */
export class MonitorRepository {
  /** One `getPagedRows` page, for the reset; ZCQL's 300-row cap is above it. */
  private static readonly MAX_MONITORS = 200;
  private static readonly DIGITS = /^\d+$/;
  /** The `max_length` of the Monitor table's text columns. */
  private static readonly TEXT_COLUMN_LENGTH = 10_000;

  static isMonitorId(value: string): boolean {
    return MonitorRepository.DIGITS.test(value);
  }

  /** Newest first - ROWID breaks a tie in creation time, so paging never repeats or skips a
   *  row. Two statements in parallel: the page alone cannot say how many pages
   *  there are. ZCQL's `LIMIT <first>, <count>` counts its first row from 1. */
  static async getPagedRecords(page: MonitorPageRequest): Promise<MonitorPage> {
    const table = monitorTable;
    const firstRow = (page.pageNo - 1) * page.perPage + 1;
    const where = MonitorRepository.whereNameContains(page.nameContains);
    const [monitorRows, [countRow]] = await Promise.all([
      MonitorRepository.zcql(
        `SELECT ${table.column("ROWID")}, ${table.column("NAME")}, ${table.column("URL")}, ` +
          `${table.column("CHECK_INTERVAL_SECONDS")}, ${table.column("ALERT_THRESHOLD_MISSES")}, ` +
          `${table.column("ALERT_EMAIL")}, ${table.column("STATE")}, ${table.column("HEALTH")}, ` +
          `${table.column("LATEST_PROBES")}, ` +
          `${table.column("LATEST_ALERTS")} ` +
          `FROM ${table.name}${where} ORDER BY ${table.column("CREATEDTIME")} DESC, ${table.column("ROWID")} DESC LIMIT ${firstRow}, ${page.perPage}`,
      ),
      MonitorRepository.zcql(`SELECT COUNT(${table.column("ROWID")}) FROM ${table.name}${where}`),
    ]);
    return {
      monitors: monitorRows.map((monitorRow) =>
        MonitorRepository.toMonitor(MonitorRepository.monitorColumnsOf(monitorRow)),
      ),
      // The aggregate's key differs by path, so it is read by position.
      count: Number(Object.values(countRow?.[table.name] ?? {})[0] ?? 0),
    };
  }

  /** One statement over the whole table: at most six groups, one per state and health. */
  static async summary(): Promise<MonitorSummary> {
    const table = monitorTable;
    const groups = await MonitorRepository.zcql(
      `SELECT ${table.column("STATE")}, ${table.column("HEALTH")}, COUNT(${table.column("ROWID")}) ` +
        `FROM ${table.name} GROUP BY ${table.column("STATE")}, ${table.column("HEALTH")}`,
    );
    const summary: MonitorSummary = { total: 0, inactive: 0, up: 0, down: 0, unknown: 0 };
    for (const group of groups) {
      const columns = group[table.name] ?? {};
      const count = MonitorRepository.groupCount(columns);
      summary.total += count;
      if (columns[table.column("STATE")] === "inactive") {
        summary.inactive += count;
      } else {
        const health = columns[table.column("HEALTH")];
        summary[health === "up" || health === "down" ? health : "unknown"] += count;
      }
    }
    return summary;
  }

  static async find(monitorId: string): Promise<Monitor | undefined> {
    const storedMonitor = await monitorTable
      .runIn(CatalystScope.Admin)
      .getRow(MonitorRepository.digits(monitorId));
    return storedMonitor && MonitorRepository.toMonitor(storedMonitor);
  }

  static async register(monitor: NewMonitor): Promise<Monitor> {
    const storedMonitor = await monitorTable.runIn(CatalystScope.Admin).insertRow({
      NAME: monitor.name,
      URL: monitor.url,
      CHECK_INTERVAL_SECONDS: String(monitor.checkIntervalSeconds),
      ALERT_THRESHOLD_MISSES: String(monitor.alertThresholdMisses),
      ALERT_EMAIL: monitor.alertEmail ?? undefined,
      STATE: "active",
      HEALTH: "unknown",
    });
    return MonitorRepository.toMonitor(storedMonitor);
  }

  /** Overwrites what the monitor was registered with and empties its history - health back
   *  to unknown, no probes, no alerts. One update; the state and the schedule are untouched. */
  static async replaceSettings(monitorId: string, settings: NewMonitor): Promise<void> {
    await monitorTable.runIn(CatalystScope.Admin).updateRow({
      ROWID: MonitorRepository.digits(monitorId),
      NAME: settings.name,
      URL: settings.url,
      CHECK_INTERVAL_SECONDS: String(settings.checkIntervalSeconds),
      ALERT_THRESHOLD_MISSES: String(settings.alertThresholdMisses),
      // Read back as null by `toMonitor`.
      ALERT_EMAIL: settings.alertEmail ?? "",
      HEALTH: "unknown",
      LATEST_PROBES: "",
      LATEST_ALERTS: "",
    });
  }

  /** Keeps the monitor's schedule id, the only handle on its cron. */
  static async setScheduleId(monitorId: string, scheduleId: string): Promise<void> {
    await monitorTable
      .runIn(CatalystScope.Admin)
      .updateRow({ ROWID: MonitorRepository.digits(monitorId), CRON_ID: scheduleId });
  }

  /** Undefined when the monitor does not exist or was never scheduled. */
  static async scheduleIdOf(monitorId: string): Promise<string | undefined> {
    const storedMonitor = await monitorTable
      .runIn(CatalystScope.Admin)
      .getRow(MonitorRepository.digits(monitorId));
    return storedMonitor?.CRON_ID ?? undefined;
  }

  /** Every monitor's schedule id - for the reset, which removes them all. */
  static async allScheduleIds(): Promise<string[]> {
    const { rows } = await monitorTable
      .runIn(CatalystScope.Admin)
      .getPagedRows({ maxRows: MonitorRepository.MAX_MONITORS });
    return rows.flatMap((storedMonitor) => (storedMonitor.CRON_ID ? [storedMonitor.CRON_ID] : []));
  }

  /** Writes what a check changes on its monitor - its health, latest probes and alerts -
   *  in one update. */
  static async saveCheckResult(monitor: Monitor): Promise<void> {
    await monitorTable.runIn(CatalystScope.Admin).updateRow({
      ROWID: monitor.id,
      HEALTH: monitor.health,
      LATEST_PROBES: JSON.stringify(monitor.latestProbes.map(MonitorRepository.toStoredLatestProbe)),
      LATEST_ALERTS: MonitorRepository.storedLatestAlerts(monitor.latestAlerts),
    });
  }

  /** One statement: the UPDATE answers with the changed row, or nothing when no row matched.
   *  Health starts over at `unknown` until the next probe judges it. `state` is one of two
   *  literals, never user text, so it is safe to interpolate. */
  static async setState(monitorId: string, state: MonitorState): Promise<Monitor | undefined> {
    const [updatedRow] = await MonitorRepository.zcql(
      `UPDATE ${monitorTable.name} SET ${monitorTable.column("STATE")} = '${state}', ` +
        `${monitorTable.column("HEALTH")} = 'unknown' ` +
        `WHERE ${MonitorRepository.rowClause(monitorId)}`,
    );
    return updatedRow && MonitorRepository.toMonitor(MonitorRepository.monitorColumnsOf(updatedRow));
  }

  /** One statement, which also reports whether anything was there. Its probes and alerts
   *  are columns on the row, so they go with it. */
  static async delete(monitorId: string): Promise<boolean> {
    const [deleteResult] = await MonitorRepository.zcql(
      `DELETE FROM ${monitorTable.name} WHERE ${MonitorRepository.rowClause(monitorId)}`,
    );
    return MonitorRepository.deletedCount(deleteResult) > 0;
  }

  static async deleteAll(): Promise<number> {
    const [deleteResult] = await MonitorRepository.zcql(`DELETE FROM ${monitorTable.name}`);
    return MonitorRepository.deletedCount(deleteResult);
  }

  private static toMonitor(storedMonitor: MonitorColumns): Monitor {
    return {
      id: storedMonitor.ROWID,
      name: storedMonitor.NAME,
      url: storedMonitor.URL,
      checkIntervalSeconds: Number(storedMonitor.CHECK_INTERVAL_SECONDS),
      alertThresholdMisses: Number(storedMonitor.ALERT_THRESHOLD_MISSES),
      alertEmail: storedMonitor.ALERT_EMAIL === "" ? null : storedMonitor.ALERT_EMAIL,
      state: storedMonitor.STATE,
      health: storedMonitor.HEALTH,
      latestProbes: MonitorRepository.latestProbes(storedMonitor.LATEST_PROBES),
      latestAlerts: MonitorRepository.latestAlerts(storedMonitor.LATEST_ALERTS),
    };
  }

  /** Written only by `saveCheckResult`, so the JSON is trusted to be `StoredLatestProbe[]`.
   *  Unset until the first probe: the table API answers `null`, and ZCQL may leave the key out. */
  private static latestProbes(latestProbesJson: string | null | undefined): Probe[] {
    if (latestProbesJson === null || latestProbesJson === undefined || latestProbesJson === "") {
      return [];
    }
    const parsed: unknown = JSON.parse(latestProbesJson);
    return Array.isArray(parsed) ? (parsed as StoredLatestProbe[]).map(MonitorRepository.toProbe) : [];
  }

  /** Written only by `saveCheckResult`, so the JSON is trusted to be `StoredLatestAlert[]`. */
  private static latestAlerts(latestAlertsJson: string | null | undefined): Alert[] {
    if (latestAlertsJson === null || latestAlertsJson === undefined || latestAlertsJson === "") {
      return [];
    }
    const parsed: unknown = JSON.parse(latestAlertsJson);
    return Array.isArray(parsed)
      ? (parsed as StoredLatestAlert[]).map(([firedAtMs, emailedTo]) => ({ firedAtMs, emailedTo }))
      : [];
  }

  /** An alert email may be 255 characters, so 100 alerts can outgrow the text column, and
   *  Catalyst would reject the whole update - probes included. The oldest alerts are dropped
   *  until the rest fit. */
  private static storedLatestAlerts(latestAlerts: Alert[]): string {
    let storedAlerts: StoredLatestAlert[] = latestAlerts.map(({ firedAtMs, emailedTo }) => [firedAtMs, emailedTo]);
    let latestAlertsJson = JSON.stringify(storedAlerts);
    while (latestAlertsJson.length > MonitorRepository.TEXT_COLUMN_LENGTH) {
      storedAlerts = storedAlerts.slice(1);
      latestAlertsJson = JSON.stringify(storedAlerts);
    }
    return latestAlertsJson;
  }

  private static toStoredLatestProbe(probe: Probe): StoredLatestProbe {
    return [probe.checkedAtMs, probe.latencyMs, probe.success ? 1 : 0, probe.alertTriggered ? 1 : 0];
  }

  private static toProbe([checkedAtMs, latencyMs, success, alertTriggered]: StoredLatestProbe): Probe {
    return { checkedAtMs, success: success === 1, latencyMs, alertTriggered: alertTriggered === 1 };
  }

  /** A ZCQL row keeps the monitor's columns under the table's name. A statement selects its
   *  own columns, so the row is typed here, once. */
  private static monitorColumnsOf(monitorRow: ZcqlRow): MonitorColumns {
    return monitorRow[monitorTable.name] as unknown as MonitorColumns;
  }

  /** ZCQL answers `DELETE` with `{ Table: { DELETED_ROWS_COUNT } }`. */
  private static deletedCount(deleteResult: ZcqlRow | undefined): number {
    return Number(deleteResult?.[monitorTable.name]?.["DELETED_ROWS_COUNT"] ?? 0);
  }

  /** ZCQL's `LIKE` is case-insensitive and its wildcard is `*`, which has no escape, so a
   *  `*` in the search is dropped; a quote is escaped by doubling it. Nothing left to match
   *  on means no filter. */
  private static whereNameContains(nameContains: string | undefined): string {
    const literal = (nameContains ?? "").replaceAll("*", "").replaceAll("'", "''");
    if (literal === "") {
      return "";
    }
    return ` WHERE ${monitorTable.column("NAME")} LIKE '*${literal}*'`;
  }

  /** A group's count is its one column that is neither `STATE` nor `HEALTH`. Its key
   *  depends on the path - `COUNT(ROWID)` through the SDK, `ROWID` through REST - and ZCQL
   *  keeps no key order, so neither the name nor the position can be relied on. */
  private static groupCount(columns: ZcqlColumns): number {
    const [, count] =
      Object.entries(columns).find(
        ([key]) => key !== monitorTable.column("STATE") && key !== monitorTable.column("HEALTH"),
      ) ?? [];
    return Number(count ?? 0);
  }

  private static rowClause(monitorId: string): string {
    return `${monitorTable.column("ROWID")} = ${MonitorRepository.digits(monitorId)}`;
  }

  private static digits(value: string): string {
    if (!MonitorRepository.isMonitorId(value)) {
      throw new TypeError(`Not a Catalyst id: ${value}`);
    }
    return value;
  }

  private static zcql(statement: string): Promise<ZcqlRow[]> {
    return Zcql.runIn(CatalystScope.Admin).executeQuery(statement);
  }
}

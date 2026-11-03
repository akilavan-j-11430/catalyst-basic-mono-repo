/**
 * Everything this app asks of the monitor routes. A component imports from here and never
 * touches the client or a path.
 */
import { ApiPath } from "@repo/routing/api-path";
import type { PagedRecordResponse } from "@repo/types/api";
import type { ListedMonitor, MonitorDetail, MonitorSummary, MonitorUpdate, NewMonitor, UrlCheckResult } from "@repo/types/monitor";
import { api, pagedOf, recordOf, type QueryValue } from "@/services/api/client";

/** One page of the list, and where it sits in the whole. */
export type MonitorListPage = Pick<PagedRecordResponse<ListedMonitor>, "data" | "pageInfo">;

function monitorPath(id: string): string {
  return `${ApiPath.Monitors}/${encodeURIComponent(id)}`;
}

/** One page of monitors, newest first. A blank `name` lists them all; otherwise only names
 *  containing it, ignoring case. */
export async function fetchMonitors(search: { pageNo: number; name: string }): Promise<MonitorListPage> {
  const query: Record<string, QueryValue> = { pageNo: search.pageNo };
  if (search.name !== "") {
    query.name = search.name;
  }
  return pagedOf<ListedMonitor>(await api.get(ApiPath.Monitors, { query }));
}

/** The whole fleet in counts, whatever the list is filtered to. */
export async function fetchMonitorSummary(): Promise<MonitorSummary> {
  return recordOf<MonitorSummary>(await api.get(ApiPath.Monitors + ApiPath.Summary));
}

/** One monitor in full - every probe it keeps, and its alerts - for its drawer. */
export async function fetchMonitor(id: string): Promise<MonitorDetail> {
  return recordOf<MonitorDetail>(await api.get(monitorPath(id)));
}

export async function registerMonitor(monitor: NewMonitor): Promise<ListedMonitor> {
  return recordOf<ListedMonitor>(await api.post(ApiPath.Monitors, monitor));
}

/** Replaces every setting the monitor was registered with, and starts its history over. */
export async function editMonitor(id: string, settings: NewMonitor): Promise<ListedMonitor> {
  return recordOf<ListedMonitor>(await api.put(monitorPath(id), settings));
}

export async function updateMonitor(id: string, update: MonitorUpdate): Promise<ListedMonitor> {
  return recordOf<ListedMonitor>(await api.patch(monitorPath(id), update));
}

export async function deleteMonitor(id: string): Promise<void> {
  await api.delete(monitorPath(id));
}

/** Calls the monitor's URL once, now, and answers with what came back. Recorded nowhere,
 *  so no list or page changes. */
export async function checkMonitor(id: string): Promise<UrlCheckResult> {
  return recordOf<UrlCheckResult>(await api.post(monitorPath(id) + ApiPath.Check));
}

"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import type { ListedMonitor, MonitorDetail, MonitorState, NewMonitor } from "@repo/types/monitor";
import { checkMonitor, deleteMonitor, editMonitor, registerMonitor, updateMonitor, type MonitorListPage } from "@/services/monitors";
import { QueryKey } from "@/services/query-keys";

type LoadedPages = InfiniteData<MonitorListPage, number>;

/** Every loaded page of a list, with `edit` applied to each page's monitors. */
function editMonitors(
  loaded: LoadedPages | undefined,
  edit: (monitors: ListedMonitor[]) => ListedMonitor[],
): LoadedPages | undefined {
  return loaded && { ...loaded, pages: loaded.pages.map((page) => ({ ...page, data: edit(page.data) })) };
}

/** The pages with `monitor` at the top of the first, or `undefined` to leave them as they
 *  are - a list runs newest first, and only one whose search the name matches takes it. */
function withRegistered(loaded: LoadedPages, searchedName: string, monitor: ListedMonitor): LoadedPages | undefined {
  const [firstPage, ...laterPages] = loaded.pages;
  if (firstPage === undefined || !monitor.name.toLowerCase().includes(searchedName.toLowerCase())) {
    return undefined;
  }
  return { ...loaded, pages: [{ ...firstPage, data: [monitor, ...firstPage.data] }, ...laterPages] };
}

function replacing(updated: ListedMonitor): (monitors: ListedMonitor[]) => ListedMonitor[] {
  return (monitors) => monitors.map((monitor) => (monitor.id === updated.id ? updated : monitor));
}

/**
 * Writes an action's answer straight into the cached lists and the monitor's own page, then
 * refetches only the counts. `settle` comes first: it cancels any refetch already in flight,
 * which started before the action and would otherwise land after it and put back what the
 * action changed.
 */
function useMonitorCache() {
  const queryClient = useQueryClient();
  return {
    settle: async (monitorId: string): Promise<void> => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: QueryKey.monitorLists }),
        queryClient.cancelQueries({ queryKey: QueryKey.monitor(monitorId) }),
      ]);
    },
    editLists: (edit: (monitors: ListedMonitor[]) => ListedMonitor[]): void => {
      queryClient.setQueriesData<LoadedPages>({ queryKey: QueryKey.monitorLists }, (loaded) => editMonitors(loaded, edit));
    },
    addToLists: (registered: ListedMonitor): void => {
      for (const [queryKey, loaded] of queryClient.getQueriesData<LoadedPages>({ queryKey: QueryKey.monitorLists })) {
        // The key is QueryKey.monitorList(name), so its last segment is the search.
        const added = loaded && withRegistered(loaded, String(queryKey.at(-1)), registered);
        if (added) queryClient.setQueryData(queryKey, added);
      }
    },
    editPage: (monitorId: string, edit: (detail: MonitorDetail) => MonitorDetail): void => {
      queryClient.setQueryData<MonitorDetail>(QueryKey.monitor(monitorId), (detail) => detail && edit(detail));
    },
    dropPage: (monitorId: string): void => queryClient.removeQueries({ queryKey: QueryKey.monitor(monitorId) }),
    refreshCounts: (): void => void queryClient.invalidateQueries({ queryKey: QueryKey.monitorSummary }),
  };
}

function useSetState() {
  const cache = useMonitorCache();
  return useMutation({
    mutationFn: ({ id, state }: { id: string; state: MonitorState }) => updateMonitor(id, { state }),
    onSuccess: async (updated) => {
      await cache.settle(updated.id);
      cache.editLists(replacing(updated));
      // State and health only: the answer carries a list row's probes, fewer than the page keeps.
      cache.editPage(updated.id, (detail) => ({ ...detail, state: updated.state, health: updated.health }));
      cache.refreshCounts();
    },
  });
}

function useEdit() {
  const cache = useMonitorCache();
  return useMutation({
    mutationFn: ({ id, settings }: { id: string; settings: NewMonitor }) => editMonitor(id, settings),
    onSuccess: async (edited) => {
      await cache.settle(edited.id);
      cache.editLists(replacing(edited));
      // Its history started over, so the page keeps only its own probe capacity.
      cache.editPage(edited.id, (detail) => ({ ...edited, maxProbes: detail.maxProbes, latestAlerts: [] }));
      cache.refreshCounts();
    },
  });
}

function useRemove() {
  const cache = useMonitorCache();
  return useMutation({
    mutationFn: deleteMonitor,
    onSuccess: async (_, deletedId) => {
      await cache.settle(deletedId);
      cache.editLists((monitors) => monitors.filter((monitor) => monitor.id !== deletedId));
      // Gone for good, so its page must not refetch it into a 404.
      cache.dropPage(deletedId);
      cache.refreshCounts();
    },
  });
}

function useRegister() {
  const cache = useMonitorCache();
  return useMutation({
    mutationFn: registerMonitor,
    onSuccess: async (registered) => {
      await cache.settle(registered.id);
      cache.addToLists(registered);
      cache.refreshCounts();
    },
  });
}

/** Every monitor action - the confirmed ones from `MonitorActionDialog`, and the form's
 *  register and edit. Success says nothing - the list shows it; only a failure toasts,
 *  through the query client. A check changes nothing: recorded nowhere, its popup shows
 *  the answer. */
export function useMonitorActions() {
  const check = useMutation({ mutationFn: checkMonitor });
  return { check, setState: useSetState(), edit: useEdit(), remove: useRemove(), register: useRegister() };
}

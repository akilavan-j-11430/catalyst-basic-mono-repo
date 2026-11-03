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

/** Every monitor action - the confirmed ones from `MonitorActionDialog`, and the form's
 *  register and edit. Success says nothing - the list shows it; only a failure toasts,
 *  through the query client. Pausing and editing write the server's answer into every
 *  loaded page and the monitor's own, a delete drops the row and a registration adds it -
 *  each then refetches only the counts. A check changes nothing; its popup shows the answer. */
export function useMonitorActions() {
  const queryClient = useQueryClient();
  const showInLists = (updated: ListedMonitor): void => {
    queryClient.setQueriesData<LoadedPages>({ queryKey: QueryKey.monitorLists }, (loaded) =>
      editMonitors(loaded, (monitors) => monitors.map((monitor) => (monitor.id === updated.id ? updated : monitor))),
    );
  };

  // Its answer is shown in the popup and recorded nowhere, so no cache changes.
  const check = useMutation({ mutationFn: checkMonitor });

  const setState = useMutation({
    mutationFn: ({ id, state }: { id: string; state: MonitorState }) => updateMonitor(id, { state }),
    onSuccess: (updated) => {
      showInLists(updated);
      // State and health only: the answer carries a list row's probes, fewer than the page keeps.
      queryClient.setQueryData<MonitorDetail>(QueryKey.monitor(updated.id), (detail) =>
        detail && { ...detail, state: updated.state, health: updated.health },
      );
      void queryClient.invalidateQueries({ queryKey: QueryKey.monitorSummary });
    },
  });

  const remove = useMutation({
    mutationFn: deleteMonitor,
    onSuccess: (_, deletedId) => {
      queryClient.setQueriesData<LoadedPages>({ queryKey: QueryKey.monitorLists }, (loaded) =>
        editMonitors(loaded, (monitors) => monitors.filter((monitor) => monitor.id !== deletedId)),
      );
      // Gone for good, so its page must not refetch it into a 404.
      queryClient.removeQueries({ queryKey: QueryKey.monitor(deletedId) });
      // The list is already right; only the counts need the server.
      void queryClient.invalidateQueries({ queryKey: QueryKey.monitorSummary });
    },
  });

  const register = useMutation({
    mutationFn: registerMonitor,
    onSuccess: (registered) => {
      const lists = queryClient.getQueriesData<LoadedPages>({ queryKey: QueryKey.monitorLists });
      for (const [queryKey, loaded] of lists) {
        // The key is QueryKey.monitorList(name), so its last segment is the search.
        const added = loaded && withRegistered(loaded, String(queryKey.at(-1)), registered);
        if (added) {
          queryClient.setQueryData(queryKey, added);
        }
      }
      void queryClient.invalidateQueries({ queryKey: QueryKey.monitorSummary });
    },
  });

  const edit = useMutation({
    mutationFn: ({ id, settings }: { id: string; settings: NewMonitor }) => editMonitor(id, settings),
    onSuccess: (edited) => {
      showInLists(edited);
      // Its history started over, so the page keeps only its own probe capacity.
      queryClient.setQueryData<MonitorDetail>(QueryKey.monitor(edited.id), (detail) =>
        detail && { ...edited, maxProbes: detail.maxProbes, latestAlerts: [] },
      );
      void queryClient.invalidateQueries({ queryKey: QueryKey.monitorSummary });
    },
  });

  return { check, setState, remove, register, edit };
}

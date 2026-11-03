"use client";

import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import type { MonitorSummary } from "@repo/types/monitor";
import { ColumnHeads, MonitorList } from "@/components/monitoring/monitor-list";
import { MonitorFormPanel } from "@/components/monitoring/monitor-form";
import { GLYPH_LABEL, StatusGlyph, type MonitorGlyph } from "@/components/monitoring/status-glyph";
import { PAGE_COLUMN } from "@/components/shared/app-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContentLoader } from "@/components/shared/content-loader";
import { cn } from "@/lib/utils";
import { fetchMonitorSummary, fetchMonitors } from "@/services/monitors";
import { LIVE_REFRESH_MS, QueryKey } from "@/services/query-keys";

const SEARCH_PAUSE_MS = 300;

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** The band's four counts, in the order they read: health of the active monitors, then
 *  the paused ones. */
const COUNTS: Array<{ glyph: MonitorGlyph; count: (summary: MonitorSummary) => number }> = [
  { glyph: "up", count: (summary) => summary.up },
  { glyph: "down", count: (summary) => summary.down },
  { glyph: "paused", count: (summary) => summary.inactive },
  { glyph: "unknown", count: (summary) => summary.unknown },
];

/** " - 2 paused", or nothing when none are. */
function pausedNote(inactive: number): string {
  return inactive === 0 ? "" : ` - ${inactive} paused`;
}

/** Leads with what matters most: an outage, then a wait, then the all-clear. An unchecked
 *  monitor is waiting, never counted as not answering. */
function bandText(summary: MonitorSummary): { headline: string; detail: string } {
  const active = summary.total - summary.inactive;
  if (summary.total === 0) {
    return { headline: "Nothing watched yet.", detail: "Add an endpoint to start checking it." };
  }
  if (active === 0) {
    return { headline: "All endpoints are paused.", detail: `${summary.inactive} paused - resume one to check it again.` };
  }
  if (summary.down > 0) {
    const waiting = summary.unknown === 0 ? "" : ` - ${summary.unknown} waiting`;
    return {
      headline: `${plural(summary.down, "endpoint")} down.`,
      detail: `${summary.up} of ${active} up${waiting}${pausedNote(summary.inactive)}.`,
    };
  }
  if (summary.up === 0) {
    return {
      headline: "Waiting for the first check.",
      detail: `${plural(active, "endpoint")} - results appear within a minute${pausedNote(summary.inactive)}.`,
    };
  }
  if (summary.up === active) {
    return { headline: "Every endpoint is up.", detail: summary.inactive === 0 ? "" : `${summary.inactive} paused.` };
  }
  return {
    headline: `${summary.up} of ${plural(active, "endpoint")} up.`,
    detail: `${summary.unknown} waiting for a first check${pausedNote(summary.inactive)}.`,
  };
}

/** The fleet's counts, read by both the instrument strip and the list's title. */
function useMonitorSummary(): MonitorSummary | undefined {
  return useQuery({ queryKey: QueryKey.monitorSummary, queryFn: fetchMonitorSummary, refetchInterval: LIVE_REFRESH_MS })
    .data;
}

/** The control-room strip: four counts read first, as instruments, and the sentence that
 *  sums them up beside them. Every monitor, whatever the list below is searched or
 *  scrolled to. A down count above zero takes the down colour, so an outage is the first
 *  thing seen. */
function StatusBand() {
  const summary = useMonitorSummary();
  const text = summary === undefined ? undefined : bandText(summary);
  return (
    <section aria-label="Fleet status" className="bg-graphite text-graphite-foreground">
      <div className={`${PAGE_COLUMN} grid gap-y-5 py-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-x-12`}>
        <dl className="grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-graphite-rule">
          {COUNTS.map(({ glyph, count }) => (
            <div key={glyph} className="flex flex-col gap-1 sm:px-6 sm:first:pl-0">
              <dt className="flex items-center gap-1.5 text-xs text-graphite-muted">
                <StatusGlyph glyph={glyph} className="size-2.5" />
                {GLYPH_LABEL[glyph]}
              </dt>
              <dd
                className={cn(
                  "font-mono text-3xl leading-none tabular-nums",
                  glyph === "down" && summary !== undefined && summary.down > 0 && "text-status-down",
                )}
              >
                {summary === undefined ? <span aria-hidden className="skeleton inline-block h-7 w-8 align-middle" /> : count(summary)}
              </dd>
            </div>
          ))}
        </dl>
        <div className="min-w-0 lg:text-right">
          <p className="text-base font-semibold sm:text-lg">{text?.headline ?? "Reading your monitors..."}</p>
          {text?.detail && <p className="mt-1 text-sm text-graphite-muted">{text.detail}</p>}
        </div>
      </div>
    </section>
  );
}

/** The page's one list. Its head - the title, the search, the register button and the
 *  column names - stays
 *  under the fixed app header while more monitors load beneath it; the bleed classes undo
 *  the page gutter so its solid surface covers the rows scrolling past at every width. */
function MonitorsSection({ search, onWatch, showColumns, children }: { search: ReactNode; onWatch: () => void; showColumns: boolean; children: ReactNode }) {
  const total = useMonitorSummary()?.total;
  return (
    <section aria-labelledby="monitors-heading" className={`${PAGE_COLUMN} flex-1 pb-10`}>
      <div className="sticky top-[calc(4rem+1px)] z-20 -mx-4 bg-background px-4 pt-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="monitors-heading" className="flex items-baseline gap-2 text-sm font-semibold">
            Monitors
            {total !== undefined && <span className="font-mono text-xs font-normal text-muted-foreground tabular-nums">{total}</span>}
          </h2>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {search}
            {/* The label drops below sm so the row never overflows; aria-label keeps the name. */}
            <Button size="sm" aria-label="Watch an endpoint" onClick={onWatch} className="shrink-0">
              <Plus aria-hidden />
              <span className="hidden sm:inline">Watch an endpoint</span>
            </Button>
          </div>
        </div>
        {showColumns && <ColumnHeads />}
      </div>
      {children}
    </section>
  );
}

/** Searches as the person types, once they pause - every search is a server read, so a
 *  burst of keystrokes costs one. Enter searches at once; emptying the box lists every
 *  monitor again. */
function MonitorSearch({ onSearch }: { onSearch: (name: string) => void }) {
  const { register, control, handleSubmit } = useForm<{ name: string }>({ defaultValues: { name: "" } });
  const typed = useWatch({ control, name: "name" });
  useEffect(() => {
    const pause = setTimeout(() => onSearch(typed.trim()), SEARCH_PAUSE_MS);
    return () => clearTimeout(pause);
  }, [typed, onSearch]);
  return (
    <form role="search" onSubmit={handleSubmit(({ name }) => onSearch(name.trim()))} className="min-w-0 flex-1 sm:w-64 sm:flex-none">
      <Input type="search" placeholder="Search by name" aria-label="Search monitors by name" maxLength={100} {...register("name")} />
    </form>
  );
}

/** Asks for the next page once the end of the list scrolls into view, a little early so it
 *  usually arrives before the person gets there. */
function LoadMore({ hasMore, loading, onLoadMore }: { hasMore: boolean; loading: boolean; onLoadMore: () => void }) {
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinel.current;
    if (element === null || !hasMore || loading) return;
    const observer = new IntersectionObserver(([entry]) => entry?.isIntersecting && onLoadMore(), {
      rootMargin: "200px",
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);
  return (
    <div ref={sentinel} className="pt-4">
      {loading && <ContentLoader label="Loading more monitors..." className="py-6" />}
    </div>
  );
}

/** Every page loaded so far, for the name searched. A new search starts again from the
 *  first page; the live refresh re-reads each page already loaded. */
function useMonitorPages() {
  const [searchedName, setSearchedName] = useState("");
  const monitorPages = useInfiniteQuery({
    queryKey: QueryKey.monitorList(searchedName),
    queryFn: ({ pageParam }) => fetchMonitors({ pageNo: pageParam, name: searchedName }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.pageInfo.hasMore ? lastPage.pageInfo.page + 1 : undefined),
    refetchInterval: LIVE_REFRESH_MS,
    placeholderData: keepPreviousData,
  });
  // A monitor added to the top of the first page shifts the server's pages down by one, so
  // a page fetched before the next refresh can repeat a row; the first copy wins.
  const loadedMonitors = monitorPages.data?.pages.flatMap((page) => page.data);
  const monitors = loadedMonitors?.filter((monitor, index) => loadedMonitors.findIndex(({ id }) => id === monitor.id) === index);
  // While a new search loads, the last results are only a placeholder - the list hides
  // them and shows that it is searching instead.
  return { monitorPages, monitors, searchedName, searching: monitorPages.isPlaceholderData, search: setSearchedName };
}

export function MonitorDashboard() {
  const { monitorPages, monitors, searchedName, searching, search } = useMonitorPages();
  const [watching, setWatching] = useState(false);
  const { fetchNextPage } = monitorPages;
  const loadMore = useCallback(() => void fetchNextPage(), [fetchNextPage]);
  return (
    <>
      <StatusBand />
      <MonitorsSection
        search={<MonitorSearch onSearch={search} />}
        onWatch={() => setWatching(true)}
        showColumns={!searching && monitors !== undefined && monitors.length > 0}
      >
        <MonitorList monitors={monitors} searchedName={searchedName} searching={searching} />
        <LoadMore hasMore={monitorPages.hasNextPage} loading={monitorPages.isFetchingNextPage} onLoadMore={loadMore} />
      </MonitorsSection>
      <MonitorFormPanel open={watching} onClose={() => setWatching(false)} />
    </>
  );
}

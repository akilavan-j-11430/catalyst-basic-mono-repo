"use client";

import { MoreHorizontal, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { ClientPath } from "@repo/routing/client-path";
import type { ListedMonitor } from "@repo/types/monitor";
import { LIST_PROBE_SLOTS } from "@repo/app-core/monitor-limits";
import { StatusGlyph, glyphOf } from "@/components/monitoring/status-glyph";
import { UptimeStrip } from "@/components/monitoring/uptime-strip";
import { MonitorActionDialog, type MonitorActionRequest } from "@/components/monitoring/monitor-action-dialog";
import { MonitorFormPanel } from "@/components/monitoring/monitor-form";
import { ContentLoader } from "@/components/shared/content-loader";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProbeStats } from "@/lib/probe-stats";
import { cn } from "@/lib/utils";
import { DisplayTime } from "@/lib/display-time";

interface MonitorListProps {
  monitors: ListedMonitor[] | undefined;
  /** The name searched for, blank when listing every monitor - an empty result then means
   *  nothing matched rather than nothing watched. */
  searchedName: string;
  /** True while a new search loads - the table is hidden until its results arrive. */
  searching: boolean;
}

/** One template for the header and every row, so the columns line up - from `lg`, where
 *  there is room for them. Below that a row stacks and its figures share one line. */
const ROW_COLUMNS =
  "lg:grid-cols-[minmax(0,1fr)_4.5rem_5.5rem_11.5rem_12rem_auto] xl:grid-cols-[minmax(0,1fr)_5rem_5.5rem_11.5rem_16rem_auto]";

function lastChecked(monitor: ListedMonitor): string {
  const latest = monitor.latestProbes.at(-1);
  return latest ? DisplayTime.format(latest.checkedAt) : "Never";
}

/** The figures a row carries, each labelled for screen readers and on small screens. */
function rowFigures(monitor: ListedMonitor): Array<[string, string]> {
  return [
    ["Uptime", ProbeStats.uptime(monitor.latestProbes, 1)],
    ["Avg", ProbeStats.averageLatency(monitor.latestProbes)],
    ["Last checked", lastChecked(monitor)],
  ];
}

/** The table's head: a tinted band with every label over its column - numbers
 *  right-aligned like the numbers below. The dashboard pins it, with the title and search,
 *  under the app header. The negative margin and matching padding are the rows' own, so
 *  the labels stay on the row grid. Wide screens only: below `lg` a row stacks. */
export function ColumnHeads() {
  return (
    <div
      aria-hidden
      className={cn(
        "-mx-3 mt-3 hidden gap-x-5 rounded-md bg-muted px-3 py-2 text-xs font-medium text-muted-foreground lg:grid",
        ROW_COLUMNS,
      )}
    >
      <span className="pl-5">Monitor</span>
      <span>Uptime</span>
      <span>Avg latency</span>
      <span>Last checked</span>
      <span>Last {LIST_PROBE_SLOTS} checks</span>
      <span className="w-11">
        <span className="sr-only">Actions</span>
      </span>
    </div>
  );
}

/** One "more" button per row, always visible - never revealed on hover, so touch and
 *  keyboard users get it too. Its menu holds the actions; each still asks in a popup before
 *  it runs. The menu is not modal: it closes as the popup opens, and a modal menu would
 *  hand focus back to a trigger the popup has already taken it from. */
function RowActions({ monitor }: { monitor: ListedMonitor }) {
  const [request, setRequest] = useState<MonitorActionRequest | null>(null);
  const [editing, setEditing] = useState(false);
  const isActive = monitor.state === "active";
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11" aria-label={`Actions for ${monitor.name}`} title="Actions">
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setRequest({ action: "check", monitor })}>
            <RefreshCw aria-hidden />
            Check now
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRequest({ action: isActive ? "pause" : "resume", monitor })}>
            {isActive ? <Pause aria-hidden /> : <Play aria-hidden />}
            {isActive ? "Pause" : "Resume"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil aria-hidden />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setRequest({ action: "delete", monitor })}>
            <Trash2 aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MonitorActionDialog request={request} onClose={() => setRequest(null)} />
      <MonitorFormPanel open={editing} monitor={monitor} onClose={() => setEditing(false)} />
    </>
  );
}

function MonitorRow({ monitor }: { monitor: ListedMonitor }) {
  const glyph = glyphOf(monitor);
  return (
    // `layout` slides the rows below into a deleted row's place instead of jumping.
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className={cn(
        "relative -mx-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 rounded-md px-3 py-3 transition-colors duration-150 hover:bg-muted/50",
        ROW_COLUMNS,
      )}
    >
      {/* A rail only on a down monitor, so in a long healthy list the outages are the only
          rows marked. The dot before the name carries every state. */}
      {glyph === "down" && <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-status-down" />}
      <Link href={`${ClientPath.Monitors}/${encodeURIComponent(monitor.id)}`} className="min-w-0 rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <span className="flex items-center gap-2">
          <StatusGlyph glyph={glyph} />
          <span className="truncate font-medium hover:underline hover:underline-offset-4">{monitor.name}</span>
        </span>
        <span className="mt-1 block truncate pl-5 font-mono text-xs text-muted-foreground">{monitor.url}</span>
      </Link>
      {rowFigures(monitor).map(([label, value]) => (
        <span key={label} className="hidden font-mono text-sm tabular-nums lg:block">
          <span className="sr-only">{label} </span>
          {value}
        </span>
      ))}
      <p className="col-span-2 font-mono text-xs text-muted-foreground tabular-nums lg:hidden">
        {rowFigures(monitor).map(([label, value]) => `${label} ${value}`).join(" - ")}
      </p>
      <UptimeStrip probes={monitor.latestProbes} slots={monitor.maxProbes} className="col-span-2 w-full lg:col-span-1" />
      <div className="col-start-2 row-start-1 lg:col-start-auto lg:row-start-auto">
        <RowActions monitor={monitor} />
      </div>
    </motion.li>
  );
}

/** What is empty and why it matters. "Watch an endpoint" beside the search is the next
 *  action, so it is not repeated here. */
function EmptyState() {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <p className="font-medium">No endpoints yet.</p>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Add a URL and Lively probes it on your schedule, emailing you when it stops answering.
      </p>
    </div>
  );
}

function NoMatch({ searchedName }: { searchedName: string }) {
  return (
    <div className="flex flex-col items-center py-14 text-center">
      <p className="font-medium [overflow-wrap:anywhere]">{`No monitors match "${searchedName}".`}</p>
      <p className="mt-1 text-sm text-muted-foreground">Names are matched anywhere, ignoring case.</p>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul aria-label="Loading monitors" className="mt-1">
      {[0, 1, 2].map((row) => (
        <li key={row} className={cn("-mx-3 grid grid-cols-[minmax(0,1fr)] items-center gap-x-5 gap-y-2 px-3 py-3", ROW_COLUMNS)}>
          <div className="space-y-2">
            <div className="h-4 w-40 skeleton" />
            <div className="h-3 w-64 max-w-full skeleton" />
          </div>
          <div className="hidden h-4 w-12 skeleton lg:block" />
          <div className="hidden h-4 w-14 skeleton lg:block" />
          <div className="hidden h-4 w-14 skeleton lg:block" />
          <div className="h-6 w-full skeleton" />
        </li>
      ))}
    </ul>
  );
}

/** The dashboard's Monitors section heads it, so the list carries no heading of its own. */
export function MonitorList({ monitors, searchedName, searching }: MonitorListProps) {
  // A new search hides the table outright until its own results arrive, rather than
  // leaving the last search's rows on screen.
  if (searching) {
    return <ContentLoader label="Searching..." className="py-14" />;
  }
  return (
    <div className="min-w-0">
      {monitors === undefined && <ListSkeleton />}
      {monitors?.length === 0 && (searchedName === "" ? <EmptyState /> : <NoMatch searchedName={searchedName} />)}
      {monitors !== undefined && monitors.length > 0 && (
        <ul className="mt-1">
          <AnimatePresence>
            {monitors.map((monitor) => (
              <MonitorRow key={monitor.id} monitor={monitor} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

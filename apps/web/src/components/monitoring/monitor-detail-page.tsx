"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Pause, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ClientPath } from "@repo/routing/client-path";
import { AlertMessage } from "@repo/app-core/alert-message";
import type { LatestProbe, MonitorDetail } from "@repo/types/monitor";
import { LATEST_ALERT_LIMIT } from "@repo/app-core/monitor-limits";
import { LatencyChart } from "@/components/monitoring/latency-chart";
import { MonitorActionDialog, type MonitorActionRequest } from "@/components/monitoring/monitor-action-dialog";
import { MonitorFormPanel } from "@/components/monitoring/monitor-form";
import { HEALTH_LABEL, STATE_LABEL, StatusGlyph, glyphOf } from "@/components/monitoring/status-glyph";
import { UptimeStrip } from "@/components/monitoring/uptime-strip";
import { PAGE_COLUMN } from "@/components/shared/app-frame";
import { NotFoundState } from "@/components/shared/not-found-state";
import { PageLoader } from "@/components/shared/page-loader";
import { Button } from "@/components/ui/button";
import { ProbeStats } from "@/lib/probe-stats";
import { DisplayTime } from "@/lib/display-time";
import { RelativeTime } from "@/lib/relative-time";
import { ApiError } from "@/services/api/client";
import { fetchMonitor } from "@/services/monitors";
import { LIVE_REFRESH_MS, QueryKey } from "@/services/query-keys";

const FAILURE_ROWS = 50;
/** More than a row's strip, fewer than the monitor keeps, so each bar stays readable. The
 *  latency chart below it covers the same checks. */
const PAGE_STRIP_SLOTS = 50;

/** The misses since the last success, counted back through the latest probes - which only
 *  reach so far, so a streak that fills them is shown as "at least". */
function streak(monitor: MonitorDetail): string {
  const lastSuccess = monitor.latestProbes.findLastIndex((probe) => probe.success);
  const misses = monitor.latestProbes.length - 1 - lastSuccess;
  return misses === monitor.maxProbes ? `${monitor.maxProbes}+ misses` : `${misses} misses`;
}

function Facts({ monitor }: { monitor: MonitorDetail }) {
  const facts: Array<[string, string]> = [
    ["State", STATE_LABEL[monitor.state]],
    ["Health", HEALTH_LABEL[monitor.health]],
    ["Probed", `every ${monitor.checkIntervalSeconds}s`],
    ["Alerts after", `${monitor.alertThresholdMisses} misses in a row`],
    ["Current streak", streak(monitor)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 border-y py-5">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 font-mono text-sm tabular-nums">{value}</dd>
        </div>
      ))}
      {/* Its own row: an address is too long for half the drawer. */}
      <div className="col-span-2">
        <dt className="text-xs text-muted-foreground">Alert email</dt>
        <dd className="mt-0.5 font-mono text-sm [overflow-wrap:anywhere]">
          {monitor.alertEmail ?? "None - alerts show here only"}
        </dd>
      </div>
    </dl>
  );
}

function HistoryStats({ probes, failureCount }: { probes: LatestProbe[]; failureCount: number }) {
  const stats: Array<[string, string]> = [
    ["Uptime", ProbeStats.uptime(probes, 2)],
    ["Checks", String(probes.length)],
    ["Failures", String(failureCount)],
    ["Avg latency", ProbeStats.averageLatency(probes)],
  ];
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-4">
      {stats.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="font-mono text-2xl tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function FailureTable({ failures }: { failures: LatestProbe[] }) {
  return (
    <table className="mt-5 w-full text-left font-mono text-xs tabular-nums">
      <thead className="text-muted-foreground">
        <tr className="border-b"><th className="py-2 font-normal">When</th><th className="py-2 font-normal">Alert</th><th className="py-2 text-right font-normal">Took</th></tr>
      </thead>
      <tbody className="divide-y">
        {failures.slice(0, FAILURE_ROWS).map((probe, index) => (
          <tr key={`${probe.checkedAt}-${index}`}>
            <td className="py-2">{DisplayTime.format(probe.checkedAt)}</td>
            <td className="py-2 text-destructive">{probe.alertTriggered ? "sent" : ""}</td>
            <td className="py-2 text-right">{probe.latencyMs} ms</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Every check the monitor keeps, newest failures first. */
function HistorySummary({ probes }: { probes: LatestProbe[] }) {
  const failures = probes.filter((probe) => !probe.success).reverse();
  return (
    <>
      <HistoryStats probes={probes} failureCount={failures.length} />
      {failures.length === 0 ? (
        <p className="mt-5 text-sm text-muted-foreground">No failures in these checks.</p>
      ) : (
        <FailureTable failures={failures} />
      )}
    </>
  );
}

/** Newest first. Every alert's miss count is the monitor's threshold, which never changes
 *  after registration, so the message is the same one the email carried. */
function AlertHistory({ monitor }: { monitor: MonitorDetail }) {
  const message = AlertMessage.of(monitor, monitor.alertThresholdMisses);
  const alerts = monitor.latestAlerts.toReversed();
  return (
    <section aria-labelledby="history-heading" className="border-t pt-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="history-heading" className="text-sm font-semibold">Alert history</h2>
        <p className="font-mono text-xs text-muted-foreground">last {LATEST_ALERT_LIMIT}</p>
      </div>
      <div className="max-h-80 overflow-y-auto rounded-lg border">
        {alerts.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No alerts. One fires per outage, on the miss that reaches the threshold.
          </p>
        ) : (
          <ol className="divide-y">
            {/* initial={false}: the list opens still; only alerts that arrive while it is open fade in. */}
            <AnimatePresence initial={false}>
              {alerts.map((alert) => (
                <motion.li key={alert.firedAt} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 px-4 py-3">
                  <StatusGlyph glyph="down" className="mt-1 size-2.5" />
                  <div className="min-w-0">
                    <p className="text-sm leading-snug [overflow-wrap:anywhere]">{message}</p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      <time dateTime={alert.firedAt} title={DisplayTime.format(alert.firedAt)}>
                        {RelativeTime.since(alert.firedAt)}
                      </time>
                      {alert.emailedTo === null ? " - not emailed" : ` - emailed to ${alert.emailedTo}`}
                    </p>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </div>
    </section>
  );
}

/** Check now, Pause or Resume, Edit and Delete. Each but Edit asks in a popup before it
 *  runs, and a delete lands back on the list; Edit opens the monitor's form. */
function MonitorActions({ monitor }: { monitor: MonitorDetail }) {
  const router = useRouter();
  const [request, setRequest] = useState<MonitorActionRequest | null>(null);
  const [editing, setEditing] = useState(false);
  const isActive = monitor.state === "active";
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setRequest({ action: "check", monitor })}>
        <RefreshCw aria-hidden />
        Check now
      </Button>
      <Button variant="outline" size="sm" onClick={() => setRequest({ action: isActive ? "pause" : "resume", monitor })}>
        {isActive ? <Pause aria-hidden /> : <Play aria-hidden />}
        {isActive ? "Pause" : "Resume"}
      </Button>
      <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
        <Pencil aria-hidden />
        Edit
      </Button>
      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setRequest({ action: "delete", monitor })}>
        <Trash2 aria-hidden />
        Delete
      </Button>
      <MonitorActionDialog request={request} onClose={() => setRequest(null)} onDeleted={() => router.replace(ClientPath.Monitors)} />
      <MonitorFormPanel open={editing} monitor={monitor} onClose={() => setEditing(false)} />
    </div>
  );
}

function BackLink() {
  return (
    <Link href={ClientPath.Monitors} className="-mx-2 inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
      <ArrowLeft aria-hidden className="size-4" />
      All monitors
    </Link>
  );
}

function MonitorTitle({ monitor }: { monitor: MonitorDetail }) {
  return (
    <div className="flex flex-col gap-5 border-b pb-6 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <StatusGlyph glyph={glyphOf(monitor)} />
          <span className="truncate">{monitor.name}</span>
        </h1>
        <a href={monitor.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-primary hover:underline">
          <span className="truncate">{monitor.url}</span>
          <ExternalLink aria-hidden className="size-3 shrink-0" />
        </a>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {HEALTH_LABEL[monitor.health]} - {STATE_LABEL[monitor.state]}
        </p>
      </div>
      <MonitorActions monitor={monitor} />
    </div>
  );
}

function MonitorBody({ monitor }: { monitor: MonitorDetail }) {
  const lastProbeAt = monitor.latestProbes.at(-1)?.checkedAt;
  return (
    <div className="flex flex-col gap-8">
      <MonitorTitle monitor={monitor} />
      <Facts monitor={monitor} />
      <section aria-label="Recent checks" className="flex flex-col gap-4">
        <UptimeStrip probes={monitor.latestProbes} slots={PAGE_STRIP_SLOTS} className="w-full" />
        {monitor.latestProbes.length > 1 && <LatencyChart probes={monitor.latestProbes.slice(-PAGE_STRIP_SLOTS)} />}
      </section>
      <AlertHistory monitor={monitor} />
      <section aria-labelledby="log-heading" className="border-t pt-6">
        <h2 id="log-heading" className="mb-4 text-sm font-semibold">Last {monitor.maxProbes} checks</h2>
        <HistorySummary probes={monitor.latestProbes} />
      </section>
      <p className="text-xs text-muted-foreground">Last probe {lastProbeAt ? RelativeTime.since(lastProbeAt) : "never"}.</p>
    </div>
  );
}

/** A deleted monitor or a made-up id - said on the page, not in an error toast. */
function NoMonitor() {
  return (
    <NotFoundState
      title="No monitor here."
      detail="It may have been deleted, or the link points at a monitor that never existed."
    />
  );
}

/** One monitor in full - every probe it keeps and its alerts - kept live while open. */
export function MonitorDetailPage({ monitorId }: { monitorId: string }) {
  const detail = useQuery({
    queryKey: QueryKey.monitor(monitorId),
    queryFn: () => fetchMonitor(monitorId),
    refetchInterval: LIVE_REFRESH_MS,
  });
  const isMissing = detail.error instanceof ApiError && detail.error.status === 404;
  return (
    <main className={`${PAGE_COLUMN} flex flex-1 flex-col gap-6 pt-8 pb-16`}>
      <BackLink />
      {isMissing ? <NoMonitor /> : detail.data ? <MonitorBody monitor={detail.data} /> : <PageLoader label="Loading monitor..." />}
    </main>
  );
}

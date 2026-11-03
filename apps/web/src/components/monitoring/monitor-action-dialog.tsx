"use client";

import type { ListedMonitor, UrlCheckResult } from "@repo/types/monitor";
import { LATEST_ALERT_LIMIT, LATEST_PROBE_LIMIT } from "@repo/app-core/monitor-limits";
import { StatusGlyph } from "@/components/monitoring/status-glyph";
import { useMonitorActions } from "@/components/monitoring/use-monitor-actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { DisplayTime } from "@/lib/display-time";
import { cn } from "@/lib/utils";

export type MonitorAction = "check" | "pause" | "resume" | "delete";

/** An action someone asked for, waiting for them to confirm it. */
export interface MonitorActionRequest {
  action: MonitorAction;
  monitor: ListedMonitor;
}

interface ActionCopy {
  title: string;
  description: string;
  confirmLabel: string;
}

function copyFor({ action, monitor }: MonitorActionRequest): ActionCopy {
  switch (action) {
    case "check":
      return {
        title: `Check ${monitor.name} now?`,
        description: "Lively calls its URL once and shows what came back. Nothing is recorded - its history and alerts stay as they are.",
        confirmLabel: "Check now",
      };
    case "pause":
      return {
        title: `Pause ${monitor.name}?`,
        description: "Its probes and alerts stop until you resume it. Its history is kept.",
        confirmLabel: "Pause",
      };
    case "resume":
      return {
        title: `Resume ${monitor.name}?`,
        description: "Probing starts again on its schedule. Its health reads as unchecked until the next probe.",
        confirmLabel: "Resume",
      };
    case "delete":
      return {
        title: `Delete ${monitor.name}?`,
        description: `Its schedule, its last ${LATEST_PROBE_LIMIT} checks and up to ${LATEST_ALERT_LIMIT} alerts go with it. This cannot be undone.`,
        confirmLabel: "Delete",
      };
  }
}

interface MonitorActionDialogProps {
  request: MonitorActionRequest | null;
  onClose: () => void;
  /** Runs after a confirmed delete succeeds - a monitor's own page leaves for the list. */
  onDeleted?: () => void;
}

/* Hallmark - component: check result card - genre: modern-minimal - theme: Cobalt (project tokens)
 * states: loading (readouts held as placeholders) - success (up) - success (down / no response)
 * contrast: verdict 24px semibold, status colours >= 3.4:1 light / >= 5:1 dark on --muted
 * Not interactive, so it has no hover, focus, active or disabled state; a failed request
 * closes the popup and the query client toasts it. */

/** One instrument cell: a muted label over a mono reading, or a placeholder bar while the
 *  call is out - the same footprint either way, so nothing jumps when the answer lands. */
function Readout({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 py-3 sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums [overflow-wrap:anywhere]">
        {value ?? <span aria-hidden className="skeleton inline-block h-4 w-16 align-middle" />}
      </dd>
    </div>
  );
}

/** What a check found, read the way the status band reads the fleet: the verdict first, in
 *  its status colour, then three readings divided by hairlines. `result` is undefined while
 *  the call is out. */
function CheckResult({ result }: { result: UrlCheckResult | undefined }) {
  const isUp = result?.success === true;
  const verdict = result === undefined ? "Calling the URL..." : isUp ? "Up" : "Down";
  const statusCode = result === undefined ? undefined : result.statusCode === null ? "No response" : `HTTP ${result.statusCode}`;
  return (
    <section role="status" aria-live="polite" aria-busy={result === undefined} className="rounded-lg bg-muted px-4 pt-3.5">
      <p className="flex items-center gap-2.5">
        {result === undefined ? (
          <Spinner aria-hidden className="size-3.5 text-muted-foreground" />
        ) : (
          <StatusGlyph glyph={isUp ? "up" : "down"} className="size-3" />
        )}
        <span
          className={cn(
            // 24px semibold is large text, so the status colours clear 3:1 on the muted surface.
            "text-2xl font-semibold tracking-tight",
            result === undefined && "text-sm font-medium text-muted-foreground",
            result !== undefined && (isUp ? "text-status-up" : "text-status-down"),
          )}
        >
          {verdict}
        </span>
      </p>
      <dl className="mt-2 grid grid-cols-1 divide-y border-t sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <Readout label="Status" value={statusCode} />
        <Readout label="Latency" value={result && `${result.latencyMs} ms`} />
        <Readout label="Checked" value={result && DisplayTime.format(result.checkedAt)} />
      </dl>
    </section>
  );
}

/** Asks before any monitor action runs, and stays open until it has - the confirm button is
 *  a plain button, not `AlertDialogAction`, which would close it on click. A check stays open
 *  after that too, to show what came back. A failure closes it; the query client has already
 *  shown the error. */
export function MonitorActionDialog({ request, onClose, onDeleted }: MonitorActionDialogProps) {
  const { check, setState, remove } = useMonitorActions();
  const pending = check.isPending || setState.isPending || remove.isPending;
  const checkResult = request?.action === "check" ? check.data : undefined;
  // The next check starts from the question, not from this one's answer.
  const close = (): void => {
    check.reset();
    onClose();
  };
  const confirm = (): void => {
    if (request === null) return;
    const { action, monitor } = request;
    const whenDone = { onSettled: onClose };
    if (action === "check") {
      check.mutate(monitor.id, { onError: close });
    } else if (action === "delete") {
      remove.mutate(monitor.id, { ...whenDone, onSuccess: onDeleted });
    } else {
      setState.mutate({ id: monitor.id, state: action === "pause" ? "inactive" : "active" }, whenDone);
    }
  };
  const copy = request === null ? undefined : copyFor(request);
  return (
    <AlertDialog open={request !== null} onOpenChange={(open) => !open && !pending && close()}>
      <AlertDialogContent onEscapeKeyDown={(event) => pending && event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle className="[overflow-wrap:anywhere]">{copy?.title}</AlertDialogTitle>
          <AlertDialogDescription>{copy?.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* Held from the moment the check is confirmed, so the popup grows once, not twice. */}
        {request?.action === "check" && (check.isPending || checkResult) && <CheckResult result={checkResult} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{checkResult ? "Close" : "Cancel"}</AlertDialogCancel>
          {!checkResult && (
            <Button variant={request?.action === "delete" ? "destructive" : "default"} disabled={pending} onClick={confirm}>
              {pending && <Spinner aria-hidden />}
              {pending && request?.action === "check" ? "Checking..." : copy?.confirmLabel}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

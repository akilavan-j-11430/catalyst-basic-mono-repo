"use client";

import { X } from "lucide-react";
import { useForm, type FieldErrors, type Resolver, type ResolverResult, type UseFormReturn } from "react-hook-form";
import type { ListedMonitor, NewMonitor } from "@repo/types/monitor";
import {
  LATEST_ALERT_LIMIT,
  LATEST_PROBE_LIMIT,
  MAX_ALERT_THRESHOLD_MISSES,
  MAX_CHECK_INTERVAL_SECONDS,
  MIN_CHECK_INTERVAL_SECONDS,
} from "@repo/app-core/monitor-limits";
import { useSignedInUser } from "@/components/auth/auth-gate";
import { FormField } from "@/components/shared/form-field";
import { SidePanel } from "@/components/shared/side-panel";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { useMonitorActions } from "@/components/monitoring/use-monitor-actions";

/** What the inputs hold - numbers arrive as text until the resolver reads them. */
interface MonitorDraft {
  name: string;
  url: string;
  checkIntervalSeconds: string;
  alertThresholdMisses: string;
  alertEmail: string;
}

/** The alert email starts as the signed-in user's own, so the common case is no typing. */
function emptyDraft(alertEmail: string): MonitorDraft {
  return { name: "", url: "", checkIntervalSeconds: "60", alertThresholdMisses: "3", alertEmail };
}

function invalid(message: string): { type: string; message: string } {
  return { type: "validate", message };
}

function wholeNumber(value: string, range: { min: number; max?: number }): number | undefined {
  const parsed = Number(value);
  const { min, max = Number.MAX_SAFE_INTEGER } = range;
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

/** For the person typing. `apps/api` checks the same request again and is the one that
 *  decides - a browser can always be skipped. */
const resolveMonitor: Resolver<MonitorDraft, unknown, NewMonitor> = (values): ResolverResult<MonitorDraft, NewMonitor> => {
  const errors: FieldErrors<MonitorDraft> = {};
  const name = values.name.trim();
  const url = values.url.trim();
  const seconds = wholeNumber(values.checkIntervalSeconds, { min: MIN_CHECK_INTERVAL_SECONDS, max: MAX_CHECK_INTERVAL_SECONDS });
  // Whole minutes: the schedule fires on the minute.
  const interval = seconds !== undefined && seconds % MIN_CHECK_INTERVAL_SECONDS === 0 ? seconds : undefined;
  const threshold = wholeNumber(values.alertThresholdMisses, { min: 1, max: MAX_ALERT_THRESHOLD_MISSES });
  const alertEmail = values.alertEmail.trim();
  if (name === "") errors.name = invalid("Give it a name you will recognise in an alert.");
  if (!/^https?:\/\//i.test(url) || !URL.canParse(url)) errors.url = invalid("Use a full http:// or https:// address.");
  if (interval === undefined) errors.checkIntervalSeconds = invalid(`Whole minutes, ${MIN_CHECK_INTERVAL_SECONDS} to ${MAX_CHECK_INTERVAL_SECONDS}s.`);
  if (threshold === undefined) errors.alertThresholdMisses = invalid(`1 to ${MAX_ALERT_THRESHOLD_MISSES}.`);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(alertEmail)) errors.alertEmail = invalid("Use an address that can receive the alert.");
  if (Object.keys(errors).length > 0 || interval === undefined || threshold === undefined) {
    return { values: {}, errors };
  }
  return { values: { name, url, checkIntervalSeconds: interval, alertThresholdMisses: threshold, alertEmail }, errors: {} };
};

/** The monitor's current settings, as the inputs hold them. A monitor a reset added has no
 *  alert email, so that box starts empty and asks for one. */
function draftOf(monitor: ListedMonitor): MonitorDraft {
  return {
    name: monitor.name,
    url: monitor.url,
    checkIntervalSeconds: String(monitor.checkIntervalSeconds),
    alertThresholdMisses: String(monitor.alertThresholdMisses),
    alertEmail: monitor.alertEmail ?? "",
  };
}

/** Registers a new monitor, or - given one - replaces its settings. */
function MonitorFields({ form }: { form: UseFormReturn<MonitorDraft, unknown, NewMonitor> }) {
  const { register, formState: { errors } } = form;
  return (
    <>
      <FormField id="monitor-name" label="Name" type="text" placeholder="Checkout API" error={errors.name?.message} field={register("name")} />
      <FormField id="monitor-url" label="URL" type="url" placeholder="https://api.example.com/health" error={errors.url?.message} field={register("url")} />
      <div className="grid grid-cols-2 gap-4">
        <FormField id="monitor-interval" label="Every (seconds)" type="number" placeholder="60" error={errors.checkIntervalSeconds?.message} field={register("checkIntervalSeconds")} />
        <FormField id="monitor-threshold" label="Alert after (misses)" type="number" placeholder="3" error={errors.alertThresholdMisses?.message} field={register("alertThresholdMisses")} />
      </div>
      <FormField id="monitor-alert-email" label="Alert email" type="email" placeholder="you@example.com" error={errors.alertEmail?.message} field={register("alertEmail")} />
    </>
  );
}

/** Registers a new monitor, or replaces an existing one's settings. */
function useSaveMonitor({ monitor, onSaved }: { monitor?: ListedMonitor; onSaved: () => void }) {
  const { register, edit } = useMonitorActions();
  const save = (settings: NewMonitor): void => {
    if (monitor) {
      edit.mutate({ id: monitor.id, settings }, { onSuccess: onSaved });
    } else {
      register.mutate(settings, { onSuccess: onSaved });
    }
  };
  return { save, isPending: register.isPending || edit.isPending };
}

function MonitorForm({ monitor, onSaved }: { monitor?: ListedMonitor; onSaved: () => void }) {
  const signedInEmail = useSignedInUser().emailId;
  // The panel unmounts the form on close, so the next open starts from a fresh draft.
  const form = useForm<MonitorDraft, unknown, NewMonitor>({
    resolver: resolveMonitor,
    defaultValues: monitor ? draftOf(monitor) : emptyDraft(signedInEmail),
    mode: "onTouched",
  });
  const { save, isPending } = useSaveMonitor({ monitor, onSaved });
  const idle = monitor ? "Save changes" : "Start watching";
  // Saving an edit wipes the history, so an untouched form has nothing worth that.
  const isUnchanged = monitor !== undefined && !form.formState.isDirty;
  return (
    <form onSubmit={form.handleSubmit(save)} noValidate autoComplete="off" className="px-6 py-6">
      <FieldGroup className="gap-5">
        <MonitorFields form={form} />
        {monitor && (
          <p role="note" className="rounded-md border border-status-paused/40 bg-status-paused/10 px-3 py-2.5 text-sm">
            Saving starts its history over: its last {LATEST_PROBE_LIMIT} checks and {LATEST_ALERT_LIMIT} alerts are cleared, and its health reads as unchecked until the next probe.
          </p>
        )}
        <Button type="submit" disabled={isPending || isUnchanged}>
          {isPending && <Spinner aria-hidden />}
          {isPending ? (monitor ? "Saving..." : "Starting...") : idle}
        </Button>
      </FieldGroup>
    </form>
  );
}

interface MonitorFormPanelProps {
  open: boolean;
  onClose: () => void;
  /** The monitor to edit; left out, the panel registers a new one. */
  monitor?: ListedMonitor;
}

/** The monitor form in a side panel - opened from the button beside the list's search to
 *  register, or from a monitor's Edit to change it. Success closes it; the list and the
 *  monitor's page showing the change is the confirmation. */
export function MonitorFormPanel({ open, onClose, monitor }: MonitorFormPanelProps) {
  const title = monitor ? `Edit ${monitor.name}` : "Watch an endpoint";
  return (
    <SidePanel open={open} onClose={onClose} label={title}>
      <div className="flex h-full flex-col overflow-y-auto">
        <header className="flex items-start justify-between gap-4 border-b px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {monitor ? "Change anything it was set up with." : "Lively probes it on your schedule and emails you when it stops answering."}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Close" onClick={onClose}>
            <X aria-hidden />
          </Button>
        </header>
        <MonitorForm monitor={monitor} onSaved={onClose} />
      </div>
    </SidePanel>
  );
}

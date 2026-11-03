import { LATEST_PROBE_LIMIT, MIN_CHECK_INTERVAL_SECONDS } from "@repo/app-core/monitor-limits";
import { GLYPH_LABEL, StatusGlyph, type MonitorGlyph } from "@/components/monitoring/status-glyph";
import { PAGE_COLUMN } from "@/components/shared/app-frame";

/** Shared by the band and the body, so the card's column is clear of the band's text. */
export const SIGN_IN_GRID = "grid gap-x-14 lg:grid-cols-[minmax(0,1fr)_26rem]";

const STATUSES: MonitorGlyph[] = ["up", "down", "paused", "unknown"];

/** The dashboard's graphite band. Its deep bottom padding is what the card overlaps. */
export function SignInBand() {
  return (
    <section aria-label="About Lively" className="bg-graphite text-graphite-foreground">
      <div className={`${PAGE_COLUMN} ${SIGN_IN_GRID} pt-10 pb-12 lg:pt-12 lg:pb-24`}>
        <div className="flex min-w-0 flex-col gap-7">
          <div className="flex max-w-3xl flex-col gap-3">
            <p className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Sign in to see which endpoints are answering.
            </p>
            <p className="text-base text-graphite-muted">Uptime monitoring for the endpoints you own.</p>
          </div>
          <ul className="flex flex-wrap gap-x-8 gap-y-3 border-t border-graphite-rule pt-5">
            {STATUSES.map((status) => (
              <li key={status} className="flex items-center gap-2 text-sm text-graphite-muted">
                <StatusGlyph glyph={status} className="size-2.5" />
                {GLYPH_LABEL[status]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

const FIGURES: Array<{ value: string; unit: string; label: string; detail: string }> = [
  {
    value: String(MIN_CHECK_INTERVAL_SECONDS),
    unit: "s",
    label: "Shortest interval",
    detail: "One GET per endpoint, on the schedule you set.",
  },
  {
    value: "1",
    unit: "alert",
    label: "Per outage",
    detail: "Fired when misses in a row reach your threshold.",
  },
  {
    value: String(LATEST_PROBE_LIMIT),
    unit: "checks",
    label: "History",
    detail: "The newest checks and alerts per endpoint.",
  },
];

/** How it works, as three figures. Every number is a constant the API enforces, never a
 *  claim, so the row cannot drift from what Lively actually does. */
export function HowItWorks({ className }: { className?: string }) {
  return (
    <section aria-labelledby="how-heading" className={className}>
      <h2 id="how-heading" className="text-sm text-muted-foreground">How it works</h2>
      <dl className="mt-5 grid sm:grid-cols-3">
        {FIGURES.map(({ value, unit, label, detail }) => (
          <div
            key={label}
            className="flex flex-col gap-1 border-t py-4 first:border-t-0 first:pt-0 sm:border-t-0 sm:border-l sm:py-0 sm:pl-6 sm:first:border-l-0 sm:first:pl-0"
          >
            <dt className="mt-2 text-sm font-medium">{label}</dt>
            {/* Drawn above its label; the markup keeps <dt> first, as a <dl> requires. */}
            <dd className="order-first font-mono text-4xl font-medium tracking-tight tabular-nums">
              {value}
              <span className="ml-1.5 font-sans text-base font-normal text-muted-foreground">{unit}</span>
            </dd>
            <dd className="text-sm leading-relaxed text-muted-foreground">{detail}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

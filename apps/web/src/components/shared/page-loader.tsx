/** The heartbeat in the app's icon (`app/icon.svg`), on the same 32-unit grid. */
const TRACE = "M5 17h6l3-8 4 15 3-7h6";

/**
 * The whole-page wait, before anything is known: the app's mark with a beat travelling
 * along its trace over a faint copy of it, so the line never reads as gone. The caller
 * names what is being waited for.
 */
export function PageLoader({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-1 flex-col items-center justify-center gap-5 py-24">
      <svg viewBox="0 0 32 32" aria-hidden className="size-14">
        <rect width="32" height="32" rx="7" className="fill-primary" />
        <path
          d={TRACE}
          pathLength={1}
          fill="none"
          strokeWidth={2.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-primary-foreground/35"
        />
        <path
          d={TRACE}
          pathLength={1}
          fill="none"
          strokeWidth={2.75}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="heartbeat-trace stroke-primary-foreground"
        />
      </svg>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

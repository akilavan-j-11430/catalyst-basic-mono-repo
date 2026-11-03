import { LATEST_ALERT_LIMIT, LATEST_PROBE_LIMIT } from "@repo/app-core/monitor-limits";
import Link from "next/link";
import type { ReactNode } from "react";
import { ClientPath } from "@repo/routing/client-path";

/** The one column every band, header and body row of the app lines up on. It spans the
 *  whole window; only the gutter grows with it. */
export const PAGE_COLUMN = "w-full px-4 sm:px-6 lg:px-10";

/** The pulse tile. `src/app/icon.svg` is the same drawing in fixed colours, for the tab. */
function LivelyMark() {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className="size-7 shrink-0">
      <rect width="32" height="32" rx="7" className="fill-primary" />
      <path
        d="M5 17h6l3-8 4 15 3-7h6"
        fill="none"
        strokeWidth="2.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
    </svg>
  );
}

/** `actions` is the right-hand side - the account in the signed-in app, the theme alone on sign-in. */
export function AppHeader({ actions }: { actions: ReactNode }) {
  return (
    <>
      {/* Fixed to the viewport, on a solid surface so nothing scrolls through it. */}
      <header className="fixed inset-x-0 top-0 z-40 border-b bg-background">
        <div className={`${PAGE_COLUMN} flex h-16 items-center justify-between gap-4`}>
          <Link href={ClientPath.Monitors} className="flex items-center gap-2.5 rounded-sm text-base font-semibold tracking-tight">
            <LivelyMark />
            Lively
          </Link>
          {actions}
        </div>
      </header>
      {/* A fixed header leaves the page's flow, so this holds its height - the 4rem of the
          row above plus its 1px rule - and nothing starts underneath it. */}
      <div aria-hidden className="h-[calc(4rem+1px)] shrink-0" />
    </>
  );
}

export function AppFooter() {
  return (
    <footer className="border-t">
      <p className={`${PAGE_COLUMN} py-5 text-xs text-muted-foreground`}>
        Lively - each endpoint is probed on its own schedule, at the interval you set. Each keeps its last {LATEST_PROBE_LIMIT} checks and {LATEST_ALERT_LIMIT} alerts.
      </p>
    </footer>
  );
}

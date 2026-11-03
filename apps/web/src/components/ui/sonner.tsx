"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

/** How long an error stays before it goes - long enough to read and act on. */
const ERROR_DWELL_MS = 8_000;

/** The monitors' own "down" mark, so a failure reads in the app's status vocabulary. Its
 *  colour comes from `globals.css`. */
function DownDiamond() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden>
      <rect x="2" y="2" width="8" height="8" rx="1" transform="rotate(45 6 6)" fill="currentColor" />
    </svg>
  );
}

/**
 * `theme` stays fixed to light and is not wired to the theme switch: every colour a toast
 * shows comes from the `--toast-*` tokens in `globals.css`, which already follow `.dark`,
 * so there is nothing for sonner's own theme to change and no reason to pull in
 * `next-themes` the way the upstream component does.
 *
 * Only layout, type and timing live here. Only failures toast - success is silent - so
 * there is one design, and its look is set in `globals.css`, where the selectors are wide
 * enough to beat sonner's own. See the note there before changing how a toast looks.
 */
export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="light"
      position="bottom-right"
      closeButton
      icons={{ error: <DownDiamond /> }}
      style={{ "--width": "24rem" } as React.CSSProperties}
      toastOptions={{
        duration: ERROR_DWELL_MS,
        classNames: {
          toast: "font-sans items-center gap-3 rounded-lg py-3.5 pr-11 pl-4",
          title: "text-sm font-medium",
          description: "mt-0.5 text-sm leading-relaxed",
        },
      }}
      {...props}
    />
  );
}

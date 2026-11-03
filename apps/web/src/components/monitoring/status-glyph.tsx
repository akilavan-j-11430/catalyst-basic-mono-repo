import type { MonitorHealth, MonitorState } from "@repo/types/monitor";
import { cn } from "@/lib/utils";

/** What a monitor's glyph shows: its health, or that it is paused - an inactive monitor's
 *  health starts over at unknown, so the pause is the thing worth showing. */
export type MonitorGlyph = MonitorHealth | "paused";

export const GLYPH_LABEL: Record<MonitorGlyph, string> = {
  up: "Up",
  down: "Down",
  paused: "Paused",
  unknown: "Unchecked",
};

export const HEALTH_LABEL: Record<MonitorHealth, string> = {
  up: "Up",
  down: "Down",
  unknown: "Unchecked",
};

export const STATE_LABEL: Record<MonitorState, string> = {
  active: "Active",
  inactive: "Inactive",
};

export function glyphOf(monitor: { state: MonitorState; health: MonitorHealth }): MonitorGlyph {
  return monitor.state === "inactive" ? "paused" : monitor.health;
}

const GLYPH_FILL: Record<MonitorGlyph, string> = {
  up: "fill-status-up",
  down: "fill-status-down",
  paused: "fill-status-paused",
  unknown: "fill-status-unknown",
};

/** A filled dot in the status colour. Colour alone tells the states apart, so the label -
 *  read out by a screen reader - always goes with it: beside it as text in a count or a
 *  heading, and as the dot's accessible name everywhere else. */
export function StatusGlyph({ glyph, className }: { glyph: MonitorGlyph; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" role="img" aria-label={GLYPH_LABEL[glyph]} className={cn("size-2.5 shrink-0", className)}>
      <circle cx="6" cy="6" r="5" className={GLYPH_FILL[glyph]} />
    </svg>
  );
}

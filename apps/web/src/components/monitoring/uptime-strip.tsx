import type { LatestProbe } from "@repo/types/monitor";
import { cn } from "@/lib/utils";
import { DisplayTime } from "@/lib/display-time";

const SLOT = 6;
/** Narrower than its slot by a gap wide enough that neighbouring bars never run together. */
const BAR = 3.5;

/** Every vertical measure, scaled to the slot count: the strip is drawn about 15 times wider
 *  than tall whatever its count, so a long strip keeps its height instead of flattening. */
interface StripGeometry {
  height: number;
  /** A success is drawn shorter than a miss, so the two differ in shape and not only in hue. */
  successHeight: number;
  emptyHeight: number;
  /** The miss that fired an alert gets a dot above it, so an alert reads without a hover. */
  alertRadius: number;
  top: number;
}

function geometryFor(slots: number): StripGeometry {
  const height = Math.round((slots * SLOT) / 15);
  const alertRadius = Math.max(1.5, height / 16);
  return {
    height,
    successHeight: Math.round(height * 0.6),
    emptyHeight: Math.max(2, Math.round(height / 12)),
    alertRadius,
    top: -alertRadius * 2 - 1,
  };
}

function describe(probe: LatestProbe): string {
  const result = probe.success ? "OK" : "Miss";
  const alert = probe.alertTriggered ? " - alert sent" : "";
  return `${result} - ${probe.latencyMs} ms - ${DisplayTime.format(probe.checkedAt)}${alert}`;
}

function ProbeBar({ probe, x, geometry }: { probe: LatestProbe; x: number; geometry: StripGeometry }) {
  const height = probe.success ? geometry.successHeight : geometry.height;
  return (
    <g>
      <title>{describe(probe)}</title>
      <rect x={x} y={0} width={SLOT} height={geometry.height} fill="transparent" />
      <rect
        x={x + (SLOT - BAR) / 2}
        y={geometry.height - height}
        width={BAR}
        height={height}
        rx={1}
        className={probe.success ? "fill-status-up" : "fill-status-down"}
      />
      {probe.alertTriggered && (
        <circle cx={x + SLOT / 2} cy={geometry.top / 2} r={geometry.alertRadius} className="fill-status-down" />
      )}
    </g>
  );
}

/** The newest `slots` probes, oldest on the left. Slots not yet filled are a hairline dash
 *  on the baseline, so a new monitor's strip fills in from the right. */
export function UptimeStrip({ probes, slots, className }: { probes: LatestProbe[]; slots: number; className?: string }) {
  const shown = probes.slice(-slots);
  const empty = slots - shown.length;
  const succeeded = shown.filter((probe) => probe.success).length;
  const geometry = geometryFor(slots);
  return (
    <svg
      viewBox={`0 ${geometry.top} ${slots * SLOT} ${geometry.height - geometry.top}`}
      role="img"
      aria-label={`${succeeded} of ${shown.length} recent checks succeeded`}
      className={cn("block h-auto", className)}
    >
      {Array.from({ length: empty }, (_, slot) => (
        <rect
          key={`empty-${slot}`}
          x={slot * SLOT + (SLOT - BAR) / 2}
          y={geometry.height - geometry.emptyHeight}
          width={BAR}
          height={geometry.emptyHeight}
          rx={1}
          className="fill-border"
        />
      ))}
      {shown.map((probe, index) => (
        <ProbeBar key={`${probe.checkedAt}-${index}`} probe={probe} x={(empty + index) * SLOT} geometry={geometry} />
      ))}
    </svg>
  );
}

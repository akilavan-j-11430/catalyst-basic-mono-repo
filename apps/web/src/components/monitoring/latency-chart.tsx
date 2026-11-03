"use client";

import { useState, type PointerEvent } from "react";
import type { LatestProbe } from "@repo/types/monitor";
import { DisplayTime } from "@/lib/display-time";
import { RelativeTime } from "@/lib/relative-time";

interface Frame {
  width: number;
  height: number;
  /** Vertical breathing room so the line never touches the edge. */
  inset: number;
}

/** Misses break the line instead of plotting their latency: a timed-out probe would sit at
 *  the timeout and flatten every real reading under it. */
function linePath(probes: LatestProbe[], frame: Frame, max: number): string {
  const step = probes.length > 1 ? frame.width / (probes.length - 1) : 0;
  const usable = frame.height - frame.inset * 2;
  let path = "";
  let penDown = false;
  probes.forEach((probe, index) => {
    if (!probe.success) {
      penDown = false;
      return;
    }
    const x = index * step;
    const y = frame.inset + usable - (probe.latencyMs / max) * usable;
    path += `${penDown ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
    penDown = true;
  });
  return path.trim();
}

function maxLatency(probes: LatestProbe[]): number {
  return Math.max(1, ...probes.filter((probe) => probe.success).map((probe) => probe.latencyMs));
}

const DETAIL: Frame = { width: 400, height: 160, inset: 12 };

/** The drawer's chart: a crosshair and readout follow the pointer, misses sit on the
 *  baseline as diamonds so a gap in the line always has a visible cause. */
export function LatencyChart({ probes }: { probes: LatestProbe[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const max = maxLatency(probes);
  const step = probes.length > 1 ? DETAIL.width / (probes.length - 1) : 0;
  const active = hovered === null ? undefined : probes[hovered];

  const track = (event: PointerEvent<SVGSVGElement>): void => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setHovered(Math.min(probes.length - 1, Math.max(0, Math.round(ratio * (probes.length - 1)))));
  };

  return (
    <figure className="relative">
      <div className="mb-2 flex items-baseline justify-between font-mono text-xs text-muted-foreground tabular-nums">
        <span>{max} ms</span>
        <span>{active ? `${active.success ? `${active.latencyMs} ms` : "miss"} at ${DisplayTime.format(active.checkedAt)}` : "Latency"}</span>
      </div>
      <svg
        viewBox={`0 0 ${DETAIL.width} ${DETAIL.height}`}
        className="block h-40 w-full touch-none overflow-visible"
        preserveAspectRatio="none"
        onPointerMove={track}
        onPointerLeave={() => setHovered(null)}
        role="img"
        aria-label={`Latency over the last ${probes.length} checks, peaking at ${max} ms`}
      >
        <line x1={0} x2={DETAIL.width} y1={DETAIL.inset} y2={DETAIL.inset} strokeDasharray="2 4" className="stroke-border" vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={DETAIL.width} y1={DETAIL.height - 0.5} y2={DETAIL.height - 0.5} className="stroke-border" vectorEffect="non-scaling-stroke" />
        <path d={linePath(probes, DETAIL, max)} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="stroke-primary" vectorEffect="non-scaling-stroke" />
        {probes.map((probe, index) =>
          probe.success ? null : (
            <rect key={`${probe.checkedAt}-${index}`} x={index * step - 3} y={DETAIL.height - 9} width={6} height={6} transform={`rotate(45 ${index * step} ${DETAIL.height - 6})`} className="fill-status-down" />
          ),
        )}
        {hovered !== null && (
          <line x1={hovered * step} x2={hovered * step} y1={0} y2={DETAIL.height} className="stroke-foreground/40" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      <figcaption className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
        <span>{probes[0] ? RelativeTime.since(probes[0].checkedAt) : ""}</span>
        <span>now</span>
      </figcaption>
    </figure>
  );
}

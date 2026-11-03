import type { LatestProbe } from "@repo/types/monitor";

/** Figures over a run of probes, for the list's columns and a monitor's page. Each answers
 *  "-" when there is nothing to measure yet. */
export class ProbeStats {
  /** The share of checks that answered, to `fractionDigits` places - "99.2%". */
  static uptime(probes: LatestProbe[], fractionDigits: number): string {
    if (probes.length === 0) {
      return "-";
    }
    const answered = probes.filter((probe) => probe.success).length;
    return `${((answered / probes.length) * 100).toFixed(fractionDigits)}%`;
  }

  /** Over successful checks only: a miss's latency is how long it took to fail - up to the
   *  timeout - and would drag the average away from how the endpoint actually answers. */
  static averageLatency(probes: LatestProbe[]): string {
    const answered = probes.filter((probe) => probe.success);
    if (answered.length === 0) {
      return "-";
    }
    const totalMs = answered.reduce((total, probe) => total + probe.latencyMs, 0);
    return `${Math.round(totalMs / answered.length)} ms`;
  }
}

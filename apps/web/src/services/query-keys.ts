/** Probes now arrive from each monitor's own scheduled job, not from anything this page
 *  does, so the list, the summary and a monitor's page refetch on this interval while shown. */
export const LIVE_REFRESH_MS = 15_000;

/** Every query key, so a mutation can invalidate a whole domain by its first segment. */
export const QueryKey = {
  monitors: ["monitor"],
  /** Every cached list, whatever its search - and nothing else under "monitor". */
  monitorLists: ["monitor", "list"],
  /** The pages of the list loaded so far for one search, infinite-scroll style. */
  monitorList: (name: string) => ["monitor", "list", name] as const,
  /** The fleet's counts - under "monitor", so every mutation refreshes them. */
  monitorSummary: ["monitor", "summary"],
  /** One monitor in full, for its drawer - under "monitor", so every mutation refreshes it. */
  monitor: (monitorId: string) => ["monitor", "detail", monitorId] as const,
} as const;

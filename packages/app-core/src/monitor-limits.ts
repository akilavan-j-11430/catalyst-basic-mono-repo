/** How many probes a monitor keeps - the history its page shows, and how far back the
 *  probe job can look when it judges an alert. */
export const LATEST_PROBE_LIMIT = 100;

/** How many probe slots a list row draws, so the list carries no more than that. */
export const LIST_PROBE_SLOTS = 40;

/** The highest alert threshold a monitor may set. A monitor is down when its last N probes
 *  all missed, judged from `latestProbes`, so N can be no more than it holds. */
export const MAX_ALERT_THRESHOLD_MISSES = LATEST_PROBE_LIMIT;

/** How many monitors a page of the list holds when the caller does not say. */
export const MONITOR_PAGE_SIZE = 20;

/** The most monitors one page may hold - one ZCQL SELECT, under its 300-row cap. */
export const MAX_MONITOR_PAGE_SIZE = 100;

/** How many alerts a monitor keeps, and its page lists, newest first. Older ones are
 *  dropped as new ones fire - nothing else clears them. */
export const LATEST_ALERT_LIMIT = 100;

/** The cron fires once a minute, so a shorter interval could never be honoured - and an
 *  interval is a whole number of minutes, for the same reason. */
export const MIN_CHECK_INTERVAL_SECONDS = 60;

/** A day. A monitor checked less often than that is not watching anything. */
export const MAX_CHECK_INTERVAL_SECONDS = 86_400;

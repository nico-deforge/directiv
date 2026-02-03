/**
 * Refresh intervals for data fetching (in milliseconds).
 *
 * Linear API limit: 5000 requests/hour (~83/min).
 * Each Linear query may trigger multiple sub-requests due to lazy loading.
 * We use conservative intervals to stay well under the limit.
 */

// External API refresh intervals (Linear, GitHub)
export const EXTERNAL_API_REFRESH_INTERVAL = 60_000; // 1 minute

// Local operations (tmux, git) - can be more frequent
export const LOCAL_REFRESH_INTERVAL = 5_000; // 5 seconds
export const LOCAL_REFRESH_INTERVAL_SLOW = 10_000; // 10 seconds

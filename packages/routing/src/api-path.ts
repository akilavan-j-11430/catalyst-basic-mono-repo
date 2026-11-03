/**
 * Every segment of every API path, declared once and shared by `apps/api`, which mounts
 * them, and `apps/web`, which calls them. A full path is the segments added together, so a route
 * moves by editing one value here.
 */
export const ApiPath = {
  /** A router's own root, for a collection mounted under its segment. */
  Root: "/",
  Api: "/api",
  V1: "/v1",
  Ping: "/ping",
  Monitors: "/monitors",
  /** An Express parameter, mounted by `apps/api` only - `apps/web` appends the encoded id. */
  MonitorId: "/:monitorId",
  Check: "/check",
  Summary: "/summary",
  Reset: "/reset",
} as const;

export type ApiPath = (typeof ApiPath)[keyof typeof ApiPath];

/**
 * Every page path of `apps/web`, declared once so a link never spells one out. A page under
 * a segment is the segment plus its encoded id - `${ClientPath.Monitors}/${id}`.
 */
export const ClientPath = {
  SignIn: "/sign-in",
  Monitors: "/monitors",
} as const;

export type ClientPath = (typeof ClientPath)[keyof typeof ClientPath];

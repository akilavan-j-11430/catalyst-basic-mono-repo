/**
 * What a scheduled job runs. The SDK has its own TARGET_TYPE enum but exports it from
 * neither its package root nor its types, so these mirror the wire values. Add a member
 * here when this repo actually targets a circuit, an AppSail or a webhook.
 */
export const TargetType = {
  Function: "Function",
} as const;

export type TargetType = (typeof TargetType)[keyof typeof TargetType];

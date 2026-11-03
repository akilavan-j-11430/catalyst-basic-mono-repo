import { defineEnv } from "@repo/node-utils/utils/env";

/**
 * Every environment variable this app reads. Requiredness is expressed at the
 * call site - `env.get` for one that must be set, `env.optional` for one with a
 * fallback - so a key appears here exactly once either way.
 */
type ApiEnv = {
  /** The secret `POST /monitors/reset` must be sent in its `x-reset-key` header. Unset,
   *  reset is off. */
  RESET_KEY: string;
  /** Timezone for log timestamps. Falls back to the logger's own default. */
  TZ: string;
};

export const env = defineEnv<ApiEnv>();

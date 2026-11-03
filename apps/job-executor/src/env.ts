import { defineEnv } from "@repo/node-utils/utils/env";

/** Every environment variable this function reads. Set on the function in the Catalyst
 *  Console for the deployed job, and in `apps/job-executor/.env` locally. */
type JobExecutorEnv = {
  /** Sender of alert emails. Must be a sender verified in the project's Catalyst Mail
   *  settings. Unset, alerts still reach the feed and no email is sent. */
  ALERT_SENDER_EMAIL: string;
};

export const env = defineEnv<JobExecutorEnv>();

/**
 * `createCron` is declared with its *response* shape, `ICatalystCronDetails`, which
 * demands `id`, `end_time`, `cron_execution_type` and a fully expanded `job_meta` that
 * only the server produces - so no valid request satisfies it. This adds the overload it
 * should have had, taking the request shape the API actually accepts, which is how the
 * payload in `job.ts` is type-checked rather than cast past the signature.
 */
import type {
  ICatalystCronDetails,
  ICatalystFunctionJob,
  ICatalystOneTimeCron,
} from "@zcatalyst/job-scheduling/dist-types/utils/types";

declare module "@zcatalyst/job-scheduling/dist-types/cron" {
  export default interface Cron {
    createCron(
      cron: ICatalystOneTimeCron<ICatalystFunctionJob>,
    ): Promise<ICatalystCronDetails>;
  }
}

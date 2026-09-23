import { CatalystError } from "@/errors/catalyst_error";
import { JobScheduling } from "@zcatalyst/job-scheduling";
import { currentContext } from "@/framework/async_context";
import { randomUUID } from "node:crypto";
import { TargetType } from "@/enums/target_type";

/** Catalyst rejects an alias longer than this. */
const MAX_ALIAS_LENGTH = 20;

/** Every job here is executed by one function, which dispatches on `jobName`. */
const JOB_EXECUTOR = "job_executor";

// The SDK's payload types are not exported, so they are read off the methods that take
// them. createCron is additionally typed with its *response* shape, demanding `id`,
// `end_time` and `cron_execution_type` that only the server can produce - hence the cast
// through unknown. Both payloads are built field by field right below, so they are
// checked by hand rather than by tsc; re-read them against the SDK on every upgrade.
type SubmitInput = Parameters<JobScheduling["JOB"]["submitJob"]>[0];
type CronInput = Parameters<JobScheduling["CRON"]["createCron"]>[0];

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. */
function jobScheduling(): JobScheduling {
  return new JobScheduling(currentContext().manager.catalyst);
}

interface JobConfig {
  jobName: string;
  aliasName: string;
  jobPoolName: string;
}

export class Job<T extends Record<string, string>> {
  private constructor(readonly config: JobConfig) {}

  /** Queues the job for immediate execution. */
  async submitJob(params: T, jobId: string = randomUUID()): Promise<void> {
    await jobScheduling().JOB.submitJob({
      job_name: this.config.aliasName,
      jobpool_name: this.config.jobPoolName,
      target_type: TargetType.Function,
      target_name: JOB_EXECUTOR,
      params: { ...params, jobId, jobName: this.config.jobName },
    } as SubmitInput);
  }

  /** Queues the job to run once, at `timeOfExecution` in epoch milliseconds. */
  async scheduleJob(
    params: T & { cronName?: string },
    timeOfExecution: number,
  ): Promise<void> {
    // A cron name must be unique in the project, so the fallback is a UUID rather than
    // ten characters picked with Math.random.
    const cronName =
      params.cronName ?? `${this.config.aliasName}-${randomUUID()}`;
    const payload = {
      cron_type: "OneTime" as const,
      cron_name: cronName,
      cron_status: true,
      cron_detail: { time_of_execution: timeOfExecution.toString() },
      job_meta: {
        job_name: this.config.aliasName,
        jobpool_name: this.config.jobPoolName,
        target_type: TargetType.Function,
        target_name: JOB_EXECUTOR,
        params: { ...params, jobName: this.config.jobName },
      },
    };
    await jobScheduling().CRON.createCron(payload as unknown as CronInput);
  }

  static create<T extends Record<string, string>>(config: JobConfig): Job<T> {
    if (config.aliasName.length > MAX_ALIAS_LENGTH) {
      throw CatalystError.InvalidResource(
        `Job alias name must be at most ${MAX_ALIAS_LENGTH} characters, got "${config.aliasName}".`,
      );
    }
    return new Job<T>(config);
  }
}

import { CatalystError } from "@/errors/catalyst_error";
import { JobScheduling } from "@zcatalyst/job-scheduling";
import { currentContext } from "@/framework/async_context";
import { randomUUID } from "node:crypto";
import {
  CRON_TYPE,
  TARGET_TYPE,
} from "@zcatalyst/job-scheduling/dist-es/utils/enum.js";
import type {
  ICatalystFunctionJob,
  ICatalystOneTimeCron,
} from "@zcatalyst/job-scheduling/dist-types/utils/types";

/** Catalyst rejects an alias longer than this. */
const MAX_ALIAS_LENGTH = 20;

/** Catalyst rejects a cron name longer than this. */
const MAX_CRON_NAME_LENGTH = 20;

// `submitJob` is typed with the request shape (`TCatalystJobs`), so its payload needs no
// help. `createCron` is typed with the *response* shape instead, demanding `id`,
// `end_time`, `cron_execution_type` and an expanded `job_meta` that only the server can
// produce. `job_scheduling_cron.d.ts` declares the overload it should have had, so the
// payload below is checked against the genuine request shape rather than cast past it.

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. */
function jobScheduling(): JobScheduling {
  return new JobScheduling(currentContext().manager.catalyst);
}

/** Catalyst carries job params as strings. A job that takes none is `Job<void>`. */
export type JobParams = Record<string, string>;

/** Absent for a `Job<void>`, required for every other job. */
type WithParams<T> = T extends void ? { params?: undefined } : { params: T };

type SubmitJobInput<T> = WithParams<T> & {
  /** Defaults to a UUID. */
  jobId?: string;
};

/** A `Job<void>` needs neither params nor a jobId, so it is called with no argument. */
type SubmitJobArgs<T> = T extends void
  ? [input?: SubmitJobInput<T>]
  : [input: SubmitJobInput<T>];

type SubmitOneTimeCronInput<T> = WithParams<T> & {
  /** Epoch milliseconds. */
  timeOfExecution: number;
  /** Unique in the project, at most `MAX_CRON_NAME_LENGTH` characters. */
  cronName: string;
};

interface JobConfig {
  jobName: string;
  aliasName: string;
  jobPoolName: string;
  /** The function the job pool invokes. It dispatches on the `jobName` in the params. */
  jobTargetFunctionName: string;
}

export class Job<T extends JobParams | void = void> {
  private constructor(readonly config: JobConfig) {}

  /** Queues the job for immediate execution. */
  async submitJob(...[input]: SubmitJobArgs<T>): Promise<void> {
    const { params, jobId = randomUUID() } = input ?? {};
    await jobScheduling().JOB.submitJob({
      job_name: this.config.aliasName,
      jobpool_name: this.config.jobPoolName,
      target_type: TARGET_TYPE.FUNCTION,
      target_name: this.config.jobTargetFunctionName,
      params: { ...params, jobId, jobName: this.config.jobName },
    });
  }

  /** Queues the job to run once. `cronName` names the cron, must be unique in the
   *  project, and never reaches the job's params. */
  async submitOneTimeCron(input: SubmitOneTimeCronInput<T>): Promise<void> {
    const { timeOfExecution, params, cronName } = input;
    if (cronName.length > MAX_CRON_NAME_LENGTH) {
      throw CatalystError.InvalidResource(
        `Cron name must be at most ${MAX_CRON_NAME_LENGTH} characters, got "${cronName}".`,
      );
    }

    const cron: ICatalystOneTimeCron<ICatalystFunctionJob> = {
      cron_type: CRON_TYPE.ONETIME,
      cron_name: cronName,
      cron_status: true,
      cron_detail: { time_of_execution: timeOfExecution.toString() },
      job_meta: {
        job_name: this.config.aliasName,
        jobpool_name: this.config.jobPoolName,
        target_type: TARGET_TYPE.FUNCTION,
        target_name: this.config.jobTargetFunctionName,
        params: { ...params, jobName: this.config.jobName },
      },
    };
    await jobScheduling().CRON.createCron(cron);
  }

  static create<T extends JobParams | void = void>(config: JobConfig): Job<T> {
    if (config.aliasName.length > MAX_ALIAS_LENGTH) {
      throw CatalystError.InvalidResource(
        `Job alias name must be at most ${MAX_ALIAS_LENGTH} characters, got "${config.aliasName}".`,
      );
    }
    return new Job<T>(config);
  }
}

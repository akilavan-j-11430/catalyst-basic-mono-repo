import { CatalystError } from "@/errors/catalyst-error";
import { JobScheduling } from "@zcatalyst/job-scheduling";
import { CatalystScope } from "@/enums/catalyst-scope";
import { currentContext } from "@/framework/async-context";

/** Catalyst rejects an alias longer than this. */
const MAX_ALIAS_LENGTH = 20;

/** Catalyst rejects a schedule (cron) name longer than this. */
const MAX_SCHEDULE_NAME_LENGTH = 20;

// `createCron` and `updateCron` cannot be satisfied as declared: both want the cron's own
// *response* shape, demanding `id`, `end_time` and `cron_execution_type` that only the server
// produces. So the wire shape this repo sends is named below and cast once, at each call -
// the payload stays checked, and nothing reaches into the SDK's build output.
type SdkCronDetails = Parameters<JobScheduling["CRON"]["createCron"]>[0];

/** A job targeting a Catalyst function, as Catalyst accepts it. */
interface FunctionJobRequest {
  job_name: string;
  jobpool_name: string;
  target_type: "Function";
  target_name: string;
  params: JobParams;
}

/** A cron that fires every `hour:minute:second`, as Catalyst accepts it. Catalyst runs it
 *  once at creation too, then every interval from that moment. */
interface PeriodicCronRequest {
  cron_name: string;
  cron_type: "Periodic";
  cron_status: boolean;
  cron_detail: { hour: string; minute: string; second: string; repetition_type: "every" };
  job_meta: FunctionJobRequest;
}

/** Fresh per call. The app is per-request, so a service must never be hoisted to module
 *  scope. Admin, because job scheduling is not a browser SDK method. */
function jobScheduling(): JobScheduling {
  return new JobScheduling(currentContext().manager.catalyst.getApp(CatalystScope.Admin));
}

/** Catalyst carries job params as strings. */
export type JobParams = Record<string, string>;

interface ScheduleRepeatingInput<T> {
  /** How often the job runs. Whole seconds; split into Catalyst's hour/minute/second. */
  intervalSeconds: number;
  /** Unique in the project, at most `MAX_SCHEDULE_NAME_LENGTH` characters. */
  scheduleName: string;
  params: T;
}

interface RescheduleRepeatingInput<T> extends ScheduleRepeatingInput<T> {
  /** False keeps a paused schedule paused - the update replaces its status too. */
  isActive: boolean;
}

interface JobConfig {
  jobName: string;
  aliasName: string;
  jobPoolName: string;
  /** The function the job pool invokes. It dispatches on the `jobName` in the params. */
  jobTargetFunctionName: string;
}

export class Job<T extends JobParams> {
  /** The name the job function dispatches on - it rides in every run's params. */
  readonly name: string;

  private constructor(private readonly config: JobConfig) {
    this.name = config.jobName;
  }

  /** Runs the job every `intervalSeconds` until the schedule is paused or deleted, and
   *  answers with the schedule's id - keep it: Catalyst lists no cron made from code, so the
   *  id is the only handle on it later. */
  async scheduleRepeating(input: ScheduleRepeatingInput<T>): Promise<string> {
    const cron = this.periodicCron({ ...input, isActive: true });
    try {
      const createdCron = await jobScheduling().CRON.createCron(cron as unknown as SdkCronDetails);
      return String(createdCron.id);
    } catch (cause) {
      throw CatalystError.InvalidResource(`Scheduling ${input.scheduleName} failed`, cause);
    }
  }

  /** Replaces a schedule's interval and params in place, so its id - and every reference to
   *  it - stays good. Its timetable starts again from now. */
  async rescheduleRepeating(scheduleId: string, input: RescheduleRepeatingInput<T>): Promise<void> {
    const cron = this.periodicCron(input);
    try {
      await jobScheduling().CRON.updateCron(scheduleId, cron as unknown as SdkCronDetails);
    } catch (cause) {
      throw CatalystError.InvalidResource(`Rescheduling ${scheduleId} failed`, cause);
    }
  }

  /** Stops a schedule from firing until `resumeSchedule`. */
  async pauseSchedule(scheduleId: string): Promise<void> {
    try {
      await jobScheduling().CRON.pauseCron(scheduleId);
    } catch (cause) {
      throw CatalystError.InvalidResource(`Pausing schedule ${scheduleId} failed`, cause);
    }
  }

  async resumeSchedule(scheduleId: string): Promise<void> {
    try {
      await jobScheduling().CRON.resumeCron(scheduleId);
    } catch (cause) {
      throw CatalystError.InvalidResource(`Resuming schedule ${scheduleId} failed`, cause);
    }
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    try {
      await jobScheduling().CRON.deleteCron(scheduleId);
    } catch (cause) {
      throw CatalystError.InvalidResource(`Deleting schedule ${scheduleId} failed`, cause);
    }
  }

  private periodicCron(input: RescheduleRepeatingInput<T>): PeriodicCronRequest {
    const { intervalSeconds, params, scheduleName, isActive } = input;
    Job.checkScheduleName(scheduleName);
    return {
      cron_type: "Periodic",
      cron_name: scheduleName,
      cron_status: isActive,
      cron_detail: {
        hour: String(Math.floor(intervalSeconds / 3600)),
        minute: String(Math.floor((intervalSeconds % 3600) / 60)),
        second: String(intervalSeconds % 60),
        repetition_type: "every",
      },
      job_meta: {
        job_name: this.config.aliasName,
        jobpool_name: this.config.jobPoolName,
        target_type: "Function",
        target_name: this.config.jobTargetFunctionName,
        params: { ...params, jobName: this.name },
      },
    };
  }

  private static checkScheduleName(scheduleName: string): void {
    if (scheduleName.length > MAX_SCHEDULE_NAME_LENGTH) {
      throw CatalystError.InvalidResource(
        `Schedule name must be at most ${MAX_SCHEDULE_NAME_LENGTH} characters, got "${scheduleName}".`,
      );
    }
  }

  static create<T extends JobParams>(config: JobConfig): Job<T> {
    if (config.aliasName.length > MAX_ALIAS_LENGTH) {
      throw CatalystError.InvalidResource(
        `Job alias name must be at most ${MAX_ALIAS_LENGTH} characters, got "${config.aliasName}".`,
      );
    }
    return new Job<T>(config);
  }
}

import { describe, expect, it, vi } from "vitest";
import { Catalyst, type CatalystApp } from "@/catalyst/catalyst";
import { Job } from "@/catalyst/job";
import { CatalystScope } from "@/enums/catalyst-scope";
import { CatalystError } from "@/errors/catalyst-error";
import { ExecutionContext, runWithContext } from "@/framework/async-context";

const { createCron, updateCron } = vi.hoisted(() => ({
  createCron: vi.fn(async (): Promise<{ id: number }> => ({ id: 9001 })),
  updateCron: vi.fn(async (): Promise<object> => ({})),
}));

vi.mock("@zcatalyst/job-scheduling", () => ({
  JobScheduling: class {
    CRON = { createCron, updateCron };
  },
}));

const probeJob = Job.create<{ monitorId: string }>({
  jobName: "probe",
  aliasName: "monitor_probe",
  jobPoolName: "LivelyJobPool",
  jobTargetFunctionName: "job-executor",
});

/** Runs the call the way a job or route would: inside an execution whose Admin app is built. */
function asAdmin<T>(call: () => Promise<T>): Promise<T> {
  const catalyst = new Catalyst();
  catalyst.setApp(CatalystScope.Admin, {} as CatalystApp);
  const context = new ExecutionContext({ executionId: "execution-1", catalyst, extras: {} });
  return runWithContext(context, call);
}

describe("Job.scheduleRepeating", () => {
  it("sends a Periodic cron split into hour, minute and second, and answers with its id", async () => {
    const scheduleId = await asAdmin(() =>
      probeJob.scheduleRepeating({ scheduleName: "m_1001", intervalSeconds: 3725, params: { monitorId: "1001" } }),
    );

    expect(scheduleId).toBe("9001");
    expect(createCron).toHaveBeenCalledExactlyOnceWith({
      cron_type: "Periodic",
      cron_name: "m_1001",
      cron_status: true,
      cron_detail: { hour: "1", minute: "2", second: "5", repetition_type: "every" },
      job_meta: {
        job_name: "monitor_probe",
        jobpool_name: "LivelyJobPool",
        target_type: "Function",
        target_name: "job-executor",
        params: { monitorId: "1001", jobName: "probe" },
      },
    });
  });

  it("rejects a schedule name Catalyst would refuse, before calling it", async () => {
    const scheduling = asAdmin(() =>
      probeJob.scheduleRepeating({ scheduleName: "m".repeat(21), intervalSeconds: 60, params: { monitorId: "1001" } }),
    );

    await expect(scheduling).rejects.toBeInstanceOf(CatalystError);
    expect(createCron).not.toHaveBeenCalled();
  });

  it("turns an SDK failure into a CatalystError", async () => {
    createCron.mockRejectedValue(new Error("no job pool"));

    const scheduling = asAdmin(() =>
      probeJob.scheduleRepeating({ scheduleName: "m_1001", intervalSeconds: 60, params: { monitorId: "1001" } }),
    );

    await expect(scheduling).rejects.toBeInstanceOf(CatalystError);
  });
});

describe("Job.rescheduleRepeating", () => {
  it("updates the schedule in place, keeping a paused one paused", async () => {
    await asAdmin(() =>
      probeJob.rescheduleRepeating("9001", {
        scheduleName: "m_1001",
        intervalSeconds: 300,
        params: { monitorId: "1001" },
        isActive: false,
      }),
    );

    expect(updateCron).toHaveBeenCalledExactlyOnceWith(
      "9001",
      expect.objectContaining({
        cron_name: "m_1001",
        cron_status: false,
        cron_detail: { hour: "0", minute: "5", second: "0", repetition_type: "every" },
      }),
    );
  });

  it("turns an SDK failure into a CatalystError", async () => {
    updateCron.mockRejectedValue(new Error("no such cron"));

    const rescheduling = asAdmin(() =>
      probeJob.rescheduleRepeating("9001", {
        scheduleName: "m_1001",
        intervalSeconds: 60,
        params: { monitorId: "1001" },
        isActive: true,
      }),
    );

    await expect(rescheduling).rejects.toBeInstanceOf(CatalystError);
  });
});

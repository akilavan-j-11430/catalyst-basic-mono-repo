import { describe, expect, it } from "vitest";
import { Job } from "@/job";
import { ErrorCode } from "@/error-codes";

function jobAliased(aliasName: string): Job {
  return Job.create({
    jobName: "reminder",
    aliasName,
    jobPoolName: "default",
    jobTargetFunctionName: "job-executor",
  });
}

describe("Job.create", () => {
  it("takes an alias of letters, digits and underscores", () => {
    expect(jobAliased("send_reminder_2").config.aliasName).toBe("send_reminder_2");
  });

  it.each(["send-reminder", "send reminder", "", "a".repeat(21)])(
    "rejects the alias %j, which Catalyst would refuse as a job_name",
    (aliasName) => {
      expect(() => jobAliased(aliasName)).toThrow(
        expect.objectContaining({ code: ErrorCode.INVALID_RESOURCE }),
      );
    },
  );
});

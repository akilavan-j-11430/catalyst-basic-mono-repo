import { randomUUID } from "node:crypto";
import { zcAuth } from "@zcatalyst/auth";
import { Catalyst } from "@repo/node-utils/catalyst/catalyst";
import { monitorProbeJob } from "@repo/node-utils/catalyst/resources";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { ExecutionContext, runWithContext } from "@repo/node-utils/framework/async-context";
import { logger } from "@repo/node-utils/framework/logger";
import { MonitorRepository } from "@repo/node-utils/repositories/monitor-repository";
import { MonitorProbe } from "@/monitor-probe";
import type { JobContext, JobRequest } from "@/types";

/** Runs the job named in the params. Every job this pool targets lands here. */
async function runJob(params: Record<string, string>): Promise<void> {
  const { jobName, monitorId } = params;
  if (jobName === monitorProbeJob.name && monitorId && MonitorRepository.isMonitorId(monitorId)) {
    await MonitorProbe.run(monitorId);
    return;
  }
  throw new Error(`Unknown job ${jobName} with params ${JSON.stringify(params)}`);
}

/**
 * The job function's handler, also called by `dev.ts`. A job carries no user, so only the
 * Admin app is built - from the context's headers, the way `apps/api` builds its apps from
 * the request's. A failure is logged and reported, which is what makes Catalyst retry.
 */
export async function dispatch(request: JobRequest, context: JobContext): Promise<void> {
  const params = request.getAllJobParams();
  const catalyst = new Catalyst();
  const execution = new ExecutionContext({
    executionId: randomUUID(),
    catalyst,
    extras: {},
  });
  await runWithContext(execution, async () => {
    try {
      catalyst.setApp(
        CatalystScope.Admin,
        await zcAuth.init(context as unknown as Parameters<typeof zcAuth.init>[0], {
          scope: CatalystScope.Admin,
        }),
      );
      await runJob(params);
      context.closeWithSuccess();
    } catch (error) {
      logger.error(error);
      context.closeWithFailure();
    }
  });
}

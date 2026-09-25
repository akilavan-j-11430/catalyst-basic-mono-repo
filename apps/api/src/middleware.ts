import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
  ErrorRequestHandler,
} from "express";
import {
  currentContext,
  ExecutionContext,
  runWithContext,
} from "@repo/node-utils/framework/async_context";
import { logger } from "@repo/node-utils/framework/logger";
import { randomUUID } from "crypto";
import { zcAuth } from "@zcatalyst/auth";
import { HttpError } from "@/errors/http_error";
import { toErrorResponse } from "@/utils/api";

/** Records the timing of request execution from start to finish. */
export function recordRequestTiming(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const startTime = Date.now();
  currentContext().manager.setExtras("req.startTime", startTime);
  const url = req.url;
  const method = req.method;
  logger.info(`Request execution started for ${method} ${url}`);
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    logger.info(
      `Request execution completed in ${duration} ms for ${method} ${url}.`,
    );
  });
  next();
}

/** Establishes the execution context for the request and runs the chain inside it. */
export const initExecutionContext: RequestHandler = async (req, _res, next) => {
  // Catalyst reads both the project details and the caller's credentials off the headers,
  // so the app is per-request and nothing needs to be configured in the environment.
  // Admin scope: the API acts as the application, not as the caller. User scope throws
  // `missing user credentials` for anyone not signed in, which would take down the one
  // route whose callers have no account yet. The admin token rides on every request.
  // `init` loads its implementation through a dynamic import, so it must be awaited - an
  // unawaited promise is truthy and only fails later, inside the SDK.
  const catalystApp = await zcAuth.init(
    req as unknown as Parameters<typeof zcAuth.init>[0],
    { scope: "admin" },
  );
  runWithContext(
    new ExecutionContext({
      executionId: randomUUID(),
      catalyst: catalystApp,
      extras: {},
    }),
    () => next(),
  );
};

/** Terminal error handler - maps HttpError to its status, anything else to 500. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json(toErrorResponse(error.message));
    return;
  }
  console.error(`[server]`, error);
  res.status(500).json(toErrorResponse("Something went wrong."));
};

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
import catalyst from "zcatalyst-sdk-node";
import { randomUUID } from "crypto";
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
export const initExecutionContext: RequestHandler = (req, _res, next) => {
  // Catalyst reads both the project details and the caller's credentials off the headers,
  // so the app is per-request and nothing needs to be configured in the environment.
  const catalystApp = catalyst.initialize(
    req as unknown as Record<string, unknown>,
  );
  runWithContext(
    new ExecutionContext({
      executionId: randomUUID(),
      catalystApp,
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

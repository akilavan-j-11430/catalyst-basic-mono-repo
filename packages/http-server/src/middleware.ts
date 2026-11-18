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
} from "@repo/async-context/async-context";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { CatalystSession } from "@repo/catalyst-node/catalyst-session";
import { InvalidInputError } from "@repo/input-validation/invalid-input-error";
import { Logger } from "@repo/logger/logger";
import { randomUUID } from "crypto";
import { HttpError } from "@/http-error";
import { toErrorResponse } from "@/response";

const logger = Logger.for("middleware");

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
export const initExecutionContext: RequestHandler = (_req, _res, next) => {
  const context = new ExecutionContext({
    executionId: randomUUID(),
    extras: {},
  });
  runWithContext(context, next);
};

/**
 * Sets the request's Catalyst app for each listed scope on its execution context, where every
 * wrapper reads it, so a route that needs a signed-in caller answers 401 before its handler
 * runs. Catalyst reads both the project details and the caller's credentials off the headers,
 * so nothing needs to be configured in the environment.
 */
export function initCatalystScopes(scopes: CatalystScope[]): RequestHandler {
  return async (req, _res, next) => {
    await Promise.all(
      scopes.map(async (scope) => {
        try {
          await CatalystSession.setApp(req.headers, scope);
        } catch (error) {
          // A CatalystError carrying only the SDK's code and message - never the headers.
          logger.info(String(error));
          if (scope === CatalystScope.User) {
            throw HttpError.Unauthorized("Sign in to continue.");
          }
          throw error;
        }
      }),
    );
    next();
  };
}

/** Terminal error handler - maps HttpError to its status, InvalidInputError to 400, anything
 *  else to 500. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json(toErrorResponse(error.message));
    return;
  }
  if (error instanceof InvalidInputError) {
    res.status(400).json(toErrorResponse(error.message));
    return;
  }
  logger.error(error);
  res.status(500).json(toErrorResponse("Something went wrong."));
};

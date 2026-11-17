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
} from "@repo/node-utils/framework/async-context";
import { CatalystScope } from "@repo/node-utils/enums/catalyst-scope";
import { Catalyst } from "@repo/node-utils/catalyst/catalyst";
import { logger } from "@repo/node-utils/framework/logger";
import { randomUUID } from "crypto";
import { zcAuth } from "@zcatalyst/auth";
import { HttpError } from "@/http-error";
import { toErrorResponse } from "@/response";

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

/** Establishes the execution context for the request and runs the chain inside it. Catalyst
 *  starts empty - a route that needs it mounts `initCatalystScopes`. */
export const initExecutionContext: RequestHandler = (_req, _res, next) => {
  const context = new ExecutionContext({
    executionId: randomUUID(),
    catalyst: new Catalyst(),
    extras: {},
  });
  runWithContext(context, next);
};

/** The SDK's init error carries the request headers - Catalyst credential tokens included -
 *  in its `value`, which its `toString` and `toJSON` both print. So only its code and
 *  message ever reach a log line or a rethrown error. */
function describeInitFailure(cause: unknown): string {
  if (!(cause instanceof Error)) {
    return "unknown failure";
  }
  const code = "code" in cause ? String(cause.code) : cause.name;
  return `${code} - ${cause.message}`;
}

/** Builds the Catalyst app for each listed scope, and only those, for the route it guards. */
export function initCatalystScopes(scopes: CatalystScope[]): RequestHandler {
  // Catalyst reads both the project details and the caller's credentials off the headers,
  // so the apps are per-request and nothing needs to be configured in the environment.
  // `init` loads its implementation through a dynamic import, so it must be awaited.
  return async (req, _res, next) => {
    const catalyst = currentContext().manager.catalyst;
    await Promise.all(
      scopes.map(async (scope) => {
        try {
          catalyst.setApp(
            scope,
            await zcAuth.init(req as unknown as Parameters<typeof zcAuth.init>[0], { scope }),
          );
        } catch (cause) {
          const failure = `No ${scope}-scope Catalyst app: ${describeInitFailure(cause)}`;
          logger.info(failure);
          if (scope === CatalystScope.User) {
            throw HttpError.Unauthorized("Sign in to continue.");
          }
          throw new Error(failure);
        }
      }),
    );
    next();
  };
}

/** Terminal error handler - maps HttpError to its status, anything else to 500. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json(toErrorResponse(error.message));
    return;
  }
  console.error(`[server]`, error);
  res.status(500).json(toErrorResponse("Something went wrong."));
};

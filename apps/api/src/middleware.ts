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
import { UserManagement } from "@repo/node-utils/catalyst/user-management";
import { logger } from "@repo/node-utils/framework/logger";
import { randomUUID, timingSafeEqual } from "crypto";
import { zcAuth } from "@zcatalyst/auth";
import { env } from "@/env";
import { HttpError } from "@/errors/http-error";
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
          logger.info(`No ${scope}-scope Catalyst app: ${String(cause)}`);
          if (scope === CatalystScope.User) {
            throw HttpError.Unauthorized("Sign in to continue.");
          }
          throw cause;
        }
      }),
    );
    next();
  };
}

/** Answers 401 unless the request carries a live session of a signed-in user. Building the
 *  User app only reads the credentials off the request; asking Catalyst who they belong to
 *  is what checks them - one call per request, and the routes behind it then act as Admin.
 *  Mount it after `initCatalystScopes` with the User scope. */
export const requireSignedInUser: RequestHandler = async (_req, _res, next) => {
  try {
    await UserManagement.currentUser();
  } catch (cause) {
    logger.info(`No signed-in user: ${String(cause)}`);
    throw HttpError.Unauthorized("Sign in to continue.");
  }
  next();
};

/** The header a caller proves with that it may reset the app - the showcase site's Reset
 *  button sends it. Not `Authorization`: Catalyst's gateway claims that one. */
export const RESET_KEY_HEADER = "x-reset-key";

/**
 * Lets a request through only when it carries `RESET_KEY`. Fails closed - with no key
 * configured, reset is off rather than open - and compares in constant time, so the
 * response time says nothing about how much of a guess was right.
 */
export const requireResetKey: RequestHandler = (req, _res, next) => {
  const expected = Buffer.from(env.optional("RESET_KEY") ?? "");
  const given = Buffer.from(req.get(RESET_KEY_HEADER) ?? "");
  if (expected.length === 0 || given.length !== expected.length || !timingSafeEqual(given, expected)) {
    throw HttpError.Unauthorized("A valid reset key is required.");
  }
  next();
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

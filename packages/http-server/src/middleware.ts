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
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { CatalystSession } from "@repo/catalyst-node/catalyst-session";
import { logger } from "@repo/node-utils/framework/logger";
import { randomUUID } from "crypto";
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

/** Establishes the execution context for the request and runs the chain inside it. */
export const initExecutionContext: RequestHandler = (_req, _res, next) => {
  const context = new ExecutionContext({
    executionId: randomUUID(),
    extras: {},
  });
  runWithContext(context, next);
};

/** Where `initCatalystScopes` leaves the request's session for the handlers after it. */
const CATALYST_SESSION_KEY = "catalystSession";

/**
 * Builds the request's Catalyst session and checks each listed scope can be built, so a route
 * that needs a signed-in caller answers 401 before its handler runs. Catalyst reads both the
 * project details and the caller's credentials off the headers, so nothing needs to be
 * configured in the environment.
 */
export function initCatalystScopes(scopes: CatalystScope[]): RequestHandler {
  return async (req, res, next) => {
    const session = catalystSessionIn(res) ?? CatalystSession.fromHeaders(req.headers);
    await Promise.all(
      scopes.map(async (scope) => {
        try {
          await session.app(scope);
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
    res.locals[CATALYST_SESSION_KEY] = session;
    next();
  };
}

/** The request's Catalyst session, for a handler to pass to the wrappers it calls. Throws
 *  when the route never mounted `initCatalystScopes`. */
export function catalystSessionOf(res: Response): CatalystSession {
  const session = catalystSessionIn(res);
  if (session === undefined) {
    throw new Error("No Catalyst session - mount initCatalystScopes([...]) ahead of this handler.");
  }
  return session;
}

function catalystSessionIn(res: Response): CatalystSession | undefined {
  const session: unknown = res.locals[CATALYST_SESSION_KEY];
  return session instanceof CatalystSession ? session : undefined;
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

import "server-only";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ExecutionContext, runWithContext } from "@repo/async-context/async-context";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { CatalystSession } from "@repo/catalyst-node/catalyst-session";
import { Logger } from "@repo/logger/logger";

const logger = Logger.for("execution-context");

/**
 * Sets the request's Catalyst app for each scope on the execution context in flight. Resolves
 * false when the request carries no signed-in user for a User scope; any other failure throws.
 */
async function setApps(scopes: CatalystScope[]): Promise<boolean> {
  // Catalyst reads the project details and the caller's credentials off these headers.
  const requestHeaders = Object.fromEntries(await headers());
  const scopesSet = await Promise.all(
    scopes.map(async (scope) => {
      try {
        await CatalystSession.setApp(requestHeaders, scope);
        return true;
      } catch (error) {
        // A CatalystError carrying only the SDK's code and message - never the headers.
        logger.info(String(error));
        if (scope === CatalystScope.User) {
          return false;
        }
        throw error;
      }
    }),
  );
  return scopesSet.every(Boolean);
}

function newExecutionContext(): ExecutionContext {
  return new ExecutionContext({ executionId: randomUUID(), extras: {} });
}

/**
 * Runs a page inside one execution context with the app for each scope set, so the page's
 * own reads find them and its log lines share one execution id. A page that needs a
 * signed-in user and has none is sent to sign-in before it runs.
 *
 * Only the page's own body runs inside the context: React renders the components it returns
 * later, outside it. So the page reads, and passes what it read down as props.
 */
export function withCatalystPage<Props>(
  scopes: CatalystScope[],
  page: (props: Props) => Promise<ReactNode>,
): (props: Props) => Promise<ReactNode> {
  return async (props) =>
    runWithContext(newExecutionContext(), async () => {
      if (!(await setApps(scopes))) {
        redirect("/sign-in");
      }
      return page(props);
    });
}

/**
 * Runs a Server Action or a route handler inside one execution context with the app for each
 * scope set. A call that needs a signed-in user and has none throws before it runs.
 */
export function withCatalystFn<Input, Result>(
  scopes: CatalystScope[],
  call: (input: Input) => Promise<Result>,
): (input: Input) => Promise<Result> {
  return async (input) =>
    runWithContext(newExecutionContext(), async () => {
      if (!(await setApps(scopes))) {
        throw new Error("Sign in to continue.");
      }
      return call(input);
    });
}

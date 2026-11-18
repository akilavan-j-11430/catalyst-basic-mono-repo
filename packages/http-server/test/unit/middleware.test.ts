import type { Request, Response } from "express";
import { describe, expect, it, vi, type Mock } from "vitest";
import { ExecutionContext, runWithContext } from "@repo/async-context/async-context";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { Logger } from "@repo/logger/logger";
import { catalystAuth } from "@repo/testing/catalyst-auth";
import { HttpError } from "@/http-error";
import { initCatalystScopes } from "@/middleware";

const loggedBlocks: string[] = [];
Logger.configure({ output: { write: (_level, block) => loggedBlocks.push(block) } });

interface ScopeGuardRun {
  next: Mock<() => void>;
  finished: Promise<void>;
}

/** Runs `initCatalystScopes` the way Express would: inside the execution context
 *  `initExecutionContext` leaves, on a request carrying the given headers. */
function runScopeGuard(scopes: CatalystScope[]): ScopeGuardRun {
  const context = new ExecutionContext({ executionId: "test-execution", extras: {} });
  const next = vi.fn<() => void>();
  const req = { headers: { "x-zc-projectid": "1" } } as unknown as Request;
  const finished = runWithContext(context, () =>
    initCatalystScopes(scopes)(req, {} as Response, next),
  );
  return { next, finished: Promise.resolve(finished) };
}

describe("initCatalystScopes", () => {
  it("sets each listed scope's app from the request headers, then continues", async () => {
    const { next, finished } = runScopeGuard([CatalystScope.User]);

    await finished;

    expect(catalystAuth.init).toHaveBeenCalledExactlyOnceWith(
      { headers: { "x-zc-projectid": "1" } },
      { scope: CatalystScope.User },
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it("answers 401 when the User app cannot be built", async () => {
    catalystAuth.init.mockRejectedValue(new Error("missing user credentials"));

    const { next, finished } = runScopeGuard([CatalystScope.User]);

    await expect(finished).rejects.toBeInstanceOf(HttpError);
    await expect(finished).rejects.toMatchObject({ status: 401 });
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects an Admin failure with its code and message, which errorHandler turns into a 500", async () => {
    catalystAuth.init.mockRejectedValue(new Error("app/invalid_project_details"));

    const { finished } = runScopeGuard([CatalystScope.Admin]);

    await expect(finished).rejects.toThrow(
      "No admin-scope Catalyst app for this request: Error - app/invalid_project_details",
    );
  });

  it("never logs or rethrows the request headers the SDK error carries", async () => {
    loggedBlocks.length = 0;
    catalystAuth.init.mockRejectedValue(sdkInitError("x-zc-admin-cred-token", "secret-token"));

    const { finished } = runScopeGuard([CatalystScope.Admin]);

    const thrown: unknown = await finished.catch((error: unknown) => error);
    expect(String(thrown)).not.toContain("secret-token");
    expect(String(thrown)).toContain("app/AUTH_ERROR - User not authenticated");
    expect(loggedBlocks).not.toHaveLength(0);
    expect(loggedBlocks.join("\n")).not.toContain("secret-token");
  });
});

/** Shaped like the SDK's own error: `toString` prints `value`, which holds the headers. */
function sdkInitError(header: string, token: string): Error {
  const value = { [header]: token };
  return Object.assign(new Error("User not authenticated"), {
    code: "app/AUTH_ERROR",
    value,
    toString: () => JSON.stringify({ code: "app/AUTH_ERROR", value }),
  });
}

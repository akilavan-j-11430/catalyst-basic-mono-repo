import type { Request, Response } from "express";
import { describe, expect, it, vi, type Mock } from "vitest";
import { CatalystSession } from "@repo/catalyst-node/catalyst-session";
import { CatalystScope } from "@repo/catalyst-node/catalyst-scope";
import { catalystAuth } from "@repo/testing/catalyst-auth";
import { HttpError } from "@/http-error";
import { catalystSessionOf, initCatalystScopes } from "@/middleware";

interface ScopeGuardRun {
  res: Response;
  next: Mock<() => void>;
  finished: Promise<void>;
}

/** Runs `initCatalystScopes` the way Express would, on a request carrying the given headers. */
function runScopeGuard(scopes: CatalystScope[]): ScopeGuardRun {
  const res = { locals: {} } as Response;
  const next = vi.fn<() => void>();
  const req = { headers: { "x-zc-projectid": "1" } } as unknown as Request;
  const finished = initCatalystScopes(scopes)(req, res, next);
  return { res, next, finished: Promise.resolve(finished) };
}

describe("initCatalystScopes", () => {
  it("builds each listed scope from the request headers, leaves the session for the handler, then continues", async () => {
    const { res, next, finished } = runScopeGuard([CatalystScope.User]);

    await finished;

    expect(catalystAuth.init).toHaveBeenCalledExactlyOnceWith(
      { headers: { "x-zc-projectid": "1" } },
      { scope: CatalystScope.User },
    );
    expect(catalystSessionOf(res)).toBeInstanceOf(CatalystSession);
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
    const logLine = vi.spyOn(console, "log").mockImplementation(() => undefined);
    catalystAuth.init.mockRejectedValue(sdkInitError("x-zc-admin-cred-token", "secret-token"));

    const { finished } = runScopeGuard([CatalystScope.Admin]);

    const thrown: unknown = await finished.catch((error: unknown) => error);
    expect(String(thrown)).not.toContain("secret-token");
    expect(String(thrown)).toContain("app/AUTH_ERROR - User not authenticated");
    expect(logLine.mock.calls.flat().join("\n")).not.toContain("secret-token");
  });
});

describe("catalystSessionOf", () => {
  it("throws when the route never mounted initCatalystScopes", () => {
    expect(() => catalystSessionOf({ locals: {} } as Response)).toThrow(/initCatalystScopes/);
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

import { describe, expect, it } from "vitest";
import { catalystAuth } from "@repo/testing/catalyst-auth";
import { CatalystSession } from "@/catalyst-session";
import { CatalystScope } from "@/catalyst-scope";
import { ErrorCode } from "@/error-codes";
import { CatalystError } from "@/catalyst-error";

const requestHeaders = { "x-zc-projectid": "1", "x-zc-user-cred-token": "secret-token" };

describe("CatalystSession.app", () => {
  it("builds each scope's app from the request headers once, then reuses it", async () => {
    const session = CatalystSession.fromHeaders(requestHeaders);

    const first = await session.app(CatalystScope.User);
    const second = await session.app(CatalystScope.User);

    expect(second).toBe(first);
    expect(catalystAuth.init).toHaveBeenCalledExactlyOnceWith(
      { headers: requestHeaders },
      { scope: CatalystScope.User },
    );
  });

  it("builds a second scope separately", async () => {
    const session = CatalystSession.fromHeaders(requestHeaders);

    await session.app(CatalystScope.User);
    await session.app(CatalystScope.Admin);

    expect(catalystAuth.init).toHaveBeenCalledTimes(2);
  });

  it("rejects with SCOPE_UNAVAILABLE carrying the SDK's code and message, never its headers", async () => {
    catalystAuth.init.mockRejectedValue(
      Object.assign(new Error("User not authenticated"), {
        code: "app/AUTH_ERROR",
        value: requestHeaders,
        toString: () => JSON.stringify({ code: "app/AUTH_ERROR", value: requestHeaders }),
      }),
    );

    const building = CatalystSession.fromHeaders(requestHeaders).app(CatalystScope.User);

    const failure: unknown = await building.catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(CatalystError);
    expect(failure).toMatchObject({ code: ErrorCode.SCOPE_UNAVAILABLE, cause: undefined });
    expect(String(failure)).toContain("app/AUTH_ERROR - User not authenticated");
    expect(String(failure)).not.toContain("secret-token");
  });
});

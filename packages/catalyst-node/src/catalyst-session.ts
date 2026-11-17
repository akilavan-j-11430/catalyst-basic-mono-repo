import { zcAuth } from "@zcatalyst/auth";
import type { CatalystScope } from "@/catalyst-scope";
import { CatalystError } from "@/catalyst-error";

export type CatalystApp = Awaited<ReturnType<typeof zcAuth.init>>;

/** The headers Catalyst stamps on a request: its project details and the caller's
 *  credentials. An Express `req.headers` and `Object.fromEntries(await headers())` both fit. */
export type CatalystHeaders = Readonly<Record<string, string | string[] | number | undefined>>;

type InitInput = Parameters<typeof zcAuth.init>[0];

/**
 * One request's Catalyst apps, built from its headers on first use and kept for the rest of
 * it. The app carries the caller's credentials, so a session belongs to exactly one request:
 * the entry point builds it and passes it down, and it is never held at module scope.
 */
export class CatalystSession {
  private readonly apps = new Map<CatalystScope, Promise<CatalystApp>>();

  private constructor(private readonly headers: CatalystHeaders) {}

  static fromHeaders(headers: CatalystHeaders): CatalystSession {
    return new CatalystSession(headers);
  }

  /** The app for the scope. Rejects with `SCOPE_UNAVAILABLE` when the headers cannot build
   *  it - for User, when the request carries no signed-in user. */
  app(scope: CatalystScope): Promise<CatalystApp> {
    let app = this.apps.get(scope);
    if (app === undefined) {
      app = this.build(scope);
      this.apps.set(scope, app);
    }
    return app;
  }

  // `init` loads its implementation through a dynamic import, so it must be awaited.
  private async build(scope: CatalystScope): Promise<CatalystApp> {
    try {
      return await zcAuth.init({ headers: this.headers } as unknown as InitInput, { scope });
    } catch (cause) {
      throw CatalystError.ScopeUnavailable(scope, CatalystSession.describeInitFailure(cause));
    }
  }

  /** The SDK's init error carries the request headers - credential tokens included - in its
   *  `value`, which its `toString` and `toJSON` both print. So only its code and message are
   *  kept, and the error itself is never attached as a cause. */
  private static describeInitFailure(cause: unknown): string {
    if (!(cause instanceof Error)) {
      return "unknown failure";
    }
    const code = "code" in cause ? String(cause.code) : cause.name;
    return `${code} - ${cause.message}`;
  }
}

import type { Authentication } from "@zcatalyst/auth/web";

/**
 * Facade: everything this app asks of the Catalyst web SDK - the session, sign-out, and the
 * URLs handed to the SDK. The only code in the browser that reaches it. Who is signed in is
 * read on the server, by the page that shows them.
 */
export class AuthClient {
  private static pendingSession: Promise<Authentication> | null = null;

  /**
   * The SDK reads `document` when its module is evaluated, which would crash the server
   * prerender of any component importing it, so it is pulled in on first use instead.
   * Holding the promise also makes `init` happen once - the SDK's own credential fetch
   * clears its in-flight promise in a `finally`, so concurrent callers each re-request.
   */
  static session(): Promise<Authentication> {
    if (AuthClient.pendingSession === null) {
      AuthClient.pendingSession = import("@zcatalyst/auth/web").then(async ({ zcAuth }) => {
        await zcAuth.init();
        return zcAuth;
      });
    }
    return AuthClient.pendingSession;
  }

  /**
   * Every URL handed to the SDK is resolved inside Catalyst's own iframe and by its
   * redirect endpoint, neither of which shares this app's origin, so a bare path would
   * resolve against theirs. Prefixing the current origin keeps one call site correct on
   * localhost and on the Slate domain.
   */
  static appUrl(path: string): string {
    return new URL(path, window.location.origin).toString();
  }

  /** Signs out and sends the browser to `path`. */
  static async signOut(path: string): Promise<void> {
    const auth = await AuthClient.session();
    await auth.signOut(AuthClient.appUrl(path));
  }
}

import type { Authentication } from "@zcatalyst/auth/web";
import { CamelCase } from "@repo/case-conversion/camel-case";

/** An API token as this app holds it - in memory only, gone with the page. */
interface ApiToken {
  accessToken: string;
  expiresAtMs: number;
}

/** A token this close to expiring is replaced rather than sent, so no request carries one
 *  that lapses in flight. */
const API_TOKEN_RENEW_MS = 60_000;

let apiToken: ApiToken | null = null;
let apiTokenRequest: Promise<ApiToken> | null = null;

export interface SignedInUser {
  emailId: string;
  firstName?: string;
  lastName?: string;
}

let session: Promise<Authentication> | null = null;

/**
 * The SDK reads `document` when its module is evaluated, which would crash the server
 * prerender of any component importing it, so it is pulled in on first use instead.
 * Holding the promise also makes `init` happen once - the SDK's own credential fetch
 * clears its in-flight promise in a `finally`, so concurrent callers each re-request.
 */
export function authSession(): Promise<Authentication> {
  if (session === null) {
    session = import("@zcatalyst/auth/web").then(async ({ zcAuth }) => {
      await zcAuth.init();
      return zcAuth;
    });
  }
  return session;
}

/**
 * Every URL handed to the SDK is resolved inside Catalyst's own iframe and by its
 * redirect endpoint, neither of which shares this app's origin, so a bare path would
 * resolve against theirs. Prefixing the current origin keeps one call site correct on
 * localhost and on the Slate domain.
 */
export function appUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

function toSignedInUser(value: unknown): SignedInUser | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { emailId, firstName, lastName } = CamelCase.convertKeys(value as Record<string, unknown>);
  if (typeof emailId !== "string" || emailId === "") {
    return null;
  }
  return {
    emailId,
    firstName: typeof firstName === "string" ? firstName : undefined,
    lastName: typeof lastName === "string" ? lastName : undefined,
  };
}

/** Resolves the signed-in user, or null. A signed-out visitor is not an error. */
export async function currentUser(): Promise<SignedInUser | null> {
  const auth = await authSession();
  return toSignedInUser(await auth.isUserAuthenticated());
}

async function generateApiToken(): Promise<ApiToken> {
  const auth = await authSession();
  // AppSail accepts the same token as a function, so the "functions" scope serves the API.
  const { access_token: accessToken, expires_in_sec: expiresInSec } = await auth.generateAuthToken("functions");
  return { accessToken, expiresAtMs: Date.now() + expiresInSec * 1000 };
}

/**
 * The signed-in user's token for every API request. Generated on first use and held in
 * memory - never written to storage - then reused until shortly before it expires.
 * Requests that arrive while one is being generated wait for that one rather than each
 * asking Catalyst for its own.
 */
export async function apiAccessToken(): Promise<string> {
  if (apiToken !== null && apiToken.expiresAtMs - API_TOKEN_RENEW_MS > Date.now()) {
    return apiToken.accessToken;
  }
  apiTokenRequest ??= generateApiToken().finally(() => {
    apiTokenRequest = null;
  });
  apiToken = await apiTokenRequest;
  return apiToken.accessToken;
}

/** Next calls this once per server start, in every runtime. The logger needs Node's async
 *  context, so it is configured only in the Node.js runtime, before any request is served. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  const { Logger } = await import("@repo/logger/logger");
  const { env } = await import("@/env");
  Logger.configure({ timeZone: env.optional("TZ") });
}

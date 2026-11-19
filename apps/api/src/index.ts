import { CatalystLogOutput } from "@repo/logger/catalyst-log-output";
import { Logger } from "@repo/logger/logger";
import { app } from "@/app";
import { env } from "@/env";

Logger.configure({
  timeZone: env.optional("TZ"),
  output: CatalystLogOutput,
});

const PORT = Number(
  process.env["X_ZOHO_CATALYST_LISTEN_PORT"] ?? process.env["PORT"] ?? 8000,
);

const server = app.listen(PORT, () => {
  Logger.for("server").info(`http://localhost:${PORT}`);
});

// A graceful shutdown: stop taking requests, let the ones in flight finish, write the log
// lines still queued for Catalyst's collector, then exit.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, async () => {
    await new Promise((closed) => server.close(closed));
    await CatalystLogOutput.flush();
    process.exit(0);
  });
}

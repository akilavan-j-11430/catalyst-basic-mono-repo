import { Logger } from "@repo/logger/logger";
import { app } from "@/app";
import { env } from "@/env";
import { AppSailLogOutput } from "@/framework/catalyst-logger";

Logger.configure({ timeZone: env.optional("TZ"), output: AppSailLogOutput.fromPlatform() });

const PORT = Number(
  process.env["X_ZOHO_CATALYST_LISTEN_PORT"] ?? process.env["PORT"] ?? 8000,
);

app.listen(PORT, () => {
  Logger.for("server").info(`http://localhost:${PORT}`);
});

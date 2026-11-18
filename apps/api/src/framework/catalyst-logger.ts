import { writeSync } from "node:fs";
import type { LogLevel, LogOutput } from "@repo/logger/logger";

/** The record AppSail's log collector reads from each packet. */
interface AppSailLogRecord {
  _zl_timestamp: number;
  level: LogLevel;
  message: string;
}

/**
 * Adapter: writes each rendered block to the log collector AppSail hands the app as a file
 * descriptor, framed as a SparkP packet:
 *
 *  +-------------------+---------------+-------------------------+-------------------------------+
 *  | Encoding (1 byte) | Path (1 byte) | Content-Length (4 byte) | Message (Content-Length byte) |
 *  +-------------------+---------------+-------------------------+-------------------------------+
 */
export class AppSailLogOutput implements LogOutput {
  private static readonly ENCODING = 2;
  private static readonly LOG_PATH = 0;

  private constructor(private readonly logFd: number) {}

  /** The collector AppSail injects, or `undefined` outside AppSail - the logger then writes
   *  to stdout. */
  static fromPlatform(): AppSailLogOutput | undefined {
    const logFd = process.env["X_ZOHO_SPARKLET_LOG_FD"];
    return logFd === undefined ? undefined : new AppSailLogOutput(Number(logFd));
  }

  write(level: LogLevel, block: string): void {
    const record: AppSailLogRecord = { _zl_timestamp: Date.now(), level, message: block };
    const message = Buffer.from(JSON.stringify(record), "utf8");
    const header = Buffer.alloc(6);
    header.writeUInt8(AppSailLogOutput.ENCODING, 0);
    header.writeUInt8(AppSailLogOutput.LOG_PATH, 1);
    header.writeUInt32BE(message.length, 2);
    writeSync(this.logFd, header);
    writeSync(this.logFd, message);
  }
}

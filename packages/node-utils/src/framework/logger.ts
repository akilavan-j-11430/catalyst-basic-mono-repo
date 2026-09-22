import { currentContext } from "@/framework/async_context";


function timezone(): string {
  return process.env["TZ"] ?? "Asia/Kolkata";
}


function formatDateTime(date: Date): string {
  const tz = timezone();
  const datePart = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: tz,
  }).format(date);
  const timePart = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  }).format(date);
  return `${datePart}, ${timePart}`;
}
type LogLevel = "Info" | "Error" | "Warn";

const LOG_ORDER_KEY = "logOrder";

function formatEntry(level: LogLevel, values: unknown[]): string {
  let executionId = "none";
  let order = 0;

  try {
    const manager = currentContext().manager;
    executionId = manager.executionId;
    order = (manager.getExtras<number>(LOG_ORDER_KEY) ?? 0) + 1;
    manager.setExtras(LOG_ORDER_KEY, order);
  } catch {
    // outside request context
  }

  const content = values
    .map((v) =>
      typeof v === "object" && v !== null
        ? v instanceof Error
          ? v.toString()
          : JSON.stringify(v)
        : String(v),
    )
    .join("\n");

  return `---------------------\nExecution ID: ${executionId}\nOrder: ${order}\nLevel: ${level}\nCreated At: ${formatDateTime(new Date())}\nContent:\n${content}\n---------------------`;
}

export const logger = {
  info(...values: unknown[]): void {
    console.log(formatEntry("Info", values));
  },
  error(...values: unknown[]): void {
    console.error(formatEntry("Error", values));
  },
  warn: (...values: unknown[]): void => {
    console.log(formatEntry("Warn", values));
  },
};

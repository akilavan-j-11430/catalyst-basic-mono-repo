import { describe, expect, it } from "vitest";
import { WireTime } from "@/utils/wire-time";

describe("WireTime.fromEpochMs", () => {
  it("formats as ISO 8601 in UTC with milliseconds", () => {
    expect(WireTime.fromEpochMs(Date.UTC(2026, 10, 3, 12, 22, 5, 123))).toBe("2026-11-03T12:22:05.123Z");
  });

  it("keeps whole seconds at three digits of milliseconds", () => {
    expect(WireTime.fromEpochMs(Date.UTC(2026, 0, 1))).toBe("2026-01-01T00:00:00.000Z");
  });
});

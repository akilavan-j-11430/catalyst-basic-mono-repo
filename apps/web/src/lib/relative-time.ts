/** Compact "how long ago" for probe and alert timestamps - "12s ago", "4m ago". */
export class RelativeTime {
  private static readonly STEPS: ReadonlyArray<readonly [number, string]> = [
    [86_400, "d"],
    [3_600, "h"],
    [60, "m"],
    [1, "s"],
  ];

  static since(iso: string, now: number = Date.now()): string {
    const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
    if (seconds < 5) {
      return "just now";
    }
    const [size, unit] =
      RelativeTime.STEPS.find(([stepSize]) => seconds >= stepSize) ?? RelativeTime.STEPS[3]!;
    return `${Math.floor(seconds / size)}${unit} ago`;
  }
}

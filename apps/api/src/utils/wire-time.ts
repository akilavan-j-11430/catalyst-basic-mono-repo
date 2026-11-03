/**
 * The one place this API turns a time into the string it sends: ISO 8601 in UTC with
 * milliseconds, `2026-11-03T12:22:05.123Z`. Everything below the API - the repository, the
 * probe job - keeps epoch ms, and the browser shows the string in the viewer's own time.
 */
export class WireTime {
  static fromEpochMs(epochMs: number): string {
    return new Date(epochMs).toISOString();
  }
}

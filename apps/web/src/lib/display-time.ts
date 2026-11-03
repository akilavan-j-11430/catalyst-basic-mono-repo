/** The one way this app shows a date: `DD MMM YYYY, HH:mm:ss` in the viewer's own time -
 *  "03 Nov 2026, 17:52:05". Written out rather than left to `toLocaleString`, which would
 *  change the order and the separators with the browser's locale. */
export class DisplayTime {
  private static readonly MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /** `iso` is a time as the API sends it - ISO 8601 UTC. */
  static format(iso: string): string {
    const at = new Date(iso);
    const day = DisplayTime.twoDigits(at.getDate());
    const month = DisplayTime.MONTHS[at.getMonth()];
    const time = [at.getHours(), at.getMinutes(), at.getSeconds()].map(DisplayTime.twoDigits).join(":");
    return `${day} ${month} ${at.getFullYear()}, ${time}`;
  }

  private static twoDigits(value: number): string {
    return String(value).padStart(2, "0");
  }
}

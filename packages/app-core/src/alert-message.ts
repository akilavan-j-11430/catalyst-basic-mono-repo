/** The one wording for an alert, so the email and the monitor's page say the same thing. */
export class AlertMessage {
  static of(monitor: { name: string; url: string }, misses: number): string {
    return `${monitor.name} missed ${misses} consecutive checks (${monitor.url})`;
  }
}

/** What Catalyst passes a job function, as far as this function reads it. */
export interface JobRequest {
  getAllJobParams(): Record<string, string>;
}

export interface JobContext {
  /** Carry the project's credentials - Catalyst adds them, `catalyst serve` does locally. */
  catalystHeaders: Record<string, string>;
  closeWithSuccess(): void;
  closeWithFailure(): void;
}

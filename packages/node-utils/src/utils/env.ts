import { RuntimeError } from "@/errors/runtime_error";

/** Type representing a value that can be null or undefined */
type Nullable<T> = T | null | undefined;

type EnvTemplate = {
  TZ: Nullable<string>;
  /** Where Catalyst sends a new user from the confirmation email. */
  AUTH_REDIRECT_URL: Nullable<string>;
};

class EnvHelper {
  /** Reads one template key. Throws when a required key is unset or empty. */
  optional<K extends keyof EnvTemplate>(name: K): EnvTemplate[K] {
    const value = process.env[name];
    return value as EnvTemplate[K];
  }

  /** Reads one template key. Throws when a required key is unset or empty. */
  get<K extends keyof EnvTemplate>(name: K): NonNullable<EnvTemplate[K]> {
    const value = this.optional(name);
    if (value === undefined || value === null) {
      throw new RuntimeError(
        `Required environment variable ${name} is not set.`,
      );
    }
    return value as NonNullable<EnvTemplate[K]>;
  }
}

/** Singleton instance of EnvHelper for global environment configuration access */
export const env = new EnvHelper();

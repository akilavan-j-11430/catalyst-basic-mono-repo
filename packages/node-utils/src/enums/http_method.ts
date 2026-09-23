/**
 * Written as a frozen object rather than a TS `enum`: an enum emits runtime code, which
 * Node's strip-only type support rejects outright, and it would be the only one here.
 * `HttpMethod.Get` and the union type both come out of this.
 */
export const HttpMethod = {
  Get: "GET",
  Post: "POST",
  Put: "PUT",
  Patch: "PATCH",
  Delete: "DELETE",
} as const;

export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

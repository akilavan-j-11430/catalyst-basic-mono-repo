/**
 * Where the API lives. Next inlines a `NEXT_PUBLIC_*` value when it builds, so this is set
 * where the Slate app is built - Catalyst Console -> Slate -> web -> environment variables -
 * never in the code or a committed file. Unset, as it is locally, the API is on this
 * origin, behind `apps/proxy`.
 */
export const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "";

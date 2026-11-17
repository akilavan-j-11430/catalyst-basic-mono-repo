# Function entry point

`src/index.ts` is the entry point of every Catalyst function in this repo, whatever its
kind. The rule for each kind shows a full entry point. This file explains four things
they all must get right.

- **The export is `module.exports = handler` (or `= app`), exactly.** Catalyst calls the
  module itself, so the export has to be the function. `export default` bundles to
  `{ default: handler }`, which Catalyst cannot call. `export =` fails to typecheck under
  `base.json`'s `module: "ESNext"` (TS1203).
- **The entry point builds one `CatalystSession` per run and passes it down.** An Advanced
  I/O function builds it from the request's `headers`, through `initCatalystScopes`, as
  `apps/api` does. Every other kind builds it from the function's context:
  `CatalystSession.fromHeaders(context.catalystHeaders)`. No function calls `zcAuth.init`
  itself - the session does, awaited, the first time a wrapper asks for an app.
  Not yet run on a deployed function: the SDK recognises a function's context by its
  `catalystHeaders` key, and the session hands it `{ headers }`. If the first function's
  init rejects, give `CatalystSession` a way to pass the context through as-is.
- **Admin is the only scope wherever no signed-in user made the call.** That is always
  the case for a job or an event. A wrapper that asks for User throws `SCOPE_UNAVAILABLE`.
  The fix is to add an Admin path to the wrapper, not to build a User app.
- **Logging goes through `logger`.** Never bring in `catalyst-logger.ts`: it writes to
  AppSail's log descriptor, and a function does not have one.

`src/index.ts` is the bundle's only entry. A `src/dev-server.ts` is never imported from it,
so the dev server never ships.

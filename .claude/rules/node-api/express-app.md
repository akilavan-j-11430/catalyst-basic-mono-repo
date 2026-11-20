---
paths:
  - "apps/*/src/app.ts"
  - "apps/*/src/routes/**"
---

# An Express app

The shape every Node API in this repo is built in - an AppSail, or an Advanced I/O function.
None ships today (`code-placement.md`, "No API app until one is needed"); this is what the
first one is built from. Creating the workspace, its bundle and its deploy entries is the
`add-appsail` or `add-aio-fn` skill.

## Start from the last one

The repo had one, `apps/api`, with its plumbing in `packages/http-server` and its paths in
`packages/routing`. Restore them from git rather than writing them again:

```bash
deleted=$(git log -1 --format=%h --diff-filter=D -- apps/api/src/app.ts)
git show "$deleted^:packages/http-server/src/middleware.ts"
```

Bring the plumbing into the new app's own `src/`, not back into a package: with one app it
has one caller. It moves to `packages/http-server` when a second app that serves HTTP needs
it, and every such app then imports it from there and never copies it.

## Layout

```
apps/<name>/
  src/index.ts                AppSail: configure the logger, listen, shut down gracefully.
                              Advanced I/O: configure the logger, `module.exports = app`
  src/app.ts                  the Express app, without a listener - middleware order below
  src/env.ts                  every environment variable this app reads (environment.md)
  src/<name>-path.ts          every path segment (general/routing.md)
  src/middleware.ts           initExecutionContext, recordRequestTiming, initCatalystScopes, errorHandler
  src/http-error.ts           HttpError
  src/response.ts             toRecordResponse, toPagedResponse, toErrorResponse
  src/routes/<name>-router.ts the only place a router mounts
  src/routes/<segment>.ts     one router per segment
  src/<area>/                 the work behind the routes (code-placement.md)
test/
  setup.ts                    fakes zcAuth.init for every test (testing.md)
  integration/                the app from app.ts, driven through Supertest
```

`app.ts` builds the app without listening, so the deployed entry, a dev server and the
Supertest tests share one app.

## Middleware order

The order is load-bearing:

1. `express.json()`
2. the app's prefix -> `initExecutionContext`, then `recordRequestTiming`
3. the prefix and version -> `<name>Router`, which holds every route
4. `/` -> a JSON 404
5. `errorHandler`, last

`app.ts` mounts one router and `<name>-router.ts` composes the rest, so a new route cannot
land below the 404 and quietly answer it.

## The execution context and the scopes

- **`initExecutionContext`** gives every request an execution id and empty extras, and runs
  the rest of the chain inside `runWithContext`. It builds no Catalyst app.
- **`initCatalystScopes([...])`**, mounted ahead of a handler, calls
  `CatalystSession.setApp(req.headers, scope)` for each scope it lists. A route that names no
  scope never pays for an init; `router.use` it when every route on a router needs the same.
- **A listed scope that fails fails the request.** User with no signed-in caller answers 401
  before the handler runs; a failed Admin is a 500. A scope the route did not list is never
  built, and a wrapper that asks for it throws `SCOPE_UNAVAILABLE`.
- **`setApp` is awaited.** Unawaited, its promise reaches the SDK and fails later as
  `app.credential.getToken is not a function`.
- **Admin proves nothing about the caller.** The gateway grants it to anonymous requests too,
  so a route that needs a signed-in caller lists User.
- **Locally, every request goes through `catalyst serve`** and the proxy. Only the CLI adds
  the project headers `zcAuth.init` reads; called directly, every init fails with
  `app/invalid_project_details`.

A handler never initializes Catalyst and never reaches for the app. It calls a repository or
a handle, which reads the app from the execution context (`catalyst-sdk.md`).

## Input, errors and responses

- **Input** is checked with a zod schema through `InputValidation.parse` - `req.body`,
  `req.query`, `req.params` alike. It throws `InvalidInputError` naming the field, which
  `errorHandler` answers with a 400, so each message says what is wrong: `"is required."`.
- **Errors** are thrown as `HttpError.BadRequest | Unauthorized | NotFound | Conflict`, never
  set by hand. `errorHandler` maps them, logs anything else and answers it with a generic 500.
  A `CatalystError` or an `HttpRequestError` is caught only to map a specific case onto an
  `HttpError`.
- **Responses** are built with `toRecordResponse(data)`, `toPagedResponse(data, page,
  perPage, count, nextPageToken?)` or `toErrorResponse(message)`, so every payload shares one
  envelope. The envelope types live beside the builders until a caller in another workspace
  reads them, then in `@repo/types`.
- **Never set a CORS header** in an Advanced I/O function: Catalyst adds one, and a second
  copy makes the browser reject both.

Logging is `logging.md`; a call to an outside service is `outbound-http.md`.

## Build and bundle

- The workspace is CommonJS (`"type": "commonjs"`); its Vitest config is `vitest.config.mts`.
- `build` is `tsc --build tsconfig.build.json && tsc-alias -p tsconfig.build.json`.
- `bundle` is `scripts/bundle.mjs`: esbuild bundles `src/index.ts` with `format: "cjs"`,
  inlines every `@repo/*` package and strips them from the deployed manifest, and marks the
  rest external. So a package that reaches for something outside the bundle at runtime - a
  file on disk, a native module - works under `tsx watch` and fails when deployed.

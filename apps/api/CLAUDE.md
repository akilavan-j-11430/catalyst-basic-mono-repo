# apps/api

Express 5 API on `zcatalyst-sdk-node`. Deployed as the Catalyst AppSail named `api`,
reached only through `apps/proxy` at `/api`.

Port: `X_ZOHO_CATALYST_LISTEN_PORT`, else `PORT`, else **8000**.

## Layout

```
src/
|-- index.ts              app setup, middleware order, route mounting
|-- middleware.ts         execution context, request timing, terminal error handler
|-- routes/ping.ts        reference route - copy this shape
|-- errors/http_error.ts  typed failures that map to HTTP statuses
|-- utils/api.ts          response builders
`-- framework/catalyst_logger.ts   console -> Catalyst log pipe, imported for side effect
```

`catalyst_logger` is imported first in `index.ts` purely for its side effect: it
replaces the `console` methods so logs are framed for Catalyst's collector. It exports
nothing you should call.

## Middleware order

From `src/index.ts`, and the order is load-bearing:

1. `express.json()`
2. `/api` -> `initExecutionContext`, then `recordRequestTiming`
3. `/api` -> routers (`pingRouter`, ...)
4. `/` -> JSON 404 catch-all
5. `errorHandler` (terminal)

New routers mount at step 3. Below the catch-all they are unreachable - every request
404s instead.

## Execution context

`initExecutionContext` (`src/middleware.ts`) calls `catalyst.initialize(req)` and runs
the rest of the chain inside `runWithContext`. Catalyst reads the project details and
the caller's credentials off the request headers, so the app is per-request and nothing
needs configuring in the environment.

This is why requests must arrive through `catalyst serve` - only the CLI injects those
headers. Bypass it and `catalyst.initialize` throws `app/invalid_project_details`,
which `errorHandler` renders as a generic 500. If every `/api` route is 500ing in dev,
that is the cause, not your handler.

Handlers must **not** call `catalyst.initialize` themselves. Read it off the context:

```ts
import { currentContext } from "@repo/node-utils/framework/async_context";

const catalystApp = currentContext().manager.catalystApp;
```

`currentContext()` throws outside a request. Carry anything else request-scoped via
`manager.setExtras(key, value)` / `manager.getExtras<T>(key)`.

## Adding a route

`src/routes/ping.ts` is the reference:

```ts
import { Router } from "express";
import { toRecordResponse } from "@/utils/api";

export const pingRouter: Router = Router();

pingRouter.get("/ping", (_req, res) => {
  res.json(toRecordResponse({ message: "pong" }));
});
```

Mount it in `src/index.ts` with `app.use("/api", pingRouter)`, above the catch-all.

## Errors and responses

Throw `HttpError` (`src/errors/http_error.ts`) rather than setting a status by hand -
`BadRequest` 400, `Unauthorized` 401, `NotFound` 404, `Conflict` 409. `errorHandler`
maps those; anything else is logged and becomes a 500 with a generic message, so do not
expect a raw thrown error to surface its message to the client.

Every response goes through `src/utils/api.ts`:

- `toRecordResponse(data)` - single record
- `toPagedResponse(data, page, perPage, count, nextPageToken?)` - computes `totalPages`
  and `hasMore`
- `toErrorResponse(message)` - error shape

The shapes live in `@repo/types/api` so the web app imports the same ones.

## Logging

Use `logger` from `@repo/node-utils/framework/logger`, not `console`. It stamps the
execution ID and a per-request order number from the async context.

## Build

- `pnpm build` - `tsc --build && tsc-alias` into `dist/` (resolves the `@/*` alias).
- `pnpm bundle` - `scripts/bundle.mjs` esbuilds `src/index.ts` into `appsails/api/`.

The bundle script reads `package.json`, strips every `@repo/*` dependency from the
emitted manifest, and marks the rest external. Shared-package code is therefore
**inlined by esbuild at bundle time**, not resolved at runtime - so a shared package
that reaches for something outside the bundle (a file on disk, a native module) works
under `tsx watch` and breaks in AppSail.

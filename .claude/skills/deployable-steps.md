# Steps every deployable shares

Every `add-*` skill reads this file before its own steps. It covers the parts that are the
same for any AppSail, function or Slate app.

A new deployable changes the deploy surface, so the user agrees to it before anything is
built (root `CLAUDE.md`).

## The chain

Every deployable follows the same chain. Its source lives in a workspace, and
`scripts/bundle.mjs` stages a copy ready to deploy in a gitignored folder at the repo
root. `catalyst.json` points Catalyst at that folder, and the root `deploy` script names
it.

| | AppSail | Function | Slate app |
|---|---|---|---|
| Workspace | `apps/<name>` | `apps/<name>` | `apps/<name>` |
| Staged by `scripts/bundle.mjs` into | `appsails/<name>/` | `functions/<name>/` | `slate/<name>/` |
| Catalyst config, kept in the workspace and copied by the bundle | `app-config.json` | `catalyst-config.json` | `.catalyst/slate-config.toml`, CLI-generated |
| `catalyst.json` | an `appsail` entry, `source: "appsails/<name>"` | `<name>` in `functions.targets` | a `slate` entry, `source: "slate/<name>"` |
| Root `deploy` script | `--only ...,appsail:<name>` | `--only ...,functions:<name>` | `--only ...,slate:<name>` |

- **Use one name everywhere.** The workspace folder, the `package.json` name, the staged
  folder, the `catalyst.json` entry and the `--only` flag are all the same kebab-case
  string. The CLI accepts a hyphenated function name (`functions:add --name job-executor`).
- **Never edit the staged folder.** Every bundle wipes and rebuilds it, so change the
  workspace instead.
- **The bundle reads the workspace's `package.json`.** It strips every `@repo/*`
  dependency, which esbuild inlines, and installs the rest. A runtime dependency missing
  from that file is missing in the cloud.
- **Its paths**, if it serves HTTP or has a dev server, go in
  `packages/routing/src/<name>-path.ts`, named after the app as `api-path.ts` is for
  `api`. The first segment is the app's own prefix, never `/api`, which belongs to
  `apps/api`. In `apps/proxy/src/index.ts`, register a `createProxyMiddleware` for that
  prefix and port **before** the catch-all to `web`. If the app serves WebSockets, add the
  prefix to the `server.on("upgrade")` dispatch as well. This is the one change to
  `apps/proxy` a deployable makes, and it is what carries the headers `catalyst serve`
  injects through to the new app.
- **Local ports:** `api` uses 8000, `web` 4000 and `proxy` 4600. A new AppSail takes 8001
  and up, a function's dev server 8100 and up, and a Slate app 4001 and up.
- **Every new deployable gets** a `CLAUDE.md` in its workspace, a row in the root
  `CLAUDE.md` workspace table, and a line in the README architecture when the local
  routing changes.

## When the web app calls it

The browser calls no backend of ours. `apps/web` reaches an AppSail or an Advanced I/O
function from its server code - a page or a Server Action - through `HttpClient`
(`outbound-http.md`), so there is no `NEXT_PUBLIC_*` key, client pair or CORS to add:

- Its base URL is a server-side key on `apps/web/src/env.ts` (`BILLING_URL`), added in the
  four steps of `environment.md` and set in **Console -> Slate -> web -> Environment
  Variables**.
- No server-to-backend call exists yet, so the first one settles how it proves who the
  caller is - a route guarded with `initCatalystScopes([CatalystScope.User])` answers 401
  without it. Agree that with the user and write the decision into `apps/web/CLAUDE.md`.

## The shared Express plumbing: `@repo/http-server`

`packages/http-server` holds the Express plumbing every app that serves HTTP shares - a
second AppSail, an Advanced I/O function, the dev server of a job or Signal function:

- `@repo/http-server/middleware` - `initExecutionContext`, `initCatalystScopes`,
  `recordRequestTiming`, `errorHandler`, which answers `InvalidInputError` from
  `@repo/input-validation` with a 400
- `@repo/http-server/http-error` - `HttpError`
- `@repo/http-server/response` - the response builders

Import it; never copy it. It is the one package allowed to import `express`
(`packages/CLAUDE.md`). esbuild inlines it like every `@repo/*` package, but `express`
stays external, so every app that runs it in the cloud lists `express` in its own
`dependencies`.

`AppSailLogOutput` (`apps/api/src/framework/catalyst-logger.ts`) is specific to AppSail,
not to Express. The second AppSail moves it into `@repo/logger`, beside `Logger`. Every app
that logs lists `pino` in its own `dependencies`, as it does `express`.

## Before calling it done

- Run `pnpm verify`.
- Run `pnpm bundle`, then check the staged folder:
  - An AppSail has `index.js`, `package.json`, `app-config.json` and `node_modules/`.
  - A function has `catalyst-config.json` beside those.
  - A Slate app has `vendor/` and a `package-lock.json`.
- Make one real request through the URL `pnpm dev` prints - to the app, or to the
  function's dev server.
- After `pnpm deploy`, check the deployment in the Console. A Slate deploy can report
  success in the CLI even though the build failed on the server.

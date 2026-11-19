# apps/proxy

Reverse proxy that gives local development a single origin. Runs as the Catalyst
AppSail named `proxy`, and is the only service the browser talks to directly.

**This app is never deployed.** It exists for local development only. The cloud has no
equivalent: there the web app reads and writes on its own server (see the root
`.claude/CLAUDE.md`). It is declared in `catalyst.json` so `catalyst serve` can run it;
`pnpm run deploy` ships only `slate:web`. Do not add it to the deploy list.

Port: `X_ZOHO_CATALYST_LISTEN_PORT` when the CLI injects it (4600 in practice), else
**3000** as a standalone fallback. Under `catalyst serve` the CLI fronts it on a
separate, first-free port from 3000 upward - commonly 3001 or 3002. That printed URL is
the entry point, not 3000.

## Routing

`src/index.ts` registers one `http-proxy-middleware` instance, `webProxy`, which sends every
path to `http://localhost:4000` - `apps/web` (Next.js). It sets `changeOrigin: true` and
`ws: true` for HMR, and the `server.on("upgrade")` handler hands every WebSocket upgrade to
it. There is no path rewriting.

An app added later that serves HTTP - an API app, a function's dev server - gets its own
instance for its prefix, registered before `webProxy`, which takes every other path.
`.claude/rules/general/routing.md` shows it.

## Auth

`app-config.json` sets `catalyst_auth: true` with `login_redirect: "/"`. Locally, login
is enforced here. Nothing sits in front of a deployed app, so in the cloud each page, action
or route guards itself by naming the scopes it reads.

## Running

There is no `dev` script - the proxy runs from bundled output through the Catalyst CLI.
From the repo root:

```bash
pnpm dev      # everything: this proxy via catalyst serve, plus web and the package watchers
pnpm serve    # this proxy alone
```

`pnpm dev` runs `catalyst serve` with **stdin redirected from `/dev/null`**. When its
stdin is not a terminal, the CLI waits for EOF before starting the AppSail - and a
process manager's pipe never sends one, so it hangs. The front port still binds, so
every request 502s and it looks like a proxy fault. Do not drop that redirect.
Running `pnpm serve` yourself is unaffected: a terminal takes the interactive path.

Because it serves the bundle, **edits to `src/` require a re-bundle** to take effect.

Running `node appsails/proxy/index.js` by hand serves the pages but breaks every Catalyst
read: the Catalyst SDK parses project details off request headers, and only
`catalyst serve` injects them, so each fails with `app/invalid_project_details`.

## Build output

`scripts/bundle.mjs` wipes and rebuilds `appsails/proxy/` at the repo root:
esbuild bundles `src/index.ts` to `index.js` (cjs, node24, `packages: "external"`),
writes a minimal `package.json`, copies `app-config.json`, then runs `npm install`
there. `appsails/` is gitignored. `catalyst.json` points the AppSail source at it.

Note the package.json emitted by the bundle script is **hand-written inside the
script**, not derived from `apps/proxy/package.json`. Adding a runtime dependency
means editing that literal too.

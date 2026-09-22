# packages/

Shared code for the monorepo. All four are private and consumed as `"workspace:*"`.

| Package | Holds |
|---|---|
| `@repo/types` | API response shapes shared by `apps/api` and `apps/web` |
| `@repo/node-utils` | `ExecutionContext`, `logger`, `RuntimeError` |
| `@repo/typescript-config` | `base.json` that every tsconfig extends |
| `@repo/eslint-config` | flat ESLint config - currently unwired |

## Import paths

`@repo/types` and `@repo/node-utils` expose **subpaths**, not a barrel. The `exports`
block maps `./*` onto `./dist/*.js` + `./dist/*.d.ts`, so the import path mirrors the
path under `src/`:

```ts
import type { RecordResponse } from "@repo/types/api";              // src/api.ts
import { logger } from "@repo/node-utils/framework/logger";         // src/framework/logger.ts
import { currentContext } from "@repo/node-utils/framework/async_context";
```

There is no `@repo/types` root import. Adding a file under `src/` is enough to publish
a new subpath - no `exports` edit needed.

## Building

Both code packages are ESM (`"type": "module"`) and build with
`tsc --build && tsc-alias`; `tsc-alias` is what rewrites the internal `@/*` alias in
the emitted JS. `pnpm dev` at the root runs them in watch mode, so app changes pick up
package edits without a manual rebuild.

Consumers must be built after these. Turborepo handles that via `dependsOn: ["^build"]`.

## Rules

- **Keep them framework-free.** Both an Express app and a Next.js app import these.
  No `express`, no `react`, no Next.js imports. `zcatalyst-sdk-node` is fine in
  `node-utils` - it is server-side but framework-agnostic.
- Node-only APIs (`node:async_hooks`, `fs`) belong in `node-utils` and must never be
  reached from `apps/web`.
- `apps/api` bundles with esbuild and strips `@repo/*` from the deployed manifest, so
  package code is **inlined at bundle time**. Anything that needs to resolve at runtime
  - a file read relative to the package, a native module - will break in AppSail.
- snake_case file names, `@/*` for internal imports.

## A new package

`packages/<name>` with: `"private": true`, `"type": "module"`, the same `exports`
block, a tsconfig extending `@repo/typescript-config/base.json` with
`outDir: ./dist` / `rootDir: ./src` / the `@/*` path, and
`"build": "tsc --build && tsc-alias"`. Then add it to consumers as `"workspace:*"`.

---
name: add-appsail
description: Add a new Catalyst AppSail to this repo - an Express app with its workspace, app-config.json, bundle, catalyst.json and deploy entries, proxy route, and the web app wiring when it calls it. Use when a request must run past 30 seconds, work past 15 minutes, or a process must hold WebSockets or keep state between requests, or when asked to create an AppSail.
---

# Add an AppSail

1. **Agree it with the user.** It is a new deployable, so settle three things first: its
   name, for what it serves (`billing`); who calls it from outside the web app, and why a
   function will not do - "No API app until one is needed" in
   `.claude/rules/node-api/code-placement.md`; and whether the web app calls it.
2. **Read `.claude/skills/deployable-steps.md`.**
3. **Build `apps/<name>` as `.claude/rules/node-api/express-app.md` describes**, starting
   from the files restored from git in its "Start from the last one". Then:
   - `package.json`: `apps/api/package.json`, restored from git the same way, under the
     app's name. Keep its scripts; drop `@repo/http-server`, `@repo/routing` and any other
     dependency the app does not import.
   - `src/index.ts`: configure the logger with `CatalystLogOutput`, listen on
     `X_ZOHO_CATALYST_LISTEN_PORT`, then `PORT`, then a free local port from 8000 up, and
     on `SIGTERM` and `SIGINT` close the server and flush the logger before exiting
     (`general/logging.md`).
   - `app-config.json`: `command`, `build_path: "./"`, `stack: "node24"`, and `memory`
     (256-2048).
     - Leave out `env_variables`. Values never live in a Catalyst file
       (`environment.md`).
     - Leave out `catalyst_auth`. A route that needs a signed-in caller mounts
       `initCatalystScopes([CatalystScope.User])` instead.
   - `scripts/bundle.mjs`: the deleted `apps/api/scripts/bundle.mjs`, restored from git the
     same way, with `outDir` set to `appsails/<name>`.
   - `src/env.ts`, `turbo.json` (`dev` `passThroughEnv`) and `.env.example` for its own
     keys, in the four steps `environment.md` lists. Two AppSails never share a key list.
4. **Outside the workspace:**
   - `catalyst.json`: add `{ "source": "appsails/<name>", "name": "<name>" }` under
     `appsail`.
   - Root `package.json`: add `appsail:<name>` to the `deploy` script's `--only` list.
   - A proxy route for its prefix, as `deployable-steps.md` describes. Its paths stay in
     its own `src/<name>-path.ts` (`.claude/rules/general/routing.md`).
5. **If the web app calls it**, follow "When the web app calls it" in
   `deployable-steps.md`.
6. **In the Console**, set its environment variables under
   **AppSail -> <name> -> Configuration** before the first deploy that needs them.
7. **Verify** with "Before calling it done" in `deployable-steps.md`.

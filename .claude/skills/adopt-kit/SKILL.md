---
name: adopt-kit
description: Turn a fresh clone of catalyst-basic-mono-repo into a named solution - rename it everywhere the kit names itself and drop the starter-kit wording. Run once, right after cloning.
disable-model-invocation: true
---

# adopt-kit

Run this in a fresh clone of `catalyst-basic-mono-repo`, once, before any other change.
It renames the clone and removes the "starter kit" wording. It does not touch the deploy
surface, the domain, or the design.

## Inputs

All four are required. Stop and ask if one is missing; never invent one.

| Input | Example |
|---|---|
| `repoName` - kebab-case | `fest-checkin` |
| `title` - display name | `Fest Check-in` |
| `description` - one sentence, ends with a full stop | `Gate check-in for college fest passes.` |
| `kitSha` - short SHA of the kit commit that was cloned | `381d60d` |

## Edits

Make each edit below. Each "Current text" is what the kit ships; if it no longer
matches, the kit has changed - find the equivalent spot instead of skipping it.

| File | Current text | New text |
|---|---|---|
| `package.json` | `"name": "catalyst-basic-mono-repo"` | `"name": "<repoName>"` |
| `.claude/CLAUDE.md` line 1 | `# catalyst-basic-mono-repo` | `# <title>` |
| `.claude/CLAUDE.md` lines 3-4 | `Starter kit for Zoho Catalyst customer solutions. pnpm workspaces + Turborepo.` / `Clone, run \`catalyst init\` to bind it to your own Catalyst project, then build.` | `<description> pnpm workspaces + Turborepo.` / `Started from catalyst-basic-mono-repo@<kitSha>. Run \`catalyst init\` once per checkout to bind it to the Catalyst project.` |
| `.claude/CLAUDE.md` | the paragraph starting `This is a starter kit, so most tasks mean adding the *first* thing` | `Extend the shape that is already here instead of introducing a second one; "Adding to the repo" below is the checklist for each kind.` |
| `.claude/rules/catalyst-sdk.md` | `This is a starter kit, so it ships no resources. \`resources.ts\` arrives with the first one.` | `\`resources.ts\` arrives with the first resource; every later one is added there.` |
| `README.md` line 1 | `# catalyst-basic-mono-repo` | `# <title>` |
| `README.md` | the intro paragraph starting `A monorepo starter kit for building customer solutions` | `<description>` on its own line, then a blank line, then `Started from [catalyst-basic-mono-repo](https://github.com/akilavan-j-11430/catalyst-basic-mono-repo) at \`<kitSha>\`.` |
| `README.md` | `**What you get out of the box**` | `**What the stack gives you**` |
| `README.md` | the paragraph starting `It is deliberately small. There is no database layer` | delete it |
| `README.md` | under `## Make it yours`: the line `This is a template. When you start a real solution:` and the `**Rename the project.**` paragraph | delete both, and rename the heading to `## Changing the shape` |
| `apps/web/README.md` line 3 | `Next.js frontend for the Catalyst monorepo starter kit.` | `Next.js frontend for <title>.` |
| `apps/web/src/app/layout.tsx` `metadata` | `"Catalyst App"`, `"%s \| Catalyst App"`, `"A Catalyst starter app."` | `"<title>"`, `"%s \| <title>"`, `"<description>"` |

## Leave alone

- `catalyst.json` app names `api`, `web`, `proxy` - the deploy surface. They must match the
  Catalyst Console, each app's `scripts/bundle.mjs` output and the `--only` flags in the root
  `deploy` script.
- The `@repo/*` package scope and the workspace names `api`, `web`, `proxy` - turbo filters
  and scripts use them.
- `.catalystrc` - written by `catalyst init` for each developer.
- The generic phrase "Catalyst app" in code comments - it means a Catalyst SDK app instance,
  not the kit.

## Sweep

```bash
rg -n -i --hidden -g '!node_modules' -g '!pnpm-lock.yaml' -g '!.git' -g '!.claude/skills/adopt-kit' \
  'basic-mono-repo|starter kit|starter app|Catalyst App"|this is a template'
```

The only allowed hit is the `Started from catalyst-basic-mono-repo` line in `README.md` and
`.claude/CLAUDE.md`. `slate/` and `appsails/` are gitignored build output and are
regenerated, so `rg` skipping them is correct.

## Finish

Delete this skill's folder, `.claude/skills/adopt-kit/`, and `.claude/skills/` if it is now
empty. A finished solution has no use for it.

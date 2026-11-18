---
paths:
  - "apps/web/**"
---

# Where code goes in apps/web

Next.js runs code in two places - the server (Server Components, Server Actions, route
handlers) and the browser - and this rule says where each piece of server-side work starts
and when it moves. Code starts as small as it can and moves only when a real caller asks
for it, the same rule as "a file earns its existence from a second caller" in the root
`CLAUDE.md`.

Until the API moves into Next.js, the browser's calls to `apps/api` still follow
`web-data-access.md`. This rule is for every page, form and endpoint written the Next.js
way.

## Not built yet

These arrive with the first Server Action, so the examples below name them before they
exist:

- `src/execution-context.ts` - `withExecutionContext` and `renderExecution`, below.
- `CatalystRequest.session()` - the request's Catalyst session, built from Next's request
  headers.
- The `server-only` package and the ESLint rule that keeps server files out of the browser.
- `@repo/async-context` as a dependency of `apps/web`, which needs `scripts/bundle.mjs` to
  vendor a package that has dependencies of its own.

Still unproven, and checked by the deploy spike before any of it is built: whether Slate's
Next.js server receives the `x-zc-*` credential headers, a signed-in user's included.

## Where it starts

| You need | It starts in |
|---|---|
| a page that shows data | the Server Component that shows it, reading during render - no API call, no loading state for it |
| a form that changes data | a Server Action - a `"use server"` file beside its page: `app/(auth)/sign-up/register-user.ts` |
| an endpoint something outside the app calls - a mobile app, a webhook, a Catalyst function | `app/api/.../route.ts`, its handler written in the `GET` / `POST` export |
| data | always `@repo/catalyst-node` - a repository or a handle, passed the request's session. Never ZCQL or an SDK call in `apps/web` |

A Server Action and a route handler are both plain async functions - no wrapper of our own
besides `withExecutionContext`. Use an action for a write from our own pages, and a route
handler only for a caller outside the app, a parallel or polled read, or a streamed file.

## The execution context

Each entry point starts one execution context, so its log lines share one Execution ID.
Next.js has two kinds of entry point, and each needs its own mechanism - checked in
`next dev` on Next 16.3:

| Entry point | Mechanism | Why |
|---|---|---|
| a Server Action, a route handler | `withExecutionContext(handler)` - runs the handler inside `runWithContext` | one async function, so the context holds across every `await` |
| a page render - the layout, the page and every component in it | `renderExecution()` - one context per render, from React's `cache()` | React renders child components outside any `run`, so a context started in a page or layout never reaches them; `cache()` is shared by the whole render |

`@repo/logger` is configured once, in `instrumentation.ts`, to look in both - the async
context first, then the render's. An action's lines and the page re-render that follows it
in the same POST get two ids.

```ts
// app/(auth)/sign-up/register-user.ts
"use server";

export const registerUser = withExecutionContext(async (input: unknown): Promise<RegisterResult> => {
  try {
    const user = InputValidation.parse(newUserSchema, input);
    const registered = await UserManagement.register(await CatalystRequest.session(), {
      user,
      redirectUrl: env.get("AUTH_REDIRECT_URL"),
    });
    return { ok: true, registered };
  } catch (error) {
    if (error instanceof InvalidInputError) {
      return { ok: false, field: error.field, problem: error.problem };
    }
    throw error;
  }
});
```

```ts
// app/(app)/layout.tsx - a read, during render; renderExecution needs no call here
const user = await UserManagement.currentUser(await CatalystRequest.session());
```

## When it moves

Each move is made when its trigger happens, never in advance:

| When | Move it to |
|---|---|
| a second place in the app needs the same operation, or the same access check | `src/<area>/<areas>.ts` - `src/account/accounts.ts`, class `Accounts` - and both callers use it |
| a second form or endpoint needs the same input rules | `src/<area>/<area>-validation.ts` |
| a second area needs a component | the root `src/components/` |
| another deployable needs the operation - a job, a Signal function, an AppSail | a package, `packages/<area>` (`@repo/accounts`), that the web app and the deployable both import. Nothing imports from an app |
| an area file passes ~300 lines, or holds groups that have nothing to do with each other | one file per group - `account-members.ts`, `account-billing.ts` - and a subfolder per group (`account/members/`) once a group itself grows |

## An area

```
src/account/
  accounts.ts             Accounts - what the app does with accounts, on the server
  account-validation.ts   the input schemas, shared by the form and the server
  components/             the account screens
```

- **Named after the business.** `account/`, `invoice/`, `patient/` - straight under `src/`,
  with no `features/` or `domains/` folder around them.
- **No pattern or framework words in a name.** `Accounts`, not `AccountService`;
  `account-validation.ts`, not `-schema.ts`; no `-controller`, no `-actions`.
- **An area uses another only through its `<areas>.ts`** - never its components or its
  Server Actions. An operation that belongs to two areas lives in the one that owns the
  data it changes.

## A Server Action

Every exported function of a `"use server"` file is a public POST endpoint - Next gives it
a hidden id and the browser calls it with a POST - so anyone can call it, not only your
form.

- **It checks its input** with `InputValidation.parse` and returns an `InvalidInputError` as
  `{ ok: false, field, problem }`. It returns its errors rather than throwing them: Next
  shows the browser only a digest of a thrown error. Any other error is thrown, and Next
  logs it and shows the error page.
- **It gets its session only from a call that rejects an anonymous caller,** so a forgotten
  check means no data access rather than open access.
- The form runs the same schema through react-hook-form's `zodResolver`, so the browser and
  the server check the same rules.

## A route handler

`route.ts` holds its own handler - no separate controller file, since the handler has one
caller. A handler checks its input, makes one call to its area and returns the result. It
does nothing else; anything more is business logic and belongs in the area.

## Validation

Input is checked with a zod schema through `InputValidation.parse`
(`@repo/input-validation/input-validation`) - never a check per field. Validation is shape
only: required, an email, a number in range. A rule about the business - "an account with
members cannot be deleted" - is not validation; the area throws it. A schema lives in the
file that uses it until a second caller moves it to `<area>-validation.ts`.

## Boundaries that hold from the first file

These do not wait for a second caller, because breaking one is a security problem, not a
tidiness one:

- **Server and browser code never mix.** Every file that runs only on the server imports
  `server-only`, and ESLint stops a client component from importing a server file or a
  Node-only package.
- **No credential leaves the server.** Never log, return or pass to a client component a
  request header or a failed Catalyst init error - both carry the `x-zc-*` credential
  tokens.
- **One execution context per entry point,** as above - and nothing below an entry point
  starts another, or its lines lose the entry point's id.

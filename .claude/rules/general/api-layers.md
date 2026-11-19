# Routes, services and repositories

Server code that answers a call is split three ways - route, service, repository - the
controller-service-repository layering most backends use. Each layer has one job, and a
layer is skipped when it would only pass a call through.

| Layer | Does | Never |
|---|---|---|
| **Route** - `apps/api/src/routes/` | Turns HTTP into one call and back: validate the input's shape, call one operation, build the response, choose the status | holds a business rule, or calls a table, `Zcql` or the SDK |
| **Service** - `src/services/<domain>-service.ts` | One business operation - admit a patient, approve an invoice: the rule, and the coordination across repositories and handles | knows `req`, `res`, a status code or the response envelope |
| **Repository** - `@repo/repositories` | Loads and saves this app's records - ZCQL and column names for a table, field mapping for a CRM - behind business-named methods | decides anything about the business |

## The route

A route reads as five lines: validate, call, respond.

```ts
meRouter.get(ApiPath.Me, initCatalystScopes([CatalystScope.User]), async (_req, res) => {
  res.json(toRecordResponse(await UserManagement.currentUser()));
});
```

- **Validation is the route's job**, and only of shape - a required field, an email, a
  number in range. The route declares a zod schema and calls `InputValidation.parse`
  (`@repo/input-validation/input-validation`), never a hand-written check per field - see
  "Validating input" in `apps/api/CLAUDE.md`.
- A rule about the business - "a discharged patient cannot be admitted again" - is not
  validation. It belongs to the service, which throws, and the route lets it reach
  `errorHandler`.
- `HttpError` and the response builders stay in the route. A service throws its own or the
  wrapper's error, and the route maps it only when a specific status is wanted.

## The service

Add one when the work is more than a single data call:

- it holds a business rule;
- it coordinates two or more repositories or handles;
- or a second caller needs the same operation - a job function, a Signal handler, another
  route. Logic written in a route is reachable only over HTTP.

Until then a route calls the repository or wrapper directly, as `/me` calls
`UserManagement.currentUser()`. A service that only forwards one call is the empty layer
the root instructions rule out - the same rule as "a file earns its existence from a second
caller".

A service is a class with static members (`code-design.md`), takes and returns domain
types from `@repo/types`, and names the business operation, not the storage:
`AdmissionService.admit(patientId)`, not `PatientService.updateRow(...)`.

It lives in `apps/api/src/services/` while only `apps/api` calls it. When a function or a
second AppSail needs it, it moves to a shared server package, since nothing can import from
an app.

## The repository

A repository (Repository pattern) loads and saves this app's records behind methods named for
the business - `TodoRepository.find(todoId)`, `ContactRepository.listByOwner(ownerId)`. Where
the records live is its own detail: a Data Store table today, Postgres or a CRM tomorrow.

Repositories live in their own package, `@repo/repositories` (`packages/repositories/src/`),
one class per aggregate, `<name>-repository.ts`. Not in `catalyst-node`: that package wraps the
SDK and would serve any Catalyst solution, while repositories are this solution's data model
and change with the product. The package also holds `resources.ts`, every Catalyst resource
handle this app declares (`catalyst-sdk.md`), since those are this solution's too. It depends
on `@repo/catalyst-node` and calls its wrappers, never `@zcatalyst/*`, and the web app, every
AppSail and every function import it, so none writes its own queries. It does not exist yet:
it arrives with the first resource.

A route or a service never touches a table handle or `Zcql`. ZCQL, column names and `ROWID`
are all Catalyst's, the deepest lock-in here, so they stay in one place: the table's
repository, the only code that imports that table's handle and names its columns. Moving to
Postgres then rewrites the repository and leaves every caller alone:

```ts
// packages/repositories/src/todo-repository.ts
/** Repository: every Data Store read and write of todos, and the only code naming their columns. */
export class TodoRepository {
  static async find(todoId: string): Promise<Todo | undefined> {
    const storedTodo = await todoTable.runIn(CatalystScope.User).getRow(todoId);
    return storedTodo && TodoRepository.toTodo(storedTodo);
  }

  private static toTodo(storedTodo: StoredRow<TodoRow>): Todo {
    return { todoId: storedTodo.ROWID, title: storedTodo.TITLE, notes: storedTodo.NOTES ?? undefined };
  }
}

// apps/api/src/routes/todo.ts
const todo = await TodoRepository.find(req.params.todoId);
```

A service calls a repository; a route calls one directly only while there is no service in
between. Bucket, cache and job handles need no repository - a route or service calls their
wrappers directly - but their handles live in `@repo/repositories`'s `resources.ts` too.

### An outside service: a repository or a client

Calling an outside service - a CRM, a payment provider, a mailer - is one of two things, and
the test is how you would say it:

| You would say | It is | Lives in |
|---|---|---|
| "the contacts", "the deals" - records this app treats as its own data, kept in the service | a **repository**, `ContactRepository`, built on `HttpClient`, mapping the service's fields to a domain type the way a table repository maps columns | `@repo/repositories`, beside the table repositories |
| "tell the CRM to..." - create a lead from a sign-up, start a workflow, send a campaign | a **client** for the service, a class named after it - `ZohoCrm.createLead(...)` - built on `HttpClient` | its own package, `packages/<service>/` (`packages/zoho-crm`), the one seam for that vendor |

Either way the service's casing, auth and errors stay inside it (`outbound-http.md`), and the
caller sees only domain types and `HttpRequestError`. A service used both ways gets both: the
repository for its records, the client for its actions, sharing one `HttpClient`.

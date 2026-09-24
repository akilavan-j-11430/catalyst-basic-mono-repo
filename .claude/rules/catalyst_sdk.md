# Catalyst SDK access

Every Catalyst SDK call goes through `packages/node-utils/src/services/catalyst/`. No
`@zcatalyst/*` package may be imported anywhere else. ESLint enforces it; the only other
exemption is `framework/async_context.ts`, which carries the app's type across the request.

One file per component - `bucket.ts`, `table.ts`, `zcql.ts`, `cache.ts`, `job.ts` - plus
`resources.ts`, which names the resources, and `job_scheduling_enums.d.ts`, which makes
the SDK's enums importable. Each component builds the SDK client
it needs itself, in a module-private accessor at the top of the file, and reaches for the
app nowhere else:

```ts
// packages/node-utils/src/services/catalyst/bucket.ts
import { Stratus } from "@zcatalyst/stratus";
import { currentContext } from "@/framework/async_context";

function stratus(): Stratus {
  return new Stratus(currentContext().manager.catalyst);
}
```

That is what the directory buys: one place to read to know everything this repo asks of
Catalyst, and a boundary ESLint can name.

## Reaching a resource

A wrapper instance is a **handle**: it holds a name and nothing else. Build it once, at
module scope, in `resources.ts` - one `export const` per Catalyst resource this repo uses,
and the only place a wrapper is ever constructed:

```ts
// packages/node-utils/src/services/catalyst/resources.ts
import { Bucket } from "@/services/catalyst/bucket";
import { Cache } from "@/services/catalyst/cache";
import { Job } from "@/services/catalyst/job";
import { Table } from "@/services/catalyst/table";

export const todoTable = Table.create("todo");
export const invoiceBucket = Bucket.create("invoices");
export const sessionCache = Cache.create();
export const reminderJob = Job.create<{ todoId: string }>({
  jobName: "reminder",
  aliasName: "reminder",
  jobPoolName: "default",
  jobTargetFunctionName: "job_executor",
});
```

**Always `create`, never `new`.** The constructors are private precisely so that this file
is the only seam. Import the handle wherever it is needed, and never declare a second one
for a resource that already has one:

```ts
import { todoTable } from "@repo/node-utils/services/catalyst/resources";

const todo = await todoTable.getRow(rowId);
```

It lives here rather than in an app because `apps/api` is one AppSail among however many a
solution grows, and two apps reaching the same table must not name it twice.

The four factories differ, because the resources do:

| Factory | Argument |
|---|---|
| `Table.create("todo")` | the table name |
| `Bucket.create("invoices")` | the bucket name |
| `Cache.create()` | a segment **id**, not a name - omit it for the project default segment |
| `Job.create<T>({ jobName, aliasName, jobPoolName, jobTargetFunctionName })` | a config object, where `T` types the job's params and `aliasName` may not exceed 20 characters |

`jobTargetFunctionName` is the function the job pool invokes. There is no default: a job
that does not say what runs it is a deploy-time failure nothing catches, so every job names
its own. Several jobs may share one executor, which dispatches on the `jobName` carried in
the params.

Both methods take a single object. `submitJob` queues the job now; `submitOneTimeCron`
schedules it, and its `cronName` is required, unique in the project, and capped at 20
characters like the alias:

```ts
await reminderJob.submitJob({ params: { todoId: "1" } });
await reminderJob.submitOneTimeCron({
  timeOfExecution: runAt,          // epoch milliseconds
  params: { todoId: "1" },
  cronName: "remind-0001",
});
```

A job that takes no params is `Job<void>` - the generic's default - and then the `params`
key is gone rather than empty:

```ts
export const nightlyReportJob = Job.create({
  jobName: "nightly_report",
  aliasName: "nightly_report",
  jobPoolName: "default",
  jobTargetFunctionName: "report_executor",
});

await nightlyReportJob.submitJob({});
await nightlyReportJob.submitOneTimeCron({ timeOfExecution: runAt, cronName: "nightly-01" });
```

The generic decides which, so the two cannot be confused: passing a payload to a void job,
or omitting one from a typed job, is a compile error.

`Zcql` is the exception and has no handle. A query joins across tables and belongs to no
single one, so it is static and called directly - `Zcql.executeQuery("SELECT ...")`.

This is a starter kit, so it ships no resources. `resources.ts` arrives with the first one.

## A handle is hoisted, a client is not

Two objects, two opposite rules, and only one of them has a security consequence.

The **handle** - `todoTable`, `invoiceBucket` - holds a name. Hoisting it to module scope
is the whole point of `resources.ts`.

The **SDK client** - `Datastore`, `Stratus`, `Cache`, `JobScheduling` - is built from the
per-request app, which carries the caller's credentials. **Call the accessor per use, and
never assign a client to a module-level `const`**, or one held across requests serves
another user's data.

That is why every accessor is a function and every method calls it again, and it is what
makes the handle safe to hoist. Nothing structural enforces it - the accessors live in five
files - so check it when reviewing a wrapper.

## Writing a wrapper

One file per component, flat under `services/catalyst/`. A wrapper exists to give this
repo's vocabulary to a Catalyst call, so:

- Take and return plain values - `string`, `Readable`, a domain type. Never hand an SDK
  object back to a caller, or the seam leaks.
- Throw `CatalystError` (`@/errors/catalyst_error`) with an `ErrorCode`, never a raw SDK
  error.
- Validate what Catalyst will reject anyway - a TTL under 60s, an alias over 20 chars -
  before spending the round trip.
- Keep the constructor `private` and expose a `static create(...)`, so construction stays
  in `resources.ts`.

## A missing capability is a new method

**When a route needs something the wrapper does not do yet, add the method to the
wrapper.** Never reach past it - not to the SDK, not to the app on the context, not with
a one-off client built at the call site. The ESLint boundary stops the import, but the
rule is about intent: the point of `services/catalyst/` is that one directory answers
what this repo asks of Catalyst, and a capability used from a route is invisible there.

So `listObject` on `Bucket`, `getPagedRows` on `Table`, `submitOneTimeCron` on `Job` -
each arrived because something needed it. Add the next one the same way, following the
rules above, and call it from the route:

```ts
// packages/node-utils/src/services/catalyst/bucket.ts
async copyObject(sourceKey: string, targetKey: string): Promise<void> {
  ...
}

// apps/api/src/routes/invoice.ts
await invoiceBucket.copyObject(draftKey, finalKey);
```

A method that turns out to be single-use is still the right shape. It costs one small
function and keeps the seam whole.

## The SDK exports almost nothing

`@zcatalyst/*` packages export only their top-level client. `Bucket`, `Table`, `Segment`
and every payload type are internal. Derive what you need from the method that produces
it rather than deep-importing a built file, which would break on any upgrade:

```ts
type CatalystBucket = ReturnType<Stratus["bucket"]>;
type SubmitInput = Parameters<JobScheduling["JOB"]["submitJob"]>[0];
```

The enums need a bridge. `@zcatalyst/job-scheduling` declares `CRON_TYPE`, `TARGET_TYPE`
and the rest but re-exports none of them from its package root, and its build output
splits them: the **values** are in `dist-es/utils/enum.js` with no declarations beside
them, the **declarations** in `dist-types/utils/enum` with no JS. Importing either alone
fails - `dist-types` type-checks and then throws at runtime, `dist-es` runs but is an
implicit `any`.

`job_scheduling_enums.d.ts` joins them, declaring the `dist-es` module with the
`dist-types` types, so the enum imports normally and `TARGET_TYPE.FUNCTION` is used
directly. This survives the CJS bundle because AppSail runs **node24**, where `require()`
of an ESM file is supported - on an older runtime it would not.

Both paths are build artefacts rather than a public API. Re-check them on every upgrade,
and prefer a derivation off a method signature wherever one is possible.

## Known rough edges in the modular SDK

- `createCron` is typed with its *response* shape, so its input demands `id`, `end_time`
  and `cron_execution_type` that only the server produces. `job.ts` casts through
  `unknown` for that one call and builds the payload field by field.
- `@zcatalyst/zcql` is at **0.0.2** while the rest are 1.0.0. It is the least settled
  dependency here; expect its API to move. `zcql.ts` goes through `Datastore` instead.
- `createCron` takes `ICatalystCronDetails`, the *response* shape, so its input demands
  `id`, `end_time` and `cron_execution_type` that only the server produces. That is what
  the cast through `unknown` is for; the enum fields themselves are typed correctly.
- `getSegmentDetails(id)` and `segment(id)` take a segment **id**, not a name.

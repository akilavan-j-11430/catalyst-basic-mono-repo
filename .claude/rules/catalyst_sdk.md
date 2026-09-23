# Catalyst SDK access

Every Catalyst SDK call goes through `packages/node-utils/src/services/catalyst/`. No
`@zcatalyst/*` package  may be imported anywhere else. ESLint enforces it; the only other exemption is `framework/async_context.ts`, which carries the app's type across the request.

One file per component - `bucket.ts`, `table.ts`, `zcql.ts`, `cache.ts`, `job.ts`. Each builds the SDK
client it needs itself, in a module-private accessor at the top of the file, and reaches for
the app nowhere else:

```ts
// packages/node-utils/src/services/catalyst/bucket.ts
import { Stratus } from "@zcatalyst/stratus";
import { currentContext } from "@/framework/async_context";

function stratus(): Stratus {
  return new Stratus(currentContext().manager.catalystApp);
}

private bucket(): CatalystBucket {
  return stratus().bucket(this.name);
}
```

That is what the directory buys: one place to read to know everything this repo asks of
Catalyst, and a boundary ESLint can name.

## Why the app is not cached

**Call the accessor per use. Never assign a service to a module-level `const`.** Each call
builds a fresh service object; they are thin handles over the per-request app, and that app
carries the caller's credentials, so one held across requests serves another user's data.

This is the only rule here with a security consequence, and the one nothing structural
enforces - the accessors live in four files, so it holds by convention. Check it when
reviewing a wrapper.

## Writing a wrapper

One file per component, flat under `services/catalyst/`. A wrapper exists to give this
repo's vocabulary to a Catalyst call, so:

- Take and return plain values - `string`, `Readable`, a domain type. Never hand an SDK
  object back to a caller, or the seam leaks.
- Throw `CatalystError` (`@/errors/catalyst_error`) with an `ErrorCode`, never a raw SDK
  error.
- Validate what Catalyst will reject anyway - a TTL under 60s, an alias over 20 chars -
  before spending the round trip.

## The SDK exports almost nothing

`@zcatalyst/*` packages export only their top-level client. `Bucket`, `Table`, `Segment`
and every payload type are internal. Derive what you need from the method that produces
it rather than deep-importing a built file, which would break on any upgrade:

```ts
type CatalystBucket = ReturnType<Stratus["bucket"]>;
type SubmitInput = Parameters<JobScheduling["JOB"]["submitJob"]>[0];
```

Where a derivation is impossible - the SDK's enums are exported from neither its root nor
its types - mirror the wire value in `@/enums/` and cast once, at the call. `TargetType`
is the only such case today.

## Known rough edges in the modular SDK

- `createCron` is typed with its *response* shape, so its input demands `id`, `end_time`
  and `cron_execution_type` that only the server produces. `job.ts` casts through
  `unknown` for that one call and builds the payload field by field.
- `@zcatalyst/zcql` is at **0.0.2** while the rest are 1.0.0. It is the least settled
  dependency here; expect its API to move.
- `getSegmentDetails(id)` and `segment(id)` take a segment **id**, not a name.

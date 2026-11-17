import { Cache as CacheClient } from "@zcatalyst/cache";
import { CatalystScope } from "@/catalyst-scope";
import type { CatalystSession } from "@/catalyst-session";

/** The SDK exports only its top-level clients, so segment/bucket/table types are
 *  derived from the methods that produce them rather than imported. */
type Segment = ReturnType<CacheClient["segment"]>;

/** Fresh per call. The app is per-request and carries the caller's credentials,
 *  so a service must never be hoisted to module scope. Cache is admin-only.
 *  Never construct the client without an app: the SDK then falls back to whichever
 *  request called `zcAuth.init` last, and switches that request's credential to admin. */
async function cacheClient(session: CatalystSession): Promise<CacheClient> {
  return new CacheClient(await session.app(CatalystScope.Admin));
}

/** A cache segment bound to a request. Reached only through `Cache.runIn`. */
class ScopedCache {
  constructor(
    private readonly session: CatalystSession,
    private readonly segmentId?: string,
  ) {}

  // getSegmentDetails is a round trip, so it only runs when a specific segment is named.
  private async segment(): Promise<Segment> {
    const client = await cacheClient(this.session);
    if (!this.segmentId) {
      return client.segment();
    }
    return client.getSegmentDetails(this.segmentId);
  }

  /** Writes a cache entry. `expiryHours` defaults to the segment's own expiry. */
  async putValue(
    key: string,
    value: string,
    expiryHours?: number,
  ): Promise<void> {
    const segment = await this.segment();
    await segment.put(key, value, expiryHours);
  }

  /** Reads a cache entry; undefined when absent or expired. */
  async getValue(key: string): Promise<string | undefined> {
    const segment = await this.segment();
    const value = await segment.getValue(key);
    return value ?? undefined;
  }

  /** Deletes a cache entry. */
  async deleteValue(key: string): Promise<boolean> {
    const segment = await this.segment();
    return segment.delete(key);
  }
}

export type { ScopedCache };

/** A Catalyst cache segment. Omit the id to use the project's default segment. Holds the id
 *  only; every operation goes through `runIn`. Cache is admin-only, so it takes no scope. */
export class Cache {
  private constructor(private readonly segmentId?: string) {}

  /** The segment's operations, acting with the session's Admin credentials. */
  runIn(session: CatalystSession): ScopedCache {
    return new ScopedCache(session, this.segmentId);
  }

  /** Creates a handle to a named segment, or the default segment when omitted. */
  static create(segmentId?: string): Cache {
    return new Cache(segmentId);
  }
}

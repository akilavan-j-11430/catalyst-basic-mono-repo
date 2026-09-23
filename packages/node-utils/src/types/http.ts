import type { HttpMethod } from "@/enums/http_method";

/** What a transport is expected to put on the wire as-is. Deliberately not fetch's
 *  `BodyInit`: that includes streams, which not every client can consume. */
export type RequestBody =
  | string
  | Uint8Array
  | ArrayBuffer
  | Blob
  | URLSearchParams
  | FormData;

/** A fully resolved request. The client has already applied the query string,
 *  merged the headers and encoded the body. */
export interface TransportRequest {
  method: HttpMethod;
  url: string;
  headers: Record<string, string>;
  body?: RequestBody;
  timeoutMs: number;
}

/** Undecoded bytes plus the response headers. Deciding what the bytes mean is the
 *  client's job, and decoding here would make a binary response unrecoverable. */
export interface TransportResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

/**
 * The single seam between HttpClient and whatever library puts bytes on the wire.
 * Moving off fetch means writing one more implementation of this and passing it to
 * the client - no call site changes.
 *
 * A transport puts the request on the wire and reports what came back. It does not
 * decide what a status means and does not throw for a non-2xx.
 */
export type HttpTransport = (
  request: TransportRequest,
) => Promise<TransportResponse>;

/** The body in whichever form the caller needs. Reading is deferred, so a response
 *  nobody reads costs nothing and a binary one is never mangled. */
export interface ResponseBody {
  /** The bytes exactly as they arrived. Use this for anything that is not text. */
  raw(): Promise<Uint8Array>;
  /** UTF-8 decoded. An empty body gives `""`. */
  text(): Promise<string>;
  /** Parsed JSON, or `undefined` for an empty body.
   *  Rejects with `HttpRequestError.Undecodable` when the body is not JSON. */
  json(): Promise<unknown>;
}

export interface HttpResponse {
  status: number;
  /** Lower-cased header names, as every transport is expected to supply them. */
  headers: Record<string, string>;
  body: ResponseBody;
}

export type QueryValue = string | number | boolean;

/** Resolved on every call, so a token that expires can be refreshed per request. */
export type HeaderResolver = () =>
  | Record<string, string>
  | Promise<Record<string, string>>;

export interface HttpClientOptions {
  /** Absolute base every path is resolved against. Its own path is preserved. */
  baseUrl: string;
  /** Authorization and anything else every call to this service carries. */
  headers?: HeaderResolver;
  timeoutMs?: number;
  /** Swap seam - defaults to fetch. Pass `createFetchTransport({ dispatcher })` to
   *  control pooling, proxying or TLS. */
  transport?: HttpTransport;
}

export interface RequestOptions {
  query?: Record<string, QueryValue>;
  /** Merged over the client defaults. A `HttpHeader.ContentType` entry here refines the
   *  type detected from the body. */
  headers?: Record<string, string>;
  /** Overrides the client's timeout for this one call - a slow export, a big upload. */
  timeoutMs?: number;
}

/**
 * Node's answer to an `http.Agent`: connection pooling and keep-alive, proxying, mTLS
 * client certs, a custom CA. An `http.Agent` itself does nothing here - fetch takes an
 * undici `Dispatcher`.
 *
 * Taken off the global `RequestInit` rather than imported from `undici-types`, which is
 * a transitive type-only package this workspace cannot resolve.
 */
export type FetchDispatcher = NonNullable<RequestInit["dispatcher"]>;

export interface FetchTransportOptions {
  /** Omit it and undici uses its global dispatcher, which already pools connections. */
  dispatcher?: FetchDispatcher;
}

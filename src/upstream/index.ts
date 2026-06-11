/**
 * Upstream auth: how your MCP server authenticates to the API/service it wraps.
 * Zero dependencies, zero transport assumptions. Works with stdio or HTTP servers.
 */
import { DEFAULT_TIMEOUT_MS, fetchWithRetry, fetchWithTimeout } from '../internal/http.js';

/** A strategy that produces the headers to attach to each upstream request. */
export interface UpstreamAuth {
  /** Returns headers to merge into every upstream request. May refresh tokens internally. */
  headers(): Promise<Record<string, string>>;
}

/**
 * Thrown when an OAuth token endpoint responds with an error or a malformed body.
 * Carries the HTTP `status` and raw `responseBody` so callers can branch on them.
 */
export class TokenRequestError extends Error {
  readonly status?: number;
  readonly responseBody?: string;
  constructor(message: string, opts?: { status?: number; responseBody?: string; cause?: unknown }) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'TokenRequestError';
    this.status = opts?.status;
    this.responseBody = opts?.responseBody;
  }
}

export interface ApiKeyAuthOptions {
  /** The API key / token value. */
  key: string;
  /** Header to send it in. Default `Authorization`. */
  header?: string;
  /**
   * Scheme prefix for the value, e.g. `Bearer` -> `Authorization: Bearer <key>`.
   * Defaults to `Bearer` when the header is `Authorization`, otherwise no prefix
   * (e.g. `X-Api-Key: <key>`). Pass `null` to force a raw value.
   */
  scheme?: string | null;
}

/** Static API-key auth. The most common MCP-server-to-API pattern. */
export function apiKeyAuth(opts: ApiKeyAuthOptions): UpstreamAuth {
  if (!opts.key) throw new Error('apiKeyAuth: `key` is required');
  const header = opts.header ?? 'Authorization';
  const scheme =
    opts.scheme === undefined ? (header.toLowerCase() === 'authorization' ? 'Bearer' : null) : opts.scheme;
  const value = scheme ? `${scheme} ${opts.key}` : opts.key;
  const headers = { [header]: value };
  return { headers: async () => ({ ...headers }) };
}

/** A bearer token, or a (possibly async) function that resolves one per call. */
export type TokenSource = string | (() => string | Promise<string>);

/** Bearer-token auth. Pass a function when the token rotates or is fetched lazily. */
export function bearerAuth(token: TokenSource, header = 'Authorization'): UpstreamAuth {
  return {
    async headers() {
      const t = typeof token === 'function' ? await token() : token;
      if (!t) throw new Error('bearerAuth: token resolved empty');
      return { [header]: `Bearer ${t}` };
    },
  };
}

export interface ClientCredentialsOptions {
  /** The OAuth token endpoint (e.g. `https://issuer/oauth/token`). */
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  /** Space-delimited scopes to request. */
  scope?: string;
  /** RFC 8707 audience / resource indicator, if your IdP needs it (e.g. Auth0). */
  audience?: string;
  /** Refresh this many seconds before the token actually expires. Default 60. */
  refreshSkewSeconds?: number;
  /** Timeout (ms) for the token request. Default 10000. Pass 0 to disable. */
  timeoutMs?: number;
  /** Retries for transient token-endpoint failures (network, 429, 5xx). Default 0. */
  retries?: number;
  /** Base backoff (ms), doubled each retry. Default 200. */
  retryBaseDelayMs?: number;
  /** Injectable for tests. */
  fetch?: typeof globalThis.fetch;
  /** Injectable clock (ms). */
  now?: () => number;
}

/**
 * OAuth 2.0 client-credentials auth (machine-to-machine). Fetches an access token,
 * caches it, and transparently refreshes before expiry. Concurrent callers during a
 * refresh share one in-flight request.
 */
export function clientCredentialsAuth(opts: ClientCredentialsOptions): UpstreamAuth {
  if (!opts.tokenUrl || !opts.clientId || !opts.clientSecret) {
    throw new Error('clientCredentialsAuth: tokenUrl, clientId and clientSecret are required');
  }
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const now = opts.now ?? (() => Date.now());
  const skewMs = (opts.refreshSkewSeconds ?? 60) * 1000;

  let cached: { token: string; expiresAtMs: number } | null = null;
  let inflight: Promise<string> | null = null;

  async function fetchToken(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
    });
    if (opts.scope) body.set('scope', opts.scope);
    if (opts.audience) body.set('audience', opts.audience);

    const res = await fetchWithRetry(
      fetchImpl,
      opts.tokenUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body,
      },
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      { retries: opts.retries, retryBaseDelayMs: opts.retryBaseDelayMs },
    );
    const text = await res.text();
    let json: Record<string, unknown>;
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      json = {};
    }
    if (!res.ok) {
      throw new TokenRequestError(
        `clientCredentialsAuth: token request failed (${res.status}): ${String(json.error ?? text)}`,
        { status: res.status, responseBody: text },
      );
    }
    const token = json.access_token;
    if (typeof token !== 'string' || !token) {
      throw new TokenRequestError('clientCredentialsAuth: response missing access_token', {
        status: res.status,
        responseBody: text,
      });
    }
    const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
    cached = { token, expiresAtMs: now() + expiresIn * 1000 };
    return token;
  }

  async function getToken(): Promise<string> {
    if (cached && now() < cached.expiresAtMs - skewMs) return cached.token;
    if (inflight) return inflight;
    inflight = fetchToken().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    async headers() {
      return { Authorization: `Bearer ${await getToken()}` };
    },
  };
}

/** A source of static-ish headers: an object, or a (possibly async) function returning one. */
export type HeaderSource =
  | Record<string, string>
  | (() => Record<string, string> | Promise<Record<string, string>>);

async function resolveHeaderSource(src: HeaderSource): Promise<Record<string, string>> {
  return typeof src === 'function' ? src() : src;
}

export interface UpstreamFetchOptions {
  /** Base URL prepended to relative request paths. */
  baseUrl?: string;
  /** Auth strategy; its headers are merged into every request. */
  auth?: UpstreamAuth;
  /** Extra headers merged into every request (e.g. a versioning header source). */
  headers?: HeaderSource;
  /**
   * Per-request timeout (ms). Off by default so long-running upstream calls are
   * never cut short unexpectedly; set it to opt in. Pass 0 to disable explicitly.
   */
  timeoutMs?: number;
  /** Injectable for tests. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Wrap `fetch` so every request carries your auth + standing headers. Returns a
 * drop-in `fetch` your tool handlers can call with relative paths.
 */
export function createUpstreamFetch(opts: UpstreamFetchOptions): typeof globalThis.fetch {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const base = opts.baseUrl?.replace(/\/+$/, '');

  type FetchInput = Parameters<typeof globalThis.fetch>[0];
  return (async (input: FetchInput, init: RequestInit = {}) => {
    const authHeaders = opts.auth ? await opts.auth.headers() : {};
    const standing = opts.headers ? await resolveHeaderSource(opts.headers) : {};
    const merged = new Headers(init.headers);
    for (const [k, v] of Object.entries({ ...standing, ...authHeaders })) merged.set(k, v);

    let target: FetchInput = input;
    if (base && typeof input === 'string' && input.startsWith('/')) target = base + input;

    const req = { ...init, headers: merged };
    return opts.timeoutMs != null
      ? fetchWithTimeout(fetchImpl, target, req, opts.timeoutMs)
      : fetchImpl(target, req);
  }) as typeof globalThis.fetch;
}

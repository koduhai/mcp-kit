import { createHash } from 'node:crypto';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { DEFAULT_TIMEOUT_MS, fetchWithTimeout } from '../internal/http.js';

export interface IntrospectionVerifierOptions {
  /** The OAuth 2.0 token introspection endpoint (RFC 7662). */
  introspectionUrl: string;
  /** Client credentials this Resource Server uses to authenticate to the introspection endpoint. */
  clientId: string;
  clientSecret: string;
  /** How to present the client credentials. Default `basic` (HTTP Basic). */
  authMethod?: 'basic' | 'post';
  /**
   * Cache successful introspection results for this many seconds, so a burst of
   * requests bearing the same token does not introspect on every call. The cached
   * entry never outlives the token's own `exp`. Default 60. Set 0 to introspect on
   * every request (instant revocation visibility, at the cost of more AS load).
   */
  cacheTtlSeconds?: number;
  /** Maximum number of cached tokens; oldest entries are evicted first. Default 1000. */
  maxCacheEntries?: number;
  /** Timeout (ms) for the introspection request. Default 10000. Pass 0 to disable. */
  timeoutMs?: number;
  /** Injectable clock (ms). */
  now?: () => number;
  /** Injectable for tests. */
  fetch?: typeof globalThis.fetch;
}

/**
 * An {@link OAuthTokenVerifier} that validates opaque (or any) access tokens by calling the
 * Authorization Server's introspection endpoint (RFC 7662). Use this when your IdP issues
 * opaque tokens, or when you want the AS to be the single source of truth on revocation.
 *
 * Successful results are cached for a short, configurable TTL (and deduplicated while a
 * call is in flight) so high-traffic servers don't introspect the same token on every
 * request. Caching delays revocation visibility by at most the TTL; set `cacheTtlSeconds: 0`
 * if you need every request to hit the AS.
 */
export function introspectionVerifier(opts: IntrospectionVerifierOptions): OAuthTokenVerifier {
  if (!opts.introspectionUrl) throw new Error('introspectionVerifier: `introspectionUrl` is required');
  if (!opts.clientId || !opts.clientSecret) {
    throw new Error('introspectionVerifier: `clientId` and `clientSecret` are required');
  }
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const method = opts.authMethod ?? 'basic';
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const ttlMs = (opts.cacheTtlSeconds ?? 60) * 1000;
  const maxEntries = opts.maxCacheEntries ?? 1000;
  const now = opts.now ?? (() => Date.now());

  const cache = new Map<string, { info: AuthInfo; expiresAtMs: number }>();
  const inflight = new Map<string, Promise<AuthInfo>>();
  // Hash so raw bearer tokens are not retained as cache keys.
  const keyOf = (token: string) => createHash('sha256').update(token).digest('hex');

  async function introspect(token: string): Promise<AuthInfo> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
    const body = new URLSearchParams({ token, token_type_hint: 'access_token' });
    if (method === 'basic') {
      headers.Authorization = `Basic ${Buffer.from(`${opts.clientId}:${opts.clientSecret}`).toString('base64')}`;
    } else {
      body.set('client_id', opts.clientId);
      body.set('client_secret', opts.clientSecret);
    }

    let res: Response;
    try {
      res = await fetchWithTimeout(
        fetchImpl,
        opts.introspectionUrl,
        { method: 'POST', headers, body },
        timeoutMs,
      );
    } catch (e) {
      throw new InvalidTokenError(
        `introspection request failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    if (!res.ok) throw new InvalidTokenError(`introspection endpoint returned HTTP ${res.status}`);

    const data = (await res.json()) as Record<string, unknown>;
    if (data.active !== true) throw new InvalidTokenError('token is inactive or revoked');

    const scopes = typeof data.scope === 'string' ? data.scope.split(' ').filter(Boolean) : [];
    return {
      token,
      clientId: String(data.client_id ?? ''),
      scopes,
      expiresAt: typeof data.exp === 'number' ? data.exp : undefined,
      extra: data,
    };
  }

  function remember(key: string, info: AuthInfo): void {
    // Cap the cached lifetime by both the TTL and the token's own expiry.
    const tokenExpiryMs = info.expiresAt != null ? info.expiresAt * 1000 : Infinity;
    const expiresAtMs = Math.min(now() + ttlMs, tokenExpiryMs);
    if (expiresAtMs <= now()) return;
    if (cache.size >= maxEntries) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { info, expiresAtMs });
  }

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      if (ttlMs <= 0) return introspect(token);
      const key = keyOf(token);

      const hit = cache.get(key);
      if (hit && now() < hit.expiresAtMs) return hit.info;
      if (hit) cache.delete(key);

      const pending = inflight.get(key);
      if (pending) return pending;

      const p = introspect(token)
        .then((info) => {
          remember(key, info);
          return info;
        })
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, p);
      return p;
    },
  };
}

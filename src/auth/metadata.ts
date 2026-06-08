import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';

export interface DiscoverOptions {
  /** Injectable for tests. */
  fetch?: typeof globalThis.fetch;
}

/**
 * Discover an Authorization Server's metadata (RFC 8414) from its issuer URL. Tries the
 * OAuth well-known path first, then OIDC discovery. The result feeds `protectMcpServer`
 * (and supplies `jwks_uri` for {@link jwtVerifier}).
 *
 * @throws when neither well-known document can be fetched.
 */
export async function discoverOAuthMetadata(issuer: string, opts: DiscoverOptions = {}): Promise<OAuthMetadata> {
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const base = issuer.replace(/\/+$/, '');
  const candidates = [
    `${base}/.well-known/oauth-authorization-server`,
    `${base}/.well-known/openid-configuration`,
  ];

  let lastErr: unknown;
  for (const url of candidates) {
    try {
      const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
      if (res.ok) return (await res.json()) as OAuthMetadata;
      lastErr = new Error(`HTTP ${res.status} from ${url}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `discoverOAuthMetadata: could not load AS metadata for issuer "${issuer}" ` +
      `(${lastErr instanceof Error ? lastErr.message : String(lastErr)})`,
  );
}

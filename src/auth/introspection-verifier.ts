import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';

export interface IntrospectionVerifierOptions {
  /** The OAuth 2.0 token introspection endpoint (RFC 7662). */
  introspectionUrl: string;
  /** Client credentials this Resource Server uses to authenticate to the introspection endpoint. */
  clientId: string;
  clientSecret: string;
  /** How to present the client credentials. Default `basic` (HTTP Basic). */
  authMethod?: 'basic' | 'post';
  /** Injectable for tests. */
  fetch?: typeof globalThis.fetch;
}

/**
 * An {@link OAuthTokenVerifier} that validates opaque (or any) access tokens by calling the
 * Authorization Server's introspection endpoint (RFC 7662). Use this when your IdP issues
 * opaque tokens, or when you want the AS to be the single source of truth on revocation.
 */
export function introspectionVerifier(opts: IntrospectionVerifierOptions): OAuthTokenVerifier {
  if (!opts.introspectionUrl) throw new Error('introspectionVerifier: `introspectionUrl` is required');
  if (!opts.clientId || !opts.clientSecret) {
    throw new Error('introspectionVerifier: `clientId` and `clientSecret` are required');
  }
  const fetchImpl = opts.fetch ?? globalThis.fetch;
  const method = opts.authMethod ?? 'basic';

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
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
        res = await fetchImpl(opts.introspectionUrl, { method: 'POST', headers, body });
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
    },
  };
}

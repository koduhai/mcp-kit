import { createRemoteJWKSet, jwtVerify } from 'jose';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { discoverOAuthMetadata } from './metadata.js';

/** The accepted forms for the verification key (a key, a JWKS, or a key-resolving function). */
type JwtKeyInput = Parameters<typeof jwtVerify>[1];

export interface JwtVerifierOptions {
  /** Expected token issuer (`iss`). Also used to auto-discover the JWKS if `jwksUri` is omitted. */
  issuer: string;
  /**
   * Expected audience (`aud`): your MCP server's resource identifier (RFC 8707). A token minted
   * for a different resource is rejected, which is what stops token-passthrough attacks.
   */
  audience: string | string[];
  /** JWKS URI. If omitted it is discovered from the issuer's AS metadata (`jwks_uri`). */
  jwksUri?: string;
  /** Allowed signing algorithms. Default `['RS256', 'ES256']`. Never allow `none`. */
  algorithms?: string[];
  /** Clock skew tolerance in seconds for `exp`/`nbf`. Default 5. */
  clockToleranceSeconds?: number;
  /** Claim to read scopes from. By default tries `scope` (space-delimited) then `scp` (array). */
  scopeClaim?: string;
  /** Provide the key directly (a `KeyLike`/JWKS/resolver) instead of discovering it. Mainly for tests. */
  key?: JwtKeyInput;
  /** Injectable fetch for discovery. */
  fetch?: typeof globalThis.fetch;
}

function extractScopes(payload: Record<string, unknown>, scopeClaim?: string): string[] {
  const toScopes = (v: unknown): string[] => {
    if (typeof v === 'string') return v.split(' ').filter(Boolean);
    if (Array.isArray(v)) return v.map(String);
    return [];
  };
  if (scopeClaim) return toScopes(payload[scopeClaim]);
  if (payload.scope != null) return toScopes(payload.scope);
  if (payload.scp != null) return toScopes(payload.scp);
  return [];
}

/**
 * An {@link OAuthTokenVerifier} that validates JWT access tokens against an IdP's JWKS:
 * signature, `iss`, `aud`, and `exp`/`nbf`. This is the verifier the MCP SDK's
 * `requireBearerAuth` needs but does not ship. Drop it into {@link protectMcpServer}.
 */
export function jwtVerifier(opts: JwtVerifierOptions): OAuthTokenVerifier {
  if (!opts.issuer) throw new Error('jwtVerifier: `issuer` is required');
  if (!opts.audience) throw new Error('jwtVerifier: `audience` is required');

  let keyInput: JwtKeyInput | undefined = opts.key;
  let resolving: Promise<JwtKeyInput> | null = null;

  async function resolveKey(): Promise<JwtKeyInput> {
    if (keyInput) return keyInput;
    if (resolving) return resolving;
    resolving = (async () => {
      let jwksUri = opts.jwksUri;
      if (!jwksUri) {
        const meta = (await discoverOAuthMetadata(opts.issuer, { fetch: opts.fetch })) as { jwks_uri?: string };
        jwksUri = meta.jwks_uri;
        if (!jwksUri) throw new Error('jwtVerifier: issuer metadata has no jwks_uri; pass `jwksUri` or `key`');
      }
      keyInput = createRemoteJWKSet(new URL(jwksUri));
      return keyInput;
    })();
    try {
      return await resolving;
    } finally {
      resolving = null;
    }
  }

  return {
    async verifyAccessToken(token: string): Promise<AuthInfo> {
      try {
        const key = await resolveKey();
        const { payload } = await jwtVerify(token, key, {
          issuer: opts.issuer,
          audience: opts.audience,
          algorithms: opts.algorithms ?? ['RS256', 'ES256'],
          clockTolerance: opts.clockToleranceSeconds ?? 5,
        });
        return {
          token,
          clientId: String(payload.client_id ?? payload.azp ?? payload.sub ?? ''),
          scopes: extractScopes(payload as Record<string, unknown>, opts.scopeClaim),
          expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
          extra: payload as Record<string, unknown>,
        };
      } catch (e) {
        if (e instanceof InvalidTokenError) throw e;
        throw new InvalidTokenError(e instanceof Error ? e.message : 'invalid token');
      }
    },
  };
}

import { describe, it, expect, vi } from 'vitest';
import { generateKeyPair, SignJWT, exportJWK, type CryptoKey } from 'jose';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { jwtVerifier } from './jwt-verifier.js';

const ISS = 'https://auth.example.com';
const AUD = 'https://mcp.example.com';

async function keys() {
  return generateKeyPair('RS256', { extractable: true });
}

async function sign(
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
  { exp = '1h', aud = AUD, iss = ISS }: { exp?: string | number; aud?: string; iss?: string } = {},
): Promise<string> {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt()
    .setIssuer(iss)
    .setAudience(aud);
  jwt.setExpirationTime(exp);
  return jwt.sign(privateKey);
}

describe('jwtVerifier', () => {
  it('accepts a valid token and maps claims to AuthInfo', async () => {
    const { publicKey, privateKey } = await keys();
    const token = await sign(privateKey, {
      sub: 'user-1',
      client_id: 'client-1',
      scope: 'mcp:tools mcp:read',
    });
    const verifier = jwtVerifier({ issuer: ISS, audience: AUD, key: publicKey });

    const info = await verifier.verifyAccessToken(token);
    expect(info.clientId).toBe('client-1');
    expect(info.scopes).toEqual(['mcp:tools', 'mcp:read']);
    expect(typeof info.expiresAt).toBe('number');
  });

  it('reads scopes from the scp array claim', async () => {
    const { publicKey, privateKey } = await keys();
    const token = await sign(privateKey, { sub: 'u', scp: ['a', 'b'] });
    const info = await jwtVerifier({ issuer: ISS, audience: AUD, key: publicKey }).verifyAccessToken(token);
    expect(info.scopes).toEqual(['a', 'b']);
  });

  it('rejects an expired token', async () => {
    const { publicKey, privateKey } = await keys();
    const token = await sign(privateKey, { sub: 'u' }, { exp: Math.floor(Date.now() / 1000) - 3600 });
    await expect(
      jwtVerifier({ issuer: ISS, audience: AUD, key: publicKey }).verifyAccessToken(token),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects a token minted for a different audience', async () => {
    const { publicKey, privateKey } = await keys();
    const token = await sign(privateKey, { sub: 'u' }, { aud: 'https://other.example.com' });
    await expect(
      jwtVerifier({ issuer: ISS, audience: AUD, key: publicKey }).verifyAccessToken(token),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects a token from a different issuer', async () => {
    const { publicKey, privateKey } = await keys();
    const token = await sign(privateKey, { sub: 'u' }, { iss: 'https://evil.example.com' });
    await expect(
      jwtVerifier({ issuer: ISS, audience: AUD, key: publicKey }).verifyAccessToken(token),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects a token signed by the wrong key', async () => {
    const { privateKey } = await keys();
    const { publicKey: otherPub } = await keys();
    const token = await sign(privateKey, { sub: 'u' });
    await expect(
      jwtVerifier({ issuer: ISS, audience: AUD, key: otherPub }).verifyAccessToken(token),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('discovers the JWKS from the issuer and verifies against it (no `key`)', async () => {
    const { publicKey, privateKey } = await keys();
    const jwk = await exportJWK(publicKey);
    jwk.kid = 'key-1';
    const token = await new SignJWT({ sub: 'u', client_id: 'client-1', scope: 'mcp:tools' })
      .setProtectedHeader({ alg: 'RS256', kid: 'key-1' })
      .setIssuedAt()
      .setIssuer(ISS)
      .setAudience(AUD)
      .setExpirationTime('1h')
      .sign(privateKey);

    // One fetch serves both AS metadata discovery and the JWKS document.
    const fetch = vi.fn(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/.well-known/oauth-authorization-server')) {
        return new Response(JSON.stringify({ issuer: ISS, jwks_uri: `${ISS}/jwks` }), { status: 200 });
      }
      if (u === `${ISS}/jwks`) {
        return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof globalThis.fetch;

    const info = await jwtVerifier({ issuer: ISS, audience: AUD, fetch }).verifyAccessToken(token);
    expect(info.clientId).toBe('client-1');
    expect(info.scopes).toEqual(['mcp:tools']);
    // Discovery + JWKS were both fetched through the injected fetch.
    expect(fetch).toHaveBeenCalled();
  });
});

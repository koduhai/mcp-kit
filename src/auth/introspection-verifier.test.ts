import { describe, it, expect, vi } from 'vitest';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { introspectionVerifier } from './introspection-verifier.js';

const URL_ = 'https://auth.example.com/introspect';

function fetchReturning(
  status: number,
  json: unknown,
  capture?: (req: { headers: Headers; body: string }) => void,
) {
  return vi.fn(async (_url: unknown, init: RequestInit) => {
    capture?.({ headers: new Headers(init.headers), body: String(init.body) });
    return new Response(JSON.stringify(json), { status });
  }) as unknown as typeof globalThis.fetch;
}

describe('introspectionVerifier', () => {
  it('accepts an active token and maps the response', async () => {
    const seen: { headers: Headers; body: string }[] = [];
    const fetch = fetchReturning(
      200,
      { active: true, client_id: 'client-1', scope: 'mcp:tools', exp: Math.floor(Date.now() / 1000) + 3600 },
      (r) => seen.push(r),
    );
    const info = await introspectionVerifier({
      introspectionUrl: URL_,
      clientId: 'rs',
      clientSecret: 's',
      fetch,
    }).verifyAccessToken('opaque-token');
    expect(info.clientId).toBe('client-1');
    expect(info.scopes).toEqual(['mcp:tools']);
    expect(typeof info.expiresAt).toBe('number');
    // sends HTTP Basic client auth and the token in the body by default
    expect(seen[0].headers.get('authorization')).toMatch(/^Basic /);
    expect(seen[0].body).toContain('token=opaque-token');
  });

  it('rejects an inactive token', async () => {
    const fetch = fetchReturning(200, { active: false });
    await expect(
      introspectionVerifier({
        introspectionUrl: URL_,
        clientId: 'rs',
        clientSecret: 's',
        fetch,
      }).verifyAccessToken('x'),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects on a non-2xx introspection response', async () => {
    const fetch = fetchReturning(500, {});
    await expect(
      introspectionVerifier({
        introspectionUrl: URL_,
        clientId: 'rs',
        clientSecret: 's',
        fetch,
      }).verifyAccessToken('x'),
    ).rejects.toThrow(/HTTP 500/);
  });

  it('supports post-body client auth', async () => {
    const seen: { headers: Headers; body: string }[] = [];
    const fetch = fetchReturning(200, { active: true, exp: Math.floor(Date.now() / 1000) + 60 }, (r) =>
      seen.push(r),
    );
    await introspectionVerifier({
      introspectionUrl: URL_,
      clientId: 'rs',
      clientSecret: 's',
      authMethod: 'post',
      fetch,
    }).verifyAccessToken('x');
    expect(seen[0].headers.get('authorization')).toBeNull();
    expect(seen[0].body).toContain('client_id=rs');
    expect(seen[0].body).toContain('client_secret=s');
  });
});

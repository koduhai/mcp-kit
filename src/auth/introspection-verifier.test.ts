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

  function countingFetch(json: unknown, delayMs = 0) {
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls++;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return new Response(JSON.stringify(json), { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    return { fetch, calls: () => calls };
  }

  it('caches a successful introspection across calls within the TTL', async () => {
    const srv = countingFetch({ active: true, client_id: 'c', scope: 'a b' });
    let t = 0;
    const v = introspectionVerifier({
      introspectionUrl: URL_,
      clientId: 'rs',
      clientSecret: 's',
      fetch: srv.fetch,
      now: () => t,
    });
    expect((await v.verifyAccessToken('tok')).clientId).toBe('c');
    t = 30_000; // within the default 60s TTL
    expect((await v.verifyAccessToken('tok')).scopes).toEqual(['a', 'b']);
    expect(srv.calls()).toBe(1);
  });

  it('re-introspects once the cache TTL expires', async () => {
    const srv = countingFetch({ active: true });
    let t = 0;
    const v = introspectionVerifier({
      introspectionUrl: URL_,
      clientId: 'rs',
      clientSecret: 's',
      cacheTtlSeconds: 10,
      fetch: srv.fetch,
      now: () => t,
    });
    await v.verifyAccessToken('tok');
    t = 11_000; // past the 10s TTL
    await v.verifyAccessToken('tok');
    expect(srv.calls()).toBe(2);
  });

  it('never caches a result past the token exp, even with a longer TTL', async () => {
    const srv = countingFetch({ active: true, exp: 5 }); // token expires 5s after epoch
    let t = 0;
    const v = introspectionVerifier({
      introspectionUrl: URL_,
      clientId: 'rs',
      clientSecret: 's',
      cacheTtlSeconds: 3600,
      fetch: srv.fetch,
      now: () => t,
    });
    await v.verifyAccessToken('tok');
    t = 6_000; // past the token's own exp
    await v.verifyAccessToken('tok');
    expect(srv.calls()).toBe(2);
  });

  it('introspects on every request when caching is disabled', async () => {
    const srv = countingFetch({ active: true });
    const v = introspectionVerifier({
      introspectionUrl: URL_,
      clientId: 'rs',
      clientSecret: 's',
      cacheTtlSeconds: 0,
      fetch: srv.fetch,
    });
    await v.verifyAccessToken('tok');
    await v.verifyAccessToken('tok');
    expect(srv.calls()).toBe(2);
  });

  it('shares one in-flight introspection across concurrent callers', async () => {
    const srv = countingFetch({ active: true }, 5);
    const v = introspectionVerifier({
      introspectionUrl: URL_,
      clientId: 'rs',
      clientSecret: 's',
      fetch: srv.fetch,
    });
    const [a, b] = await Promise.all([v.verifyAccessToken('tok'), v.verifyAccessToken('tok')]);
    expect(a).toEqual(b);
    expect(srv.calls()).toBe(1);
  });

  it('maps a request timeout to InvalidTokenError', async () => {
    const fetch = vi.fn(
      (_u: unknown, init: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init.signal?.addEventListener('abort', () => rej(init.signal!.reason));
        }),
    ) as unknown as typeof globalThis.fetch;
    const v = introspectionVerifier({
      introspectionUrl: URL_,
      clientId: 'rs',
      clientSecret: 's',
      timeoutMs: 20,
      fetch,
    });
    await expect(v.verifyAccessToken('tok')).rejects.toBeInstanceOf(InvalidTokenError);
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

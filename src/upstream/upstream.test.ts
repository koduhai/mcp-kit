import { describe, it, expect, vi } from 'vitest';
import { apiKeyAuth, bearerAuth, clientCredentialsAuth, createUpstreamFetch } from './index.js';

describe('apiKeyAuth', () => {
  it('defaults to Authorization: Bearer', async () => {
    expect(await apiKeyAuth({ key: 'k_123' }).headers()).toEqual({ Authorization: 'Bearer k_123' });
  });

  it('uses a raw value for a custom header', async () => {
    expect(await apiKeyAuth({ key: 'k_123', header: 'X-Api-Key' }).headers()).toEqual({ 'X-Api-Key': 'k_123' });
  });

  it('honors an explicit scheme', async () => {
    expect(await apiKeyAuth({ key: 't', header: 'X-Token', scheme: 'Token' }).headers()).toEqual({ 'X-Token': 'Token t' });
  });

  it('throws without a key', () => {
    expect(() => apiKeyAuth({ key: '' })).toThrow();
  });
});

describe('bearerAuth', () => {
  it('resolves a function token per call', async () => {
    let n = 0;
    const auth = bearerAuth(() => `tok-${++n}`);
    expect(await auth.headers()).toEqual({ Authorization: 'Bearer tok-1' });
    expect(await auth.headers()).toEqual({ Authorization: 'Bearer tok-2' });
  });

  it('throws when the token resolves empty', async () => {
    await expect(bearerAuth(() => '').headers()).rejects.toThrow();
  });
});

describe('clientCredentialsAuth', () => {
  function tokenServer(responses: Array<{ access_token: string; expires_in: number }>) {
    let calls = 0;
    const fetch = vi.fn(async () => {
      const body = responses[Math.min(calls, responses.length - 1)];
      calls++;
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    return { fetch, calls: () => calls };
  }

  it('fetches, caches, and reuses a token until near expiry', async () => {
    const srv = tokenServer([{ access_token: 'AT1', expires_in: 3600 }]);
    let t = 0;
    const auth = clientCredentialsAuth({
      tokenUrl: 'https://issuer/token',
      clientId: 'id',
      clientSecret: 'secret',
      fetch: srv.fetch,
      now: () => t,
    });
    expect(await auth.headers()).toEqual({ Authorization: 'Bearer AT1' });
    t = 1000; // still well within the hour
    expect(await auth.headers()).toEqual({ Authorization: 'Bearer AT1' });
    expect(srv.calls()).toBe(1);
  });

  it('refreshes once the skew window is reached', async () => {
    const srv = tokenServer([
      { access_token: 'AT1', expires_in: 100 },
      { access_token: 'AT2', expires_in: 100 },
    ]);
    let t = 0;
    const auth = clientCredentialsAuth({
      tokenUrl: 'https://issuer/token',
      clientId: 'id',
      clientSecret: 'secret',
      refreshSkewSeconds: 10,
      fetch: srv.fetch,
      now: () => t,
    });
    expect(await auth.headers()).toEqual({ Authorization: 'Bearer AT1' });
    t = 95_000; // within 10s of the 100s expiry -> refresh
    expect(await auth.headers()).toEqual({ Authorization: 'Bearer AT2' });
    expect(srv.calls()).toBe(2);
  });

  it('shares one in-flight request across concurrent callers', async () => {
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 5));
      return new Response(JSON.stringify({ access_token: 'AT', expires_in: 3600 }), { status: 200 });
    });
    const auth = clientCredentialsAuth({ tokenUrl: 'https://i/token', clientId: 'a', clientSecret: 'b', fetch });
    const [a, b] = await Promise.all([auth.headers(), auth.headers()]);
    expect(a).toEqual(b);
    expect(calls).toBe(1);
  });

  it('throws on a non-2xx token response', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }));
    const auth = clientCredentialsAuth({ tokenUrl: 'https://i/token', clientId: 'a', clientSecret: 'bad', fetch });
    await expect(auth.headers()).rejects.toThrow(/invalid_client/);
  });
});

describe('createUpstreamFetch', () => {
  it('merges auth + standing headers and resolves relative paths against baseUrl', async () => {
    const captured: { url: unknown; headers: Headers } = { url: null, headers: new Headers() };
    const fakeFetch = vi.fn(async (url: unknown, init: RequestInit) => {
      captured.url = url;
      captured.headers = new Headers(init.headers);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    const f = createUpstreamFetch({
      baseUrl: 'https://api.example.com/',
      auth: apiKeyAuth({ key: 'k' }),
      headers: { 'Api-Version': '2026-01-01' },
      fetch: fakeFetch,
    });
    await f('/things');
    expect(captured.url).toBe('https://api.example.com/things');
    expect(captured.headers.get('authorization')).toBe('Bearer k');
    expect(captured.headers.get('api-version')).toBe('2026-01-01');
  });

  it('lets per-request headers coexist with standing ones', async () => {
    let seen: Headers = new Headers();
    const fakeFetch = vi.fn(async (_u: unknown, init: RequestInit) => {
      seen = new Headers(init.headers);
      return new Response('{}', { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const f = createUpstreamFetch({ auth: apiKeyAuth({ key: 'k' }), fetch: fakeFetch });
    await f('https://x/y', { headers: { 'Content-Type': 'application/json' } });
    expect(seen.get('content-type')).toBe('application/json');
    expect(seen.get('authorization')).toBe('Bearer k');
  });
});

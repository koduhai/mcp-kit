import { describe, it, expect, vi } from 'vitest';
import { discoverOAuthMetadata } from './metadata.js';

const META = {
  issuer: 'https://auth.example.com',
  authorization_endpoint: 'https://auth.example.com/authorize',
  token_endpoint: 'https://auth.example.com/token',
  response_types_supported: ['code'],
};

describe('discoverOAuthMetadata', () => {
  it('returns the oauth-authorization-server document when present', async () => {
    const fetch = vi.fn(async (url: unknown) => {
      if (String(url).endsWith('/.well-known/oauth-authorization-server')) {
        return new Response(JSON.stringify(META), { status: 200 });
      }
      return new Response('nope', { status: 404 });
    }) as unknown as typeof globalThis.fetch;
    const meta = await discoverOAuthMetadata('https://auth.example.com', { fetch });
    expect(meta.issuer).toBe('https://auth.example.com');
  });

  it('falls back to openid-configuration', async () => {
    const fetch = vi.fn(async (url: unknown) => {
      if (String(url).endsWith('/.well-known/openid-configuration')) {
        return new Response(JSON.stringify(META), { status: 200 });
      }
      return new Response('nope', { status: 404 });
    }) as unknown as typeof globalThis.fetch;
    const meta = await discoverOAuthMetadata('https://auth.example.com/', { fetch });
    expect(meta.token_endpoint).toBe('https://auth.example.com/token');
  });

  it('throws when neither document is available', async () => {
    const fetch = vi.fn(async () => new Response('nope', { status: 404 })) as unknown as typeof globalThis.fetch;
    await expect(discoverOAuthMetadata('https://auth.example.com', { fetch })).rejects.toThrow(/could not load AS metadata/);
  });
});

import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import { protectMcpServer } from './protect.js';

const OAUTH_METADATA = {
  issuer: 'https://auth.example.com',
  authorization_endpoint: 'https://auth.example.com/authorize',
  token_endpoint: 'https://auth.example.com/token',
  response_types_supported: ['code'],
};

// Stub verifier: "good" is valid with the mcp:tools scope, anything else is rejected.
const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string) {
    if (token === 'good') {
      return { token, clientId: 'client-1', scopes: ['mcp:tools'], expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    }
    throw new InvalidTokenError('bad token');
  },
};

async function buildApp() {
  const app = express();
  const { requireAuth, resourceMetadataUrl } = await protectMcpServer({
    app,
    resourceServerUrl: 'https://mcp.example.com',
    oauthMetadata: OAUTH_METADATA,
    verifier,
    scopesSupported: ['mcp:tools'],
    requiredScopes: ['mcp:tools'],
  });
  app.post('/mcp', requireAuth, (req, res) => {
    res.json({ ok: true, clientId: req.auth?.clientId });
  });
  return { app, resourceMetadataUrl };
}

describe('protectMcpServer', () => {
  it('serves RFC 9728 Protected Resource Metadata', async () => {
    const { app } = await buildApp();
    const res = await request(app).get('/.well-known/oauth-protected-resource');
    expect(res.status).toBe(200);
    expect(res.body.resource).toBe('https://mcp.example.com/');
    expect(res.body.authorization_servers).toContain('https://auth.example.com');
    expect(res.body.scopes_supported).toContain('mcp:tools');
  });

  it('401s an unauthenticated request with a discovery-pointing WWW-Authenticate header', async () => {
    const { app, resourceMetadataUrl } = await buildApp();
    const res = await request(app).post('/mcp').send({});
    expect(res.status).toBe(401);
    const wwwAuth = res.headers['www-authenticate'] ?? '';
    expect(wwwAuth).toContain('Bearer');
    expect(wwwAuth).toContain('resource_metadata');
    expect(wwwAuth).toContain(resourceMetadataUrl);
  });

  it('rejects an invalid token with 401', async () => {
    const { app } = await buildApp();
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer nope').send({});
    expect(res.status).toBe(401);
  });

  it('allows a valid, in-scope token through to the handler', async () => {
    const { app } = await buildApp();
    const res = await request(app).post('/mcp').set('Authorization', 'Bearer good').send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, clientId: 'client-1' });
  });
});

/**
 * Example: a remote (Streamable HTTP) MCP server that is a spec-compliant OAuth 2.1
 * Resource Server. Tokens are issued by your existing IdP (Auth0, Logto, Clerk, Keycloak,
 * Cognito, ...); mcp-kit verifies them and serves the discovery metadata. Typechecked in CI.
 */
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { jwtVerifier, protectMcpServer } from '@koduhai/mcp-kit/auth';

const app = express();
app.use(express.json());

const issuer = process.env.OAUTH_ISSUER ?? 'https://your-tenant.example.com';
const resourceServerUrl = process.env.MCP_PUBLIC_URL ?? 'https://mcp.example.com';

// One call: serves /.well-known/oauth-protected-resource and returns the guard middleware.
// AS metadata + JWKS are auto-discovered from the issuer.
const { requireAuth } = await protectMcpServer({
  app,
  resourceServerUrl,
  issuer,
  verifier: jwtVerifier({ issuer, audience: resourceServerUrl }),
  scopesSupported: ['mcp:tools'],
  requiredScopes: ['mcp:tools'],
});

app.post('/mcp', requireAuth, async (req, res) => {
  // req.auth is populated by the guard: { clientId, scopes, expiresAt, extra }
  const server = new Server(
    { name: 'example-remote-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } },
  );
  // ... register your tools on `server` here ...

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => void transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(3000, () => console.log(`MCP resource server on :3000 (resource ${resourceServerUrl})`));

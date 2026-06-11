# @koduhai/mcp-kit

The two things people get wrong building [MCP](https://modelcontextprotocol.io) servers, solved: **auth** and **versioning**.

It does three things, on three import paths so the lightweight parts pull no heavy deps:

- **Upstream auth** (`/upstream`) — how your server authenticates to the API it wraps: API key, bearer, or OAuth client-credentials with automatic token caching/refresh.
- **Versioning** (`/versioning`) — pin the upstream API version, send it on every call, expose a `get_version` tool, and detect drift.
- **Server OAuth** (`/auth`) — turn a remote (Streamable HTTP) MCP server into a spec-compliant **OAuth 2.1 Resource Server** in one call. Ships the JWKS + introspection token verifiers the MCP SDK needs but does not include.

Built on top of `@modelcontextprotocol/sdk`. Aligned to the **2025-06-18** authorization spec (MCP servers are Resource Servers; they verify tokens and serve RFC 9728 metadata, they do not act as an Authorization Server).

```bash
npm install @koduhai/mcp-kit
```

---

## 1. Upstream auth — `@koduhai/mcp-kit/upstream`

Most MCP servers wrap an API and need to authenticate to it. Stop hand-rolling this.

```ts
import {
  apiKeyAuth,
  bearerAuth,
  clientCredentialsAuth,
  createUpstreamFetch,
} from '@koduhai/mcp-kit/upstream';

// Static API key (defaults to `Authorization: Bearer <key>`; pass a header for raw keys)
const auth = apiKeyAuth({ key: process.env.API_KEY! });
const auth2 = apiKeyAuth({ key: process.env.API_KEY!, header: 'X-Api-Key' });

// OAuth 2.0 machine-to-machine — fetches, caches, and refreshes the token for you
const m2m = clientCredentialsAuth({
  tokenUrl: 'https://issuer/oauth/token',
  clientId: process.env.CLIENT_ID!,
  clientSecret: process.env.CLIENT_SECRET!,
  audience: 'https://api.example.com', // if your IdP needs it (e.g. Auth0)
});

// A fetch that carries your auth (+ any standing headers) on every request
const api = createUpstreamFetch({ baseUrl: 'https://api.example.com', auth });
const res = await api('/things/123'); // -> GET https://api.example.com/things/123, authorized
```

`clientCredentialsAuth` caches the access token and refreshes it shortly before expiry; concurrent callers during a refresh share a single in-flight request.

## 2. Versioning — `@koduhai/mcp-kit/versioning`

APIs evolve; agents get confused when response shapes shift under them. Pin a version, send it everywhere, and surface it.

```ts
import { apiVersioning, versionTool } from '@koduhai/mcp-kit/versioning';

const versioning = apiVersioning({
  header: 'Api-Version',
  version: '2026-01-01',
  current: '2026-03-01', // optional: flags drift
  supported: ['2026-01-01', '2026-03-01'], // optional: refuses an unknown pin at startup
});

// Feed it into createUpstreamFetch so every request carries the header:
const api = createUpstreamFetch({ baseUrl, auth, headers: () => versioning.headers() });

// Register this descriptor as a tool so the agent can ask which version it's talking to:
const tool = versionTool(versioning); // { name: 'get_version', inputSchema, handler }
```

## 3. Server-side OAuth — `@koduhai/mcp-kit/auth`

This is the part everyone gets stuck on. Per the current spec, a remote MCP server is an **OAuth 2.1 Resource Server**: it must verify access tokens and serve Protected Resource Metadata (RFC 9728) so clients can discover where to log in. The MCP SDK gives you `requireBearerAuth` and the metadata router, **but not a token verifier** — you have to write JWT/JWKS or introspection validation yourself. mcp-kit ships both, plus a one-call assembly.

```ts
import express from 'express';
import { jwtVerifier, protectMcpServer } from '@koduhai/mcp-kit/auth';

const app = express();
const issuer = 'https://your-tenant.auth0.com';
const resourceServerUrl = 'https://mcp.example.com';

const { requireAuth } = await protectMcpServer({
  app,
  resourceServerUrl,
  issuer, // AS metadata + JWKS auto-discovered
  verifier: jwtVerifier({ issuer, audience: resourceServerUrl }),
  scopesSupported: ['mcp:tools'],
  requiredScopes: ['mcp:tools'],
});

app.post('/mcp', requireAuth, mcpHttpHandler); // req.auth is now populated
```

That gives you, for free:

- `GET /.well-known/oauth-protected-resource` → RFC 9728 metadata pointing at your IdP.
- `401` on missing/invalid tokens with a `WWW-Authenticate: Bearer ... resource_metadata="..."` header, so compliant MCP clients can discover the auth server and start the flow.
- JWT validation of signature (via the issuer's JWKS), `iss`, `aud` (this is what stops token-passthrough/confused-deputy attacks), `exp`/`nbf`, and scope enforcement.

Opaque tokens instead of JWTs? Swap the verifier:

```ts
import { introspectionVerifier } from '@koduhai/mcp-kit/auth';

const verifier = introspectionVerifier({
  introspectionUrl: 'https://your-tenant.auth0.com/oauth/introspect',
  clientId: process.env.RS_CLIENT_ID!,
  clientSecret: process.env.RS_CLIENT_SECRET!,
  cacheTtlSeconds: 60, // cache active results (default 60); set 0 to introspect every request
});
```

Introspection results are cached for a short TTL (capped by the token's own `exp`) and deduplicated while a call is in flight, so a busy server doesn't introspect the same token on every request. Caching delays revocation visibility by at most the TTL; set `cacheTtlSeconds: 0` if every request must hit the AS.

Works with any standards-compliant IdP: Auth0, Logto, Clerk, Keycloak, Okta, Cognito, WorkOS, and friends. mcp-kit verifies tokens; it does not try to be your Authorization Server (the spec says don't, and you shouldn't).

See [`examples/`](./examples) for a full stdio server and a full remote OAuth server.

---

## Design

- **Layered, optional peers.** `/upstream` and `/versioning` have zero dependencies. `/auth` declares `@modelcontextprotocol/sdk`, `express`, and `jose` as _optional_ peers, so you only install them if you build a remote server.
- **Injectable everything.** Every network call and clock is injectable, so the whole thing is tested offline (46 tests, including a real Express + token-verification integration).
- **Resilient outbound calls.** Every control-plane request the library makes (token, introspection, JWKS, discovery) carries a timeout (default 10s, configurable via `timeoutMs`) so an unresponsive IdP can't hang your server.
- **ESM, Node ≥ 20, TypeScript-first.**

## Compatibility

Targets `@modelcontextprotocol/sdk` ≥ 1.20 and the 2025-06-18 MCP authorization spec. The SDK's auth helpers are Express-based, so `/auth` integrates with Express; `/upstream` and `/versioning` are transport-agnostic.

## License

MIT © [Koduhai](https://github.com/koduhai). Built alongside [KoduhMail](https://koduhmail.com), generalizing the auth + versioning patterns from its MCP server.

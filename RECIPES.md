# IdP recipes

`mcp-kit` verifies tokens from any standards-compliant OAuth 2.1 / OIDC provider — it
discovers each issuer's metadata and JWKS automatically. The only things that change
per provider are the **issuer URL** and the **audience** (your MCP server's resource
identifier, RFC 8707). Below are concrete configs for common IdPs.

All examples assume:

```ts
import { jwtVerifier, protectMcpServer } from '@koduhai/mcp-kit/auth';

const resourceServerUrl = 'https://mcp.example.com'; // your MCP server's public URL
```

## Auth0

Issuer **must** include the trailing slash. Pass `audience` both when your client requests
the token and to the verifier, or Auth0 issues an opaque token instead of a JWT.

```ts
const verifier = jwtVerifier({
  issuer: 'https://your-tenant.us.auth0.com/',
  audience: resourceServerUrl, // == the Auth0 API "Identifier"
});
```

## Keycloak

The issuer is the realm URL; JWKS and metadata are discovered from it. Add an **audience
mapper** to the client so `aud` contains your resource identifier.

```ts
const verifier = jwtVerifier({
  issuer: 'https://keycloak.example.com/realms/my-realm',
  audience: resourceServerUrl,
});
```

## Okta

Use a custom authorization server (the `/oauth2/<id>` path). The default one is
`/oauth2/default`.

```ts
const verifier = jwtVerifier({
  issuer: 'https://your-org.okta.com/oauth2/default',
  audience: 'api://default', // the authorization server's Audience setting
});
```

## Clerk

Clerk signs JWTs; set the audience via a JWT template so `aud` matches your resource.

```ts
const verifier = jwtVerifier({
  issuer: 'https://your-app.clerk.accounts.dev',
  audience: resourceServerUrl,
});
```

## WorkOS / Amazon Cognito / Logto

Same shape — issuer is the provider's OIDC issuer URL, `audience` is your resource
identifier:

```ts
const verifier = jwtVerifier({ issuer: '<issuer-url>', audience: resourceServerUrl });
```

## Opaque tokens (any IdP)

If your IdP issues opaque (non-JWT) access tokens, or you want the AS to be the single
source of truth on revocation, use introspection instead (RFC 7662):

```ts
import { introspectionVerifier } from '@koduhai/mcp-kit/auth';

const verifier = introspectionVerifier({
  introspectionUrl: 'https://your-tenant.example.com/oauth/introspect',
  clientId: process.env.RS_CLIENT_ID!,
  clientSecret: process.env.RS_CLIENT_SECRET!,
  cacheTtlSeconds: 60, // cache active results; set 0 for instant revocation visibility
});
```

## Wiring it up

Whichever verifier you choose, hand it to `protectMcpServer`:

```ts
const { requireAuth } = await protectMcpServer({
  app,
  resourceServerUrl,
  issuer: '<issuer-url>',
  verifier,
  scopesSupported: ['mcp:tools'],
  requiredScopes: ['mcp:tools'],
});
app.post('/mcp', requireAuth, mcpHttpHandler);
```

## JWT vs introspection

- **JWT (`jwtVerifier`)** — validates locally against the issuer's JWKS. No per-request
  network call. Revocation is only visible when the token expires. Best default.
- **Introspection (`introspectionVerifier`)** — calls the AS on each token (cached for a
  short TTL). Use for opaque tokens or when you need near-immediate revocation.

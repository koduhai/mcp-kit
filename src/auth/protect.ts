import type { Express, RequestHandler } from 'express';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import {
  mcpAuthMetadataRouter,
  getOAuthProtectedResourceMetadataUrl,
} from '@modelcontextprotocol/sdk/server/auth/router.js';
import type { OAuthTokenVerifier } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthMetadata } from '@modelcontextprotocol/sdk/shared/auth.js';
import { discoverOAuthMetadata } from './metadata.js';

export interface ProtectMcpServerOptions {
  /** Your Express app. The RFC 9728 metadata endpoints are mounted on it. */
  app: Express;
  /** The public URL of this MCP server (its OAuth resource identifier). */
  resourceServerUrl: string | URL;
  /** A token verifier — e.g. {@link jwtVerifier} or {@link introspectionVerifier}. */
  verifier: OAuthTokenVerifier;
  /** The Authorization Server metadata. Provide this OR `issuer` to discover it. */
  oauthMetadata?: OAuthMetadata;
  /** Issuer URL to discover AS metadata from when `oauthMetadata` is not given. */
  issuer?: string;
  /** Scopes advertised in Protected Resource Metadata. */
  scopesSupported?: string[];
  /** Scopes a token must carry to be allowed through (enforced on each request). */
  requiredScopes?: string[];
  /** Human-readable resource name for the metadata document. */
  resourceName?: string;
  /** Docs URL advertised in the metadata document. */
  serviceDocumentationUrl?: string | URL;
  /** Injectable fetch for issuer discovery. */
  fetch?: typeof globalThis.fetch;
}

export interface ProtectMcpServerResult {
  /** Express middleware that guards your MCP endpoint(s): validates the bearer token and sets `req.auth`. */
  requireAuth: RequestHandler;
  /** The RFC 9728 protected-resource-metadata URL clients discover via the 401 `WWW-Authenticate` header. */
  resourceMetadataUrl: string;
  /** The resolved Authorization Server metadata. */
  metadata: OAuthMetadata;
}

/**
 * Turn an Express app into a spec-compliant MCP OAuth 2.1 **Resource Server** in one call:
 * serve Protected Resource Metadata (RFC 9728), and return a `requireAuth` middleware that
 * validates bearer tokens with your verifier and emits a discovery-pointing `WWW-Authenticate`
 * header on 401. You wire `requireAuth` onto your Streamable-HTTP MCP route.
 *
 * @example
 * const { requireAuth } = await protectMcpServer({
 *   app, resourceServerUrl: 'https://mcp.example.com',
 *   issuer: 'https://auth.example.com',
 *   verifier: jwtVerifier({ issuer: 'https://auth.example.com', audience: 'https://mcp.example.com' }),
 *   scopesSupported: ['mcp:tools'],
 * });
 * app.post('/mcp', requireAuth, mcpHttpHandler);
 */
export async function protectMcpServer(opts: ProtectMcpServerOptions): Promise<ProtectMcpServerResult> {
  const resourceServerUrl = new URL(opts.resourceServerUrl.toString());
  const metadata =
    opts.oauthMetadata ??
    (opts.issuer ? await discoverOAuthMetadata(opts.issuer, { fetch: opts.fetch }) : undefined);
  if (!metadata) throw new Error('protectMcpServer: provide either `oauthMetadata` or `issuer`');

  opts.app.use(
    mcpAuthMetadataRouter({
      oauthMetadata: metadata,
      resourceServerUrl,
      scopesSupported: opts.scopesSupported,
      resourceName: opts.resourceName,
      serviceDocumentationUrl: opts.serviceDocumentationUrl
        ? new URL(opts.serviceDocumentationUrl.toString())
        : undefined,
    }),
  );

  const resourceMetadataUrl = getOAuthProtectedResourceMetadataUrl(resourceServerUrl);
  const requireAuth = requireBearerAuth({
    verifier: opts.verifier,
    requiredScopes: opts.requiredScopes,
    resourceMetadataUrl,
  });

  return { requireAuth, resourceMetadataUrl, metadata };
}

/**
 * @koduhai/mcp-kit/auth — make a remote (Streamable HTTP) MCP server a spec-compliant
 * OAuth 2.1 Resource Server. Supplies the token verifiers the MCP SDK needs but does not
 * ship (JWKS + introspection) and a one-call `protectMcpServer` assembly.
 *
 * Peers: `@modelcontextprotocol/sdk`, `express`, `jose`.
 */
export { discoverOAuthMetadata } from './metadata.js';
export type { DiscoverOptions } from './metadata.js';
export { jwtVerifier } from './jwt-verifier.js';
export type { JwtVerifierOptions } from './jwt-verifier.js';
export { introspectionVerifier } from './introspection-verifier.js';
export type { IntrospectionVerifierOptions } from './introspection-verifier.js';
export { protectMcpServer } from './protect.js';
export type { ProtectMcpServerOptions, ProtectMcpServerResult } from './protect.js';

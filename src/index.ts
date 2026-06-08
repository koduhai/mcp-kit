/**
 * @koduhai/mcp-kit — the two things people get wrong building MCP servers: auth and
 * versioning, solved.
 *
 * This root entry re-exports the dependency-free modules (`upstream`, `versioning`).
 * The server-side OAuth resource-server helpers live at `@koduhai/mcp-kit/auth` so that
 * their optional peers (`@modelcontextprotocol/sdk`, `express`, `jose`) are only loaded
 * when you actually build a remote/HTTP server.
 */
export * from './upstream/index.js';
export * from './versioning/index.js';

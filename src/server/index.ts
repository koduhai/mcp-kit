/**
 * Server glue for mounting transport-agnostic {@link ToolDescriptor}s onto an MCP
 * `Server` in one call. This is the only entry point that needs the MCP SDK at
 * runtime, so it lives apart from the zero-dependency `/versioning` module.
 */
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import type { ToolDescriptor } from '../versioning/index.js';

/**
 * Register a list of {@link ToolDescriptor}s on a low-level MCP `Server`: wires the
 * `tools/list` and `tools/call` handlers, JSON-encodes each handler's return value as
 * MCP text content, and answers unknown tool names with a `MethodNotFound` error. This
 * replaces the boilerplate you'd otherwise hand-write per server.
 *
 * The server must advertise the tools capability when constructed, e.g.
 * `new Server(info, { capabilities: { tools: {} } })`.
 *
 * @example
 * const server = new Server({ name: 'x', version: '1.0.0' }, { capabilities: { tools: {} } });
 * serveTools(server, [versionTool(versioning), myTool]);
 * await server.connect(transport);
 */
export function serveTools(server: Server, tools: ToolDescriptor[]): void {
  const byName = new Map(tools.map((t) => [t.name, t]));

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as { type: 'object' },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const tool = byName.get(req.params.name);
    if (!tool) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${req.params.name}`);
    const result = await tool.handler((req.params.arguments ?? {}) as Record<string, unknown>);
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return { content: [{ type: 'text', text }] };
  });
}

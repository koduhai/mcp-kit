/**
 * Example: an MCP stdio server that wraps a REST API, using mcp-kit for upstream auth
 * and API versioning. Run with an API_KEY env var. Reference snippet (not compiled by the
 * package build).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { apiKeyAuth, createUpstreamFetch } from '@koduhai/mcp-kit/upstream';
import { apiVersioning, versionTool, type ToolDescriptor } from '@koduhai/mcp-kit/versioning';

// Pin the upstream API version; `current` lets get_version report drift.
const versioning = apiVersioning({ header: 'Api-Version', version: '2026-01-01', current: '2026-03-01' });

// One fetch that always carries the API key + the version header.
const api = createUpstreamFetch({
  baseUrl: process.env.API_BASE_URL ?? 'https://api.example.com',
  auth: apiKeyAuth({ key: process.env.API_KEY ?? '' }),
  headers: () => versioning.headers(),
});

const tools: ToolDescriptor[] = [
  versionTool(versioning), // free `get_version` tool
  {
    name: 'get_widget',
    description: 'Fetch a widget by id.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false },
    handler: async (args) => {
      const res = await api(`/widgets/${args.id}`);
      if (!res.ok) throw new Error(`API responded ${res.status}`);
      return res.json();
    },
  },
];

const server = new Server({ name: 'example-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = tools.find((t) => t.name === req.params.name);
  if (!tool) throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${req.params.name}`);
  const result = await tool.handler((req.params.arguments ?? {}) as Record<string, unknown>);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
});

await server.connect(new StdioServerTransport());

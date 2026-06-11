/**
 * Example: an MCP stdio server that wraps a REST API, using mcp-kit for upstream auth
 * and API versioning. Run with an API_KEY env var. Typechecked in CI against the built
 * package (see examples/tsconfig.json).
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { apiKeyAuth, createUpstreamFetch } from '@koduhai/mcp-kit/upstream';
import { apiVersioning, versionTool, type ToolDescriptor } from '@koduhai/mcp-kit/versioning';
import { serveTools } from '@koduhai/mcp-kit/server';

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
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (args) => {
      const res = await api(`/widgets/${args.id}`);
      if (!res.ok) throw new Error(`API responded ${res.status}`);
      return res.json();
    },
  },
];

const server = new Server({ name: 'example-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });

// serveTools wires tools/list + tools/call for the descriptors above.
serveTools(server, tools);

await server.connect(new StdioServerTransport());

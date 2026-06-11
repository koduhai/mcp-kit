import { describe, it, expect } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { serveTools } from './index.js';
import type { ToolDescriptor } from '../versioning/index.js';

async function connect(tools: ToolDescriptor[]) {
  const server = new Server({ name: 'test', version: '1.0.0' }, { capabilities: { tools: {} } });
  serveTools(server, tools);
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

const echo: ToolDescriptor = {
  name: 'echo',
  description: 'echoes its args back',
  inputSchema: {
    type: 'object',
    properties: { msg: { type: 'string' } },
    additionalProperties: false,
  },
  handler: (args) => ({ echoed: args.msg }),
};

describe('serveTools', () => {
  it('lists the registered tools', async () => {
    const client = await connect([echo]);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(['echo']);
    expect(tools[0].description).toBe('echoes its args back');
  });

  it('calls a tool and JSON-encodes the result as text content', async () => {
    const client = await connect([echo]);
    const res = await client.callTool({ name: 'echo', arguments: { msg: 'hi' } });
    const content = res.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe('text');
    expect(JSON.parse(content[0].text)).toEqual({ echoed: 'hi' });
  });

  it('passes a string result through verbatim', async () => {
    const client = await connect([
      { name: 'ping', description: 'p', inputSchema: { type: 'object' }, handler: () => 'pong' },
    ]);
    const res = await client.callTool({ name: 'ping', arguments: {} });
    const content = res.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toBe('pong');
  });

  it('rejects an unknown tool name', async () => {
    const client = await connect([echo]);
    await expect(client.callTool({ name: 'nope', arguments: {} })).rejects.toThrow(/Unknown tool: nope/);
  });
});

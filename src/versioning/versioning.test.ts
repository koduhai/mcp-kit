import { describe, it, expect } from 'vitest';
import { apiVersioning, versionTool } from './index.js';

describe('apiVersioning', () => {
  it('sends the pinned version in the configured header', () => {
    const v = apiVersioning({ header: 'Api-Version', version: '2026-01-01' });
    expect(v.headers()).toEqual({ 'Api-Version': '2026-01-01' });
  });

  it('reports no drift when pinned == current', () => {
    const v = apiVersioning({ header: 'H', version: '2', current: '2' });
    expect(v.drift()).toEqual({ behind: false, unsupported: false, message: null });
  });

  it('flags being behind the current version', () => {
    const v = apiVersioning({ header: 'H', version: '1', current: '3' });
    const d = v.drift();
    expect(d.behind).toBe(true);
    expect(d.message).toMatch(/behind the current API version 3/);
  });

  it('throws when the pinned version is not in the supported set', () => {
    expect(() => apiVersioning({ header: 'H', version: 'x', supported: ['a', 'b'] })).toThrow(
      /not in supported/,
    );
  });

  it('requires header and version', () => {
    expect(() => apiVersioning({ header: '', version: '1' })).toThrow();
    expect(() => apiVersioning({ header: 'H', version: '' })).toThrow();
  });
});

describe('versionTool', () => {
  it('produces a get_version tool reporting version + drift', async () => {
    const v = apiVersioning({ header: 'Api-Version', version: '1', current: '2', supported: ['1', '2'] });
    const tool = versionTool(v);
    expect(tool.name).toBe('get_version');
    expect(tool.inputSchema).toMatchObject({ type: 'object' });
    const out = (await tool.handler({})) as Record<string, unknown>;
    expect(out).toMatchObject({ version: '1', header: 'Api-Version', current: '2' });
    expect(out.drift).toMatch(/behind/);
  });

  it('allows a custom tool name', () => {
    const v = apiVersioning({ header: 'H', version: '1' });
    expect(versionTool(v, 'api_version').name).toBe('api_version');
  });
});

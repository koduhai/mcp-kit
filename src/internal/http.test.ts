import { describe, it, expect, vi } from 'vitest';
import { fetchWithTimeout } from './http.js';

/** A fetch that never resolves on its own; it only settles when its signal aborts. */
function hangingFetch() {
  return vi.fn((_url: unknown, init: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    });
  }) as unknown as typeof globalThis.fetch;
}

describe('fetchWithTimeout', () => {
  it('passes through a fast response unchanged', async () => {
    const fetch = vi.fn(async () => new Response('ok', { status: 200 }));
    const res = await fetchWithTimeout(fetch as unknown as typeof globalThis.fetch, 'https://x', {}, 1000);
    expect(res.status).toBe(200);
  });

  it('rejects with a timeout error when the request hangs', async () => {
    await expect(fetchWithTimeout(hangingFetch(), 'https://x', {}, 20)).rejects.toThrow(
      /timed out after 20ms/,
    );
  });

  it('honors a caller-supplied signal and reports its abort, not a timeout', async () => {
    const ac = new AbortController();
    const p = fetchWithTimeout(hangingFetch(), 'https://x', { signal: ac.signal }, 10_000);
    ac.abort(new Error('caller aborted'));
    await expect(p).rejects.toThrow(/caller aborted/);
  });

  it('does not time out when given a non-positive duration', async () => {
    // The hanging fetch is invoked with no timeout signal, so resolve it manually.
    const fetch = vi.fn(async (_u: unknown, init: RequestInit) => {
      expect(init.signal).toBeUndefined();
      return new Response('ok', { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const res = await fetchWithTimeout(fetch, 'https://x', {}, 0);
    expect(res.status).toBe(200);
  });
});

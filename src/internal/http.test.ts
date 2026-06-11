import { describe, it, expect, vi } from 'vitest';
import { fetchWithTimeout, fetchWithRetry } from './http.js';

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

describe('fetchWithRetry', () => {
  const noSleep = () => Promise.resolve();

  it('makes exactly one attempt with retries: 0', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 503 })) as unknown as typeof globalThis.fetch;
    const res = await fetchWithRetry(fetch, 'https://x', {}, 1000, { retries: 0, sleep: noSleep });
    expect(res.status).toBe(503);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 503 and returns the eventual success', async () => {
    let n = 0;
    const fetch = vi.fn(async () => {
      n++;
      return new Response('', { status: n < 3 ? 503 : 200 });
    }) as unknown as typeof globalThis.fetch;
    const res = await fetchWithRetry(fetch, 'https://x', {}, 1000, { retries: 3, sleep: noSleep });
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('retries a thrown network error', async () => {
    let n = 0;
    const fetch = vi.fn(async () => {
      n++;
      if (n === 1) throw new Error('ECONNRESET');
      return new Response('ok', { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const res = await fetchWithRetry(fetch, 'https://x', {}, 1000, { retries: 2, sleep: noSleep });
    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries and returns the last response', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 500 })) as unknown as typeof globalThis.fetch;
    const res = await fetchWithRetry(fetch, 'https://x', {}, 1000, { retries: 2, sleep: noSleep });
    expect(res.status).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('does not retry a non-retryable status (e.g. 400)', async () => {
    const fetch = vi.fn(async () => new Response('', { status: 400 })) as unknown as typeof globalThis.fetch;
    const res = await fetchWithRetry(fetch, 'https://x', {}, 1000, { retries: 3, sleep: noSleep });
    expect(res.status).toBe(400);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('honors a numeric Retry-After header instead of the backoff', async () => {
    const delays: number[] = [];
    let n = 0;
    const fetch = vi.fn(async () => {
      n++;
      return n < 2
        ? new Response('', { status: 429, headers: { 'retry-after': '5' } })
        : new Response('ok', { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    const res = await fetchWithRetry(fetch, 'https://x', {}, 1000, {
      retries: 2,
      retryBaseDelayMs: 200,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    expect(res.status).toBe(200);
    expect(delays).toEqual([5000]); // 5s from Retry-After, not the 200ms backoff
  });

  it('caps an excessive Retry-After at 30s', async () => {
    const delays: number[] = [];
    let n = 0;
    const fetch = vi.fn(async () => {
      n++;
      return n < 2
        ? new Response('', { status: 503, headers: { 'retry-after': '3600' } })
        : new Response('ok', { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    await fetchWithRetry(fetch, 'https://x', {}, 1000, {
      retries: 1,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    expect(delays).toEqual([30_000]);
  });

  it('falls back to backoff when Retry-After is not a number', async () => {
    const delays: number[] = [];
    let n = 0;
    const fetch = vi.fn(async () => {
      n++;
      return n < 2
        ? new Response('', { status: 429, headers: { 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' } })
        : new Response('ok', { status: 200 });
    }) as unknown as typeof globalThis.fetch;
    await fetchWithRetry(fetch, 'https://x', {}, 1000, {
      retries: 1,
      retryBaseDelayMs: 200,
      sleep: (ms) => {
        delays.push(ms);
        return Promise.resolve();
      },
    });
    expect(delays).toEqual([200]); // HTTP-date form ignored -> backoff
  });
});

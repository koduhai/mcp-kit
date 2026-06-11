/**
 * Shared helpers for the library's own outbound (control-plane) requests:
 * token endpoints, introspection, and AS metadata discovery. Zero dependencies.
 */

/** Default timeout (ms) applied to the library's own outbound requests. */
export const DEFAULT_TIMEOUT_MS = 10_000;

type FetchInput = Parameters<typeof globalThis.fetch>[0];

/**
 * `fetch` with a timeout. Aborts the request after `timeoutMs` and reports a
 * clear error rather than hanging on an unresponsive endpoint. A caller-supplied
 * `init.signal` is honored too: whichever aborts first wins. Pass a non-positive
 * or non-finite `timeoutMs` to disable the timeout entirely.
 */
export async function fetchWithTimeout(
  fetchImpl: typeof globalThis.fetch,
  input: FetchInput,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return fetchImpl(input, init);
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  try {
    return await fetchImpl(input, { ...init, signal });
  } catch (e) {
    // Distinguish our timeout from a caller-initiated abort or a network error.
    if (timeout.aborted) throw new Error(`request timed out after ${timeoutMs}ms`, { cause: e });
    throw e;
  }
}

/** HTTP status codes worth retrying: rate limiting and transient server errors. */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface RetryOptions {
  /** Number of retries after the first attempt. Default 0 (no retries). */
  retries?: number;
  /** Base backoff in ms; doubles each attempt (200, 400, 800, ...). Default 200. */
  retryBaseDelayMs?: number;
  /** Injectable delay, for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * `fetchWithTimeout` plus bounded exponential-backoff retries on transient
 * failures (network errors, 429, and 5xx). A timeout abort counts as a failure
 * and is retried. With `retries: 0` (the default) this is exactly one attempt.
 */
export async function fetchWithRetry(
  fetchImpl: typeof globalThis.fetch,
  input: FetchInput,
  init: RequestInit,
  timeoutMs: number,
  retry: RetryOptions = {},
): Promise<Response> {
  const retries = retry.retries ?? 0;
  const base = retry.retryBaseDelayMs ?? 200;
  const sleep = retry.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));

  let attempt = 0;
  for (;;) {
    try {
      const res = await fetchWithTimeout(fetchImpl, input, init, timeoutMs);
      if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
        await sleep(base * 2 ** attempt);
        attempt++;
        continue;
      }
      return res;
    } catch (e) {
      if (attempt >= retries) throw e;
      await sleep(base * 2 ** attempt);
      attempt++;
    }
  }
}

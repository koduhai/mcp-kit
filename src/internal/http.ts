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

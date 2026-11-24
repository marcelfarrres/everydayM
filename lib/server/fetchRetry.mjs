/*
 * Retries for the Bunny Storage HTTP calls. Shared by lib/server/mediaStore.ts and
 * scripts/migrate-media.mjs, so plain JavaScript with no imports from the app (like ffmpegBin.mjs).
 *
 * Why: from Marcel's computer, roughly 1 connection in 50 to storage.bunnycdn.com dies at connect
 * time (fetch rejects with cause UND_ERR_CONNECT_TIMEOUT), and one failed request used to fail a
 * whole upload or catalog save.
 *
 * Retried: fetch rejecting (a network-level failure: connect timeout, connection reset, socket
 * hang-up, temporary DNS failure…), except an abort the caller asked for; and HTTP 429, 502, 503
 * and 504. Every other answer (2xx, 401, 404, any other 4xx/5xx) is returned at once for the caller
 * to judge, so a wrong key still fails on the first try with its own message. Up to 4 attempts,
 * waiting about 0.5 s, 1 s and 2 s between them (each ×0.5–1.5 at random, so retries never line up).
 *
 * The request is described by a function called once per attempt: a streamed body (a file-backed
 * Blob from openAsBlob) is created again for each attempt, never a consumed stream sent twice.
 */

/** HTTP statuses worth another try: rate limit and the gateway/overload family. */
export const RETRY_STATUSES = new Set([429, 502, 503, 504]);

export const DEFAULT_ATTEMPTS = 4;
export const DEFAULT_BASE_DELAY_MS = 500;

/**
 * @typedef {(url: string, init: RequestInit) => Promise<Response>} FetchLike
 *
 * @typedef {object} RetryInfo
 * @property {number} attempt   the attempt that just failed (1-based)
 * @property {number} delayMs   wait before the next one
 * @property {string} reason    "HTTP 503", "UND_ERR_CONNECT_TIMEOUT"…
 *
 * @typedef {object} RetryOptions
 * @property {number} [attempts]       total attempts, first one included (default 4)
 * @property {number} [baseDelayMs]    wait after the first failure, before jitter (default 500)
 * @property {(ms: number) => Promise<void>} [sleep]  injectable for tests
 * @property {() => number} [random]   0 ≤ n < 1, injectable for tests
 * @property {FetchLike} [fetchImpl]   injectable for tests (default: global fetch)
 * @property {(info: RetryInfo) => void} [onRetry]  called before each wait
 */

/** @param {number} ms */
function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait after failed attempt number `attempt`: base · 2^(attempt-1) · (0.5…1.5).
 * @param {number} attempt
 * @param {number} baseDelayMs
 * @param {() => number} random
 * @returns {number}
 */
export function backoffDelay(attempt, baseDelayMs, random) {
  return Math.round(baseDelayMs * 2 ** (attempt - 1) * (0.5 + random()));
}

/**
 * Is this fetch rejection worth another try? Every network-level failure is; an abort the
 * caller asked for (AbortError, or TimeoutError from AbortSignal.timeout) is not.
 * @param {unknown} err
 * @returns {boolean}
 */
export function isRetryableFetchError(err) {
  const name = typeof err === 'object' && err !== null && 'name' in err ? String(err.name) : '';
  return name !== 'AbortError' && name !== 'TimeoutError';
}

/**
 * Short reason for a network failure: undici puts the system code on `cause`.
 * @param {unknown} err
 * @returns {string}
 */
export function describeFetchError(err) {
  if (typeof err !== 'object' || err === null) return String(err);
  const record = /** @type {{ code?: unknown, message?: unknown, cause?: unknown }} */ (err);
  const cause = typeof record.cause === 'object' && record.cause !== null
    ? /** @type {{ code?: unknown, message?: unknown }} */ (record.cause)
    : null;
  const code = cause?.code ?? record.code;
  if (typeof code === 'string' && code) return code;
  const message = cause?.message ?? record.message;
  return typeof message === 'string' && message ? message : 'error de red';
}

/** @param {string} url */
function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return 'el servidor';
  }
}

/**
 * fetch(url, buildInit()) with retries (see the top of this file). Resolves with the last
 * Response, whatever its status (also a 503 after the last attempt); rejects only when the
 * network failed on every attempt (Spanish message, the original error as `cause`), on a
 * caller abort, or when buildInit itself throws (not retried: a missing file stays missing).
 *
 * @param {string} url
 * @param {() => RequestInit | Promise<RequestInit>} buildInit  called once per attempt
 * @param {RetryOptions} [options]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, buildInit, options = {}) {
  const attempts = Math.max(1, Math.floor(options.attempts ?? DEFAULT_ATTEMPTS));
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  /** @type {FetchLike} */
  const fetchImpl = options.fetchImpl ?? ((u, init) => fetch(u, init));

  for (let attempt = 1; ; attempt += 1) {
    const init = await buildInit();
    /** @type {string} */
    let reason;
    try {
      const res = await fetchImpl(url, init);
      if (!RETRY_STATUSES.has(res.status) || attempt >= attempts) return res;
      reason = `HTTP ${res.status}`;
      // Free the connection: the body of a 503 is not needed.
      await res.body?.cancel().catch(() => {});
    } catch (err) {
      if (!isRetryableFetchError(err)) throw err;
      reason = describeFetchError(err);
      if (attempt >= attempts) {
        throw new Error(
          `No hay conexión con ${hostOf(url)} tras ${attempts} intentos (${reason}). Vuelve a probar en un momento.`,
          { cause: err },
        );
      }
    }
    const delayMs = backoffDelay(attempt, baseDelayMs, random);
    options.onRetry?.({ attempt, delayMs, reason });
    await sleep(delayMs);
  }
}

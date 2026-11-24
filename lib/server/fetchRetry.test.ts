import { describe, expect, it, vi } from 'vitest';
import { backoffDelay, describeFetchError, fetchWithRetry } from './fetchRetry.mjs';

const URL_ = 'https://storage.example.test/zone/videos/a.mp4';

/** What undici throws when the connection never opens. */
function connectTimeout(): TypeError {
  const cause = Object.assign(new Error('Connect Timeout Error'), { code: 'UND_ERR_CONNECT_TIMEOUT' });
  return new TypeError('fetch failed', { cause });
}

function abortError(): Error {
  return Object.assign(new Error('This operation was aborted'), { name: 'AbortError' });
}

/** A fake fetch answering from a script: a Response, a status number, or an error to reject with. */
function scriptedFetch(script: Array<number | Error>) {
  const bodies: string[] = [];
  const impl = vi.fn(async (_url: string, init: RequestInit): Promise<Response> => {
    // Read the body as a server would: a stream sent twice would throw here.
    if (init.body) bodies.push(await new Response(init.body).text());
    const step = script.shift();
    if (step === undefined) throw new Error('fetch called more often than scripted');
    if (step instanceof Error) throw step;
    return new Response(step === 204 ? null : `status ${step}`, { status: step });
  });
  return { impl, bodies };
}

function setup(script: Array<number | Error>) {
  const { impl, bodies } = scriptedFetch(script);
  const sleep = vi.fn(async (ms: number) => {
    void ms;
  });
  const onRetry = vi.fn();
  const options = { fetchImpl: impl, sleep, random: () => 0.5, onRetry };
  return { impl, bodies, sleep, onRetry, options };
}

describe('fetchWithRetry', () => {
  it('returns the first answer when it is fine, without waiting', async () => {
    const { impl, sleep, options } = setup([201]);
    const res = await fetchWithRetry(URL_, () => ({ method: 'PUT', body: 'x' }), options);
    expect(res.status).toBe(201);
    expect(impl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries a rejected fetch (connect timeout) and then succeeds', async () => {
    const { impl, onRetry, options } = setup([connectTimeout(), connectTimeout(), 201]);
    const res = await fetchWithRetry(URL_, () => ({ method: 'PUT', body: 'x' }), options);
    expect(res.status).toBe(201);
    expect(impl).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenNthCalledWith(1, { attempt: 1, delayMs: 500, reason: 'UND_ERR_CONNECT_TIMEOUT' });
  });

  it('retries 429, 502, 503 and 504', async () => {
    const { impl, options } = setup([503, 429, 502, 504, 200]);
    const res = await fetchWithRetry(URL_, () => ({}), { ...options, attempts: 5 });
    expect(res.status).toBe(200);
    expect(impl).toHaveBeenCalledTimes(5);
  });

  it('retries a 503 and returns the success', async () => {
    const { impl, options } = setup([503, 200]);
    const res = await fetchWithRetry(URL_, () => ({}), options);
    expect(res.status).toBe(200);
    expect(impl).toHaveBeenCalledTimes(2);
  });

  it('after 4 attempts of 503, returns the last 503 for the caller to report', async () => {
    const { impl, sleep, options } = setup([503, 503, 503, 503]);
    const res = await fetchWithRetry(URL_, () => ({}), options);
    expect(res.status).toBe(503);
    expect(await res.text()).toBe('status 503');
    expect(impl).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(3);
  });

  it('after 4 network failures, rejects with a Spanish message and the original cause', async () => {
    const last = connectTimeout();
    const { impl, options } = setup([connectTimeout(), connectTimeout(), connectTimeout(), last]);
    const promise = fetchWithRetry(URL_, () => ({}), options);
    await expect(promise).rejects.toThrow(
      'No hay conexión con storage.example.test tras 4 intentos (UND_ERR_CONNECT_TIMEOUT).',
    );
    await promise.catch((err: Error) => expect(err.cause).toBe(last));
    expect(impl).toHaveBeenCalledTimes(4);
  });

  it.each([401, 403, 404, 400, 500])('does not retry HTTP %i', async (status) => {
    const { impl, sleep, options } = setup([status, 201]);
    const res = await fetchWithRetry(URL_, () => ({}), options);
    expect(res.status).toBe(status);
    expect(impl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry an abort the caller asked for', async () => {
    const { impl, options } = setup([abortError(), 201]);
    await expect(fetchWithRetry(URL_, () => ({}), options)).rejects.toMatchObject({ name: 'AbortError' });
    expect(impl).toHaveBeenCalledTimes(1);
  });

  it('does not retry when building the request fails (e.g. the file is gone)', async () => {
    const { impl, options } = setup([201]);
    const buildInit = vi.fn(() => {
      throw new Error('ENOENT');
    });
    await expect(fetchWithRetry(URL_, buildInit, options)).rejects.toThrow('ENOENT');
    expect(buildInit).toHaveBeenCalledTimes(1);
    expect(impl).not.toHaveBeenCalled();
  });

  it('builds the request, and its streamed body, again for every attempt', async () => {
    const { impl, bodies, options } = setup([connectTimeout(), 503, 201]);
    const blob = new Blob(['video bytes']);
    const buildInit = vi.fn(async () => ({ method: 'PUT', body: blob.stream(), duplex: 'half' }) as RequestInit);
    const res = await fetchWithRetry(URL_, buildInit, options);
    expect(res.status).toBe(201);
    expect(buildInit).toHaveBeenCalledTimes(3);
    const sentBodies = impl.mock.calls.map(([, init]) => init.body);
    expect(new Set(sentBodies).size).toBe(3);
    expect(bodies).toEqual(['video bytes', 'video bytes', 'video bytes']);
  });

  it('waits with exponential backoff through the injected sleep', async () => {
    const { sleep, options } = setup([503, 503, 503, 201]);
    await fetchWithRetry(URL_, () => ({}), options);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([500, 1000, 2000]);
  });

  it('honours a custom number of attempts', async () => {
    const { impl, options } = setup([connectTimeout(), connectTimeout()]);
    await expect(fetchWithRetry(URL_, () => ({}), { ...options, attempts: 2 })).rejects.toThrow('tras 2 intentos');
    expect(impl).toHaveBeenCalledTimes(2);
  });
});

describe('backoffDelay', () => {
  it('doubles per attempt with ±50 % jitter', () => {
    expect(backoffDelay(1, 500, () => 0)).toBe(250);
    expect(backoffDelay(1, 500, () => 0.999)).toBe(750);
    expect(backoffDelay(2, 500, () => 0.5)).toBe(1000);
    expect(backoffDelay(3, 500, () => 0)).toBe(1000);
    expect(backoffDelay(3, 500, () => 0.999)).toBe(2998);
  });
});

describe('describeFetchError', () => {
  it('prefers the system code on the cause', () => {
    expect(describeFetchError(connectTimeout())).toBe('UND_ERR_CONNECT_TIMEOUT');
    expect(describeFetchError(Object.assign(new Error('read'), { code: 'ECONNRESET' }))).toBe('ECONNRESET');
    expect(describeFetchError(new TypeError('fetch failed'))).toBe('fetch failed');
  });
});

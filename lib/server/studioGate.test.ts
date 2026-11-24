import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  MAX_PIN_FAILURES,
  PIN_LOCKOUT_BASE_MS,
  STUDIO_SESSION_COOKIE,
  STUDIO_SESSION_MAX_AGE_SECONDS,
  attemptStudioPinLogin,
  createStudioSessionToken,
  getStudioAccess,
  getStudioConfigProblem,
  guardStudioApi,
  isCrossSiteWrite,
  isValidStudioSessionToken,
  resetStudioGateStateForTests,
  verifyStudioPin,
} from './studioGate';
import { DELETE as logout, POST as login } from '@/app/api/admin/session/route';

// 'server-only' throws outside a React Server Components build; vi.mock is hoisted above the imports.
vi.mock('server-only', () => ({}));

const PIN = '246810';
const SECRET = 'a'.repeat(64);

function from(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

function headers(host: string, extra: Record<string, string> = {}) {
  return from({ host, ...extra });
}

function cookies(value?: string) {
  return {
    get: (name: string) => (name === STUDIO_SESSION_COOKIE && value !== undefined ? { value } : undefined),
  };
}

function apiRequest(path: string, init: { method?: string; headers?: Record<string, string>; body?: string; token?: string } = {}) {
  const h: Record<string, string> = { host: 'localhost:3000', ...init.headers };
  if (init.token) h.cookie = `${STUDIO_SESSION_COOKIE}=${init.token}`;
  return new NextRequest(`http://localhost:3000${path}`, { method: init.method ?? 'GET', headers: h, body: init.body });
}

/** POST /api/admin/session, skipping the wrong-PIN delay with fake timers. */
async function postPin(pin: string, extraHeaders: Record<string, string> = {}) {
  const pending = login(apiRequest('/api/admin/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify({ pin }),
  }));
  await vi.advanceTimersByTimeAsync(1_000);
  return pending;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
  vi.stubEnv('STUDIO_ENABLED', 'true');
  vi.stubEnv('STUDIO_LAN_PIN', PIN);
  vi.stubEnv('STUDIO_SESSION_SECRET', SECRET);
  resetStudioGateStateForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('sin atajo para localhost', () => {
  const pretendLocal = [
    ['localhost', headers('localhost:3000')],
    ['127.0.0.1', headers('127.0.0.1:3000')],
    ['[::1]', headers('[::1]:3000')],
    ['X-Forwarded-For de localhost', headers('localhost:3000', { 'x-forwarded-for': '127.0.0.1', 'x-real-ip': '127.0.0.1' })],
    ['Origin de localhost', headers('localhost:3000', { origin: 'http://localhost:3000', 'x-forwarded-host': 'localhost:3000' })],
  ] as const;

  it.each(pretendLocal)('%s sin cookie pide el PIN', (_label, h) => {
    expect(getStudioAccess(h, cookies())).toBe('login-required');
  });

  it('localhost también necesita PIN y secreto: sin ellos el Estudio está cerrado', () => {
    vi.stubEnv('STUDIO_LAN_PIN', '');
    vi.stubEnv('STUDIO_SESSION_SECRET', '');
    expect(getStudioAccess(headers('localhost:3000'), cookies())).toBe('misconfigured');
  });

  it('las API del Estudio responden 401 a localhost sin sesión', async () => {
    const res = guardStudioApi(apiRequest('/api/admin/exercises', { headers: { 'x-forwarded-for': '127.0.0.1' } }));
    expect(res?.status).toBe(401);
  });

  it('con la cookie del PIN entra desde el ordenador y desde la wifi', () => {
    const token = createStudioSessionToken() ?? undefined;
    expect(getStudioAccess(headers('localhost:3000'), cookies(token))).toBe('granted');
    expect(getStudioAccess(headers('192.168.1.20:3000'), cookies(token))).toBe('granted');
    expect(guardStudioApi(apiRequest('/api/admin/exercises', { token }))).toBeNull();
  });

  it('las cabeceras solo sirven para rechazar: un host desconocido no entra ni con cookie', () => {
    const token = createStudioSessionToken() ?? undefined;
    expect(getStudioAccess(headers('evil.example'), cookies(token))).toBe('denied');
    expect(getStudioAccess(headers('localhost:3000', { 'x-forwarded-host': 'evil.example' }), cookies(token))).toBe('denied');
  });

  it('sin STUDIO_ENABLED no hay Estudio, ni con cookie', () => {
    const token = createStudioSessionToken() ?? undefined;
    vi.stubEnv('STUDIO_ENABLED', '');
    expect(getStudioAccess(headers('localhost:3000'), cookies(token))).toBe('denied');
  });
});

describe('falla cerrado sin PIN o sin secreto', () => {
  it.each([
    ['sin PIN', 'STUDIO_LAN_PIN', '', 'STUDIO_LAN_PIN'],
    ['PIN corto', 'STUDIO_LAN_PIN', '12345', 'STUDIO_LAN_PIN'],
    ['sin secreto', 'STUDIO_SESSION_SECRET', '', 'STUDIO_SESSION_SECRET'],
    ['secreto corto', 'STUDIO_SESSION_SECRET', 'x'.repeat(31), 'STUDIO_SESSION_SECRET'],
  ])('%s', async (_label, key, value, named) => {
    const token = createStudioSessionToken() ?? undefined;
    vi.stubEnv(key, value);

    const problem = getStudioConfigProblem();
    expect(problem).toContain(named);
    expect(problem).toContain('.env.local');
    if (value) expect(problem).not.toContain(value);
    expect(problem).not.toContain(key === 'STUDIO_LAN_PIN' ? SECRET : PIN);

    expect(verifyStudioPin(PIN)).toBe(false);
    expect(createStudioSessionToken()).toBeNull();
    expect(isValidStudioSessionToken(token)).toBe(false);
    expect(getStudioAccess(headers('localhost:3000'), cookies(token))).toBe('misconfigured');
    expect(attemptStudioPinLogin(PIN).status).toBe('misconfigured');

    const api = guardStudioApi(apiRequest('/api/studio/clips', { token }));
    expect(api?.status).toBe(503);
    expect(((await api?.json()) as { error: string }).error).toBe(problem);

    const res = await postPin(PIN);
    expect(res.status).toBe(503);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('nombra los dos ajustes si faltan ambos', () => {
    vi.stubEnv('STUDIO_LAN_PIN', '');
    vi.stubEnv('STUDIO_SESSION_SECRET', '');
    const problem = getStudioConfigProblem() ?? '';
    expect(problem).toContain('STUDIO_LAN_PIN');
    expect(problem).toContain('STUDIO_SESSION_SECRET');
  });

  it('no usa SUPABASE_SERVICE_ROLE_KEY como alternativa al secreto', () => {
    vi.stubEnv('STUDIO_SESSION_SECRET', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'b'.repeat(64));
    expect(verifyStudioPin(PIN)).toBe(false);
    expect(getStudioConfigProblem()).toContain('STUDIO_SESSION_SECRET');
  });
});

describe('cookie de sesión', () => {
  it('rechaza cookies manipuladas, caducadas o del formato antiguo', () => {
    const token = createStudioSessionToken() ?? '';
    const [version, expiresAt, nonce, signature] = token.split('.');
    const flip = (s: string) => (s[0] === 'A' ? 'B' : 'A') + s.slice(1);

    expect(isValidStudioSessionToken(token)).toBe(true);
    expect(isValidStudioSessionToken(`${version}.${expiresAt}.${nonce}.${flip(signature)}`)).toBe(false);
    expect(isValidStudioSessionToken(`${version}.${Number(expiresAt) + 86_400}.${nonce}.${signature}`)).toBe(false);
    expect(isValidStudioSessionToken(`${version}.${expiresAt}.${flip(nonce)}.${signature}`)).toBe(false);
    expect(isValidStudioSessionToken(`v1.${expiresAt}.${signature}`)).toBe(false);
    expect(isValidStudioSessionToken(`${version}.${expiresAt}.${nonce}`)).toBe(false);
    expect(isValidStudioSessionToken('garbage')).toBe(false);
    expect(isValidStudioSessionToken('')).toBe(false);
    expect(getStudioAccess(headers('localhost:3000'), cookies(`${token}x`))).toBe('login-required');

    vi.setSystemTime(Date.now() + STUDIO_SESSION_MAX_AGE_SECONDS * 1000 + 1);
    expect(isValidStudioSessionToken(token)).toBe(false);
  });

  it('cambiar el PIN o el secreto invalida las sesiones abiertas', () => {
    const token = createStudioSessionToken() ?? undefined;
    vi.stubEnv('STUDIO_SESSION_SECRET', 'c'.repeat(64));
    expect(isValidStudioSessionToken(token)).toBe(false);
    vi.stubEnv('STUDIO_SESSION_SECRET', SECRET);
    expect(isValidStudioSessionToken(token)).toBe(true);
    vi.stubEnv('STUDIO_LAN_PIN', '135790');
    expect(isValidStudioSessionToken(token)).toBe(false);
  });

  it('el PIN correcto da una cookie HttpOnly, SameSite=Strict y de 12 h', async () => {
    const res = await postPin(PIN);
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain(`${STUDIO_SESSION_COOKIE}=`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Strict/i);
    expect(setCookie).toContain(`Max-Age=${STUDIO_SESSION_MAX_AGE_SECONDS}`);
  });

  it('cerrar sesión invalida la cookie también en el servidor', async () => {
    const token = createStudioSessionToken() ?? undefined;
    const other = createStudioSessionToken() ?? undefined;
    const res = await logout(apiRequest('/api/admin/session', { method: 'DELETE', token }));
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect(isValidStudioSessionToken(token)).toBe(false);
    expect(guardStudioApi(apiRequest('/api/admin/exercises', { token }))?.status).toBe(401);
    expect(isValidStudioSessionToken(other)).toBe(true);
  });

  it('el PIN no se puede probar desde otra página', async () => {
    const res = await postPin(PIN, { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' });
    expect(res.status).toBe(403);
    expect(res.headers.get('set-cookie')).toBeNull();
  });
});

describe('bloqueo global por PIN fallido', () => {
  it(`tras ${MAX_PIN_FAILURES} fallos bloquea, aunque cada intento llegue con otra IP o cabeceras`, async () => {
    for (let i = 1; i < MAX_PIN_FAILURES; i += 1) {
      const res = await postPin('000000', { 'x-forwarded-for': `10.0.0.${i}`, 'x-real-ip': `10.0.0.${i}`, 'user-agent': `bot-${i}` });
      expect(res.status).toBe(401);
    }
    const last = await postPin('000000', { 'x-forwarded-for': '10.0.0.99' });
    expect(last.status).toBe(429);

    const right = await postPin(PIN, { 'x-forwarded-for': '192.168.1.77', host: '192.168.1.20:3000' });
    expect(right.status).toBe(429);
    expect(right.headers.get('set-cookie')).toBeNull();
    // postPin advanced the clock 1 s since the lockout started.
    expect(right.headers.get('retry-after')).toBe(String(PIN_LOCKOUT_BASE_MS / 1000 - 1));
    expect(((await right.json()) as { error: string }).error).toContain('15 minutos');
  });

  it('el PIN correcto se rechaza mientras dura el bloqueo y vale al terminar', () => {
    for (let i = 0; i < MAX_PIN_FAILURES; i += 1) attemptStudioPinLogin('000000');
    expect(attemptStudioPinLogin(PIN)).toEqual({ status: 'locked', retryAfterMs: PIN_LOCKOUT_BASE_MS });

    vi.setSystemTime(Date.now() + PIN_LOCKOUT_BASE_MS - 1_000);
    expect(attemptStudioPinLogin(PIN).status).toBe('locked');

    vi.setSystemTime(Date.now() + 1_000);
    expect(attemptStudioPinLogin(PIN).status).toBe('ok');
  });

  it('cada bloqueo seguido dura el doble; acertar el PIN lo reinicia', () => {
    for (let i = 0; i < MAX_PIN_FAILURES; i += 1) attemptStudioPinLogin('000000');
    vi.setSystemTime(Date.now() + PIN_LOCKOUT_BASE_MS);
    for (let i = 0; i < MAX_PIN_FAILURES - 1; i += 1) attemptStudioPinLogin('000000');
    expect(attemptStudioPinLogin('000000')).toEqual({ status: 'locked', retryAfterMs: 2 * PIN_LOCKOUT_BASE_MS });

    vi.setSystemTime(Date.now() + 2 * PIN_LOCKOUT_BASE_MS);
    expect(attemptStudioPinLogin(PIN).status).toBe('ok');
    expect(attemptStudioPinLogin('000000')).toEqual({ status: 'wrong', attemptsLeft: MAX_PIN_FAILURES - 1 });
  });
});

describe('isCrossSiteWrite (CSRF)', () => {
  it('deja pasar lo que envía el propio Estudio', () => {
    expect(isCrossSiteWrite('POST', from({ host: 'localhost:3000', origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' }))).toBe(false);
    expect(isCrossSiteWrite('DELETE', from({ host: '192.168.1.20:3000', origin: 'http://192.168.1.20:3000' }))).toBe(false);
  });

  it('rechaza escrituras desde otra página', () => {
    expect(isCrossSiteWrite('POST', from({ host: 'localhost:3000', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }))).toBe(true);
    expect(isCrossSiteWrite('POST', from({ host: 'localhost:3000', origin: 'http://localhost:5173' }))).toBe(true);
    expect(isCrossSiteWrite('POST', from({ host: 'localhost:3000', 'sec-fetch-site': 'same-site' }))).toBe(true);
    expect(isCrossSiteWrite('POST', from({ host: 'localhost:3000', origin: 'null' }))).toBe(true);
  });

  it('las lecturas y las peticiones sin navegador no cambian', () => {
    expect(isCrossSiteWrite('GET', from({ host: 'localhost:3000', origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(isCrossSiteWrite('POST', from({ host: 'localhost:3000' }))).toBe(false);
  });

  it('una escritura de otra página se rechaza aunque traiga la cookie', () => {
    const token = createStudioSessionToken() ?? undefined;
    const res = guardStudioApi(apiRequest('/api/admin/exercises', { method: 'POST', token, headers: { origin: 'http://localhost:5173' }, body: '{}' }));
    expect(res?.status).toBe(403);
  });
});

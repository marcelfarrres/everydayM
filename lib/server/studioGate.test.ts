import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STUDIO_SESSION_COOKIE,
  createLanSessionToken,
  getStudioAccess,
  isCrossSiteWrite,
  isLanSessionSecretConfigured,
  isValidLanSessionToken,
  verifyLanPin,
} from './studioGate';

// 'server-only' throws outside a React Server Components build; vi.mock is hoisted above the imports.
vi.mock('server-only', () => ({}));

const PIN = '246810';
const SECRET = 'a'.repeat(64);

function headers(host: string) {
  return { get: (name: string) => (name === 'host' ? host : null) };
}

function cookies(value?: string) {
  return {
    get: (name: string) => (name === STUDIO_SESSION_COOKIE && value !== undefined ? { value } : undefined),
  };
}

beforeEach(() => {
  vi.stubEnv('STUDIO_ENABLED', 'true');
  vi.stubEnv('STUDIO_LAN_PIN', PIN);
  vi.stubEnv('STUDIO_SESSION_SECRET', SECRET);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('studioGate con STUDIO_SESSION_SECRET', () => {
  it('acepta el PIN y la cookie firmada cuando el secreto está configurado', () => {
    expect(isLanSessionSecretConfigured()).toBe(true);
    expect(verifyLanPin(PIN)).toBe(true);
    expect(verifyLanPin('000000')).toBe(false);
    const token = createLanSessionToken();
    expect(token).not.toBeNull();
    expect(isValidLanSessionToken(token ?? undefined)).toBe(true);
    expect(getStudioAccess(headers('192.168.1.20:3000'), cookies(token ?? undefined))).toBe('lan');
  });

  it.each([
    ['sin secreto', ''],
    ['secreto corto', 'x'.repeat(31)],
  ])('falla cerrado %s', (_label, secret) => {
    const token = createLanSessionToken();
    vi.stubEnv('STUDIO_SESSION_SECRET', secret);
    expect(isLanSessionSecretConfigured()).toBe(false);
    expect(verifyLanPin(PIN)).toBe(false);
    expect(createLanSessionToken()).toBeNull();
    expect(isValidLanSessionToken(token ?? undefined)).toBe(false);
    expect(getStudioAccess(headers('192.168.1.20:3000'), cookies(token ?? undefined))).toBe('lan-login-required');
  });

  it('no usa SUPABASE_SERVICE_ROLE_KEY como alternativa', () => {
    vi.stubEnv('STUDIO_SESSION_SECRET', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'b'.repeat(64));
    expect(isLanSessionSecretConfigured()).toBe(false);
    expect(verifyLanPin(PIN)).toBe(false);
  });

  it('cambiar el secreto invalida las sesiones abiertas', () => {
    const token = createLanSessionToken();
    vi.stubEnv('STUDIO_SESSION_SECRET', 'c'.repeat(64));
    expect(isValidLanSessionToken(token ?? undefined)).toBe(false);
  });

  it('localhost sigue entrando sin PIN ni secreto', () => {
    vi.stubEnv('STUDIO_SESSION_SECRET', '');
    vi.stubEnv('STUDIO_LAN_PIN', '');
    expect(getStudioAccess(headers('localhost:3000'), cookies())).toBe('local');
  });
});

describe('isCrossSiteWrite (CSRF)', () => {
  const from = (values: Record<string, string>) => ({ get: (name: string) => values[name] ?? null });

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
});
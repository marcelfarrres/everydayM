import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * EverydayM Studio access gate.
 *
 * Every Studio page and API route needs ALL of:
 *  1. STUDIO_ENABLED=true (never set on Vercel): otherwise 404.
 *  2. STUDIO_LAN_PIN (>= 6 chars) and STUDIO_SESSION_SECRET (>= 32 chars): otherwise the Studio
 *     stays closed for everyone and says which setting is missing (fail closed).
 *  3. A valid session cookie, signed with the PIN + secret, obtained by entering the PIN.
 *
 * The PIN is asked for always, also on the computer itself: Next does not expose the caller's
 * real address, and Host / Origin / X-Forwarded-* are written by the client (a device on the
 * Wi-Fi can send `Host: localhost`). Those headers are only ever used to REFUSE a request
 * (unknown host, cross-site write), never to let one in.
 */

export const STUDIO_SESSION_COOKIE = 'everydaym_studio_session';
/** A session lasts 12 h; after that the PIN is asked for again. */
export const STUDIO_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
const MIN_PIN_LENGTH = 6;
const MIN_SESSION_SECRET_LENGTH = 32;
const TOKEN_VERSION = 'v2';

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

interface HeaderReader {
  get(name: string): string | null;
}

interface CookieReader {
  get(name: string): { value: string } | undefined;
}

function extractHostname(hostHeader: string | null | undefined): string {
  if (!hostHeader) return '';
  const trimmed = hostHeader.trim().toLowerCase();
  if (!trimmed) return '';

  // IPv6 with port e.g. [::1]:3000
  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']');
    return closeIdx !== -1 ? trimmed.slice(0, closeIdx + 1) : trimmed;
  }

  // IPv4 or hostname with port e.g. 192.168.1.20:3000
  const colonIdx = trimmed.indexOf(':');
  return colonIdx !== -1 ? trimmed.slice(0, colonIdx) : trimmed;
}

export function isLocalhostHost(hostHeader: string | null | undefined): boolean {
  return LOCALHOST_HOSTS.has(extractHostname(hostHeader));
}

/** RFC 1918 private IPv4 ranges: 10/8, 172.16/12, 192.168/16. */
export function isPrivateLanHost(hostHeader: string | null | undefined): boolean {
  const hostname = extractHostname(hostHeader);
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!match) return false;

  const octets = match.slice(1).map(Number);
  if (octets.some((n) => n > 255)) return false;
  const [a, b] = octets;

  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/**
 * Deny-only check: the Studio answers only to this computer's names and home-network IPs.
 * Passing it grants nothing (the client writes these headers); a session is still required.
 */
function isStudioHost(headers: HeaderReader): boolean {
  const isHomeHost = (value: string | null) => isLocalhostHost(value) || isPrivateLanHost(value);
  const forwardedHost = headers.get('x-forwarded-host');
  return isHomeHost(headers.get('host')) && (!forwardedHost || isHomeHost(forwardedHost));
}

export function isStudioEnabledRuntime(): boolean {
  // Read via computed key as well so the value is never inlined at build time.
  const runtimeKey = ['STUDIO', 'ENABLED'].join('_');
  return process.env.STUDIO_ENABLED === 'true' && process.env[runtimeKey] === 'true';
}

function getStudioPin(): string | null {
  const pinKey = ['STUDIO', 'LAN', 'PIN'].join('_');
  const pin = process.env[pinKey]?.trim();
  return pin && pin.length >= MIN_PIN_LENGTH ? pin : null;
}

/**
 * Server-only secret that signs the session cookie. No fallback to any other variable:
 * without it (or if it is too short) the Studio stays closed.
 */
function getSessionSecret(): string | null {
  const secretKey = ['STUDIO', 'SESSION', 'SECRET'].join('_');
  const secret = process.env[secretKey]?.trim();
  return secret && secret.length >= MIN_SESSION_SECRET_LENGTH ? secret : null;
}

/**
 * Spanish message naming the missing settings (never their values), or null when the Studio
 * can open. Shown on the PIN screen and returned by every Studio API route.
 */
export function getStudioConfigProblem(): string | null {
  const missing: string[] = [];
  if (!getStudioPin()) missing.push(`STUDIO_LAN_PIN (el PIN del Estudio, ${MIN_PIN_LENGTH} caracteres o más)`);
  if (!getSessionSecret()) {
    missing.push(
      `STUDIO_SESSION_SECRET (${MIN_SESSION_SECRET_LENGTH} caracteres o más; genera uno con ` +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"`)',
    );
  }
  if (missing.length === 0) return null;
  const one = missing.length === 1;
  return (
    `El Estudio está cerrado: ${one ? 'falta' : 'faltan'} ${missing.join(' y ')} en el .env.local ` +
    `del ordenador (o ${one ? 'es demasiado corto' : 'son demasiado cortos'}). ` +
    `${one ? 'Ponlo' : 'Ponlos'} en .env.local y vuelve a abrir el Estudio.`
  );
}

/** HMAC key derived from the PIN + session secret: rotating either invalidates every session. */
function getSigningKey(pin: string, secret: string): Buffer {
  return createHmac('sha256', `${secret}::everydaym-studio-session`).update(pin).digest();
}

function sign(payload: string, pin: string, secret: string): string {
  return createHmac('sha256', getSigningKey(pin, secret)).update(payload).digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Constant-time PIN check (fails closed without PIN or secret). */
export function verifyStudioPin(candidate: string): boolean {
  const pin = getStudioPin();
  const secret = getSessionSecret();
  if (!pin || !secret) return false;
  // Compare HMAC digests so the comparison is constant-time regardless of length.
  const key = getSigningKey(pin, secret);
  const expected = createHmac('sha256', key).update(pin).digest('base64url');
  const received = createHmac('sha256', key).update(candidate).digest('base64url');
  return safeEqual(expected, received);
}

/* ---------- Session tokens: v2.<expiresAt>.<nonce>.<signature> ---------- */

interface GateState {
  /** Tokens closed with "Cerrar sesión" → their expiry (s), pruned once expired. */
  revoked: Map<string, number>;
  failures: number;
  lockouts: number;
  lockedUntil: number;
}

// On globalThis so a dev hot reload of this module does not reset the lockout.
const STATE_KEY = Symbol.for('everydaym.studioGate.state');
function state(): GateState {
  const holder = globalThis as unknown as Record<symbol, GateState | undefined>;
  holder[STATE_KEY] ??= { revoked: new Map(), failures: 0, lockouts: 0, lockedUntil: 0 };
  return holder[STATE_KEY];
}

export function createStudioSessionToken(nowMs: number = Date.now()): string | null {
  const pin = getStudioPin();
  const secret = getSessionSecret();
  if (!pin || !secret) return null;
  const expiresAt = Math.floor(nowMs / 1000) + STUDIO_SESSION_MAX_AGE_SECONDS;
  const payload = `${TOKEN_VERSION}.${expiresAt}.${randomBytes(16).toString('base64url')}`;
  return `${payload}.${sign(payload, pin, secret)}`;
}

/** Signature and expiry check; returns the expiry (s) of a valid token, else null. */
function readSessionToken(token: string | undefined, nowMs: number): number | null {
  const pin = getStudioPin();
  const secret = getSessionSecret();
  if (!pin || !secret || !token || token.length > 256) return null;

  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return null;

  const expiresAt = Number(parts[1]);
  if (!/^\d+$/.test(parts[1]) || !Number.isSafeInteger(expiresAt) || expiresAt * 1000 <= nowMs) return null;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(parts[2])) return null;

  const payload = `${parts[0]}.${parts[1]}.${parts[2]}`;
  return safeEqual(sign(payload, pin, secret), parts[3]) ? expiresAt : null;
}

export function isValidStudioSessionToken(token: string | undefined, nowMs: number = Date.now()): boolean {
  if (readSessionToken(token, nowMs) === null || !token) return false;
  return !state().revoked.has(token);
}

/**
 * "Cerrar sesión": the token stops working on the server too (not only the cookie is cleared).
 * Kept in memory until it would have expired; restarting the Studio forgets the list, which
 * is why sessions are short. To close every session at once, change the PIN or the secret.
 */
export function revokeStudioSessionToken(token: string | undefined, nowMs: number = Date.now()): void {
  const expiresAt = readSessionToken(token, nowMs);
  const { revoked } = state();
  for (const [value, expiry] of revoked) {
    if (expiry * 1000 <= nowMs) revoked.delete(value);
  }
  if (expiresAt !== null && token) revoked.set(token, expiresAt);
}

/* ---------- Global PIN lockout ---------- */

/**
 * One counter for the whole Studio, not per caller: anything that could tell callers apart
 * (X-Forwarded-For, X-Real-IP, cookies) is written by the caller. After MAX_PIN_FAILURES wrong
 * PINs in a row every PIN attempt is refused, the right one too, for PIN_LOCKOUT_BASE_MS; each
 * new lockout without a correct PIN in between doubles it, up to PIN_LOCKOUT_MAX_MS. Someone on
 * the Wi-Fi can lock the owner out this way; restarting the Studio on the computer clears it.
 */
export const MAX_PIN_FAILURES = 5;
export const PIN_LOCKOUT_BASE_MS = 15 * 60 * 1000;
export const PIN_LOCKOUT_MAX_MS = 24 * 60 * 60 * 1000;

export type PinAttemptResult =
  | { status: 'ok'; token: string }
  | { status: 'wrong'; attemptsLeft: number }
  | { status: 'locked'; retryAfterMs: number }
  | { status: 'misconfigured'; message: string };

function formatWait(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return minutes === 1 ? '1 minuto' : `${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const h = hours === 1 ? '1 hora' : `${hours} horas`;
  return rest ? `${h} y ${rest} min` : h;
}

export function pinLockedMessage(retryAfterMs: number): string {
  return `Demasiados PIN incorrectos. El Estudio no acepta ningún PIN durante ${formatWait(retryAfterMs)} más.`;
}

/**
 * Check a PIN and, if right, issue a session token. Synchronous on purpose: the lockout check,
 * the comparison and the failure count happen in one step, so parallel requests cannot all
 * slip in before the counter moves.
 */
export function attemptStudioPinLogin(candidate: string, nowMs: number = Date.now()): PinAttemptResult {
  const problem = getStudioConfigProblem();
  if (problem) return { status: 'misconfigured', message: problem };

  const s = state();
  if (nowMs < s.lockedUntil) return { status: 'locked', retryAfterMs: s.lockedUntil - nowMs };

  if (!candidate || !verifyStudioPin(candidate)) {
    s.failures += 1;
    if (s.failures >= MAX_PIN_FAILURES) {
      s.failures = 0;
      s.lockouts += 1;
      const duration = Math.min(PIN_LOCKOUT_BASE_MS * 2 ** (s.lockouts - 1), PIN_LOCKOUT_MAX_MS);
      s.lockedUntil = nowMs + duration;
      return { status: 'locked', retryAfterMs: duration };
    }
    return { status: 'wrong', attemptsLeft: MAX_PIN_FAILURES - s.failures };
  }

  const token = createStudioSessionToken(nowMs);
  if (!token) return { status: 'misconfigured', message: getStudioConfigProblem() ?? 'Estudio sin configurar.' };
  s.failures = 0;
  s.lockouts = 0;
  s.lockedUntil = 0;
  return { status: 'ok', token };
}

/** Tests only: forget failures, lockouts and revoked sessions. */
export function resetStudioGateStateForTests(): void {
  const s = state();
  s.revoked.clear();
  s.failures = 0;
  s.lockouts = 0;
  s.lockedUntil = 0;
}

/* ---------- Access decision ---------- */

export type StudioAccess = 'granted' | 'login-required' | 'misconfigured' | 'denied';

/** Decide how a request may use the Studio. Only a valid session cookie grants access. */
export function getStudioAccess(headers: HeaderReader, cookies: CookieReader): StudioAccess {
  if (!isStudioEnabledRuntime()) return 'denied';
  if (!isStudioHost(headers)) return 'denied';
  if (getStudioConfigProblem()) return 'misconfigured';
  return isValidStudioSessionToken(cookies.get(STUDIO_SESSION_COOKIE)?.value) ? 'granted' : 'login-required';
}

/**
 * A write sent by another site's page (CSRF). The session cookie is SameSite=Strict, but a page
 * on the same site (another port of this computer, another device's IP) can still reach the
 * Studio, and a <form> or a no-cors fetch with a text/plain body gets through without a
 * preflight. Browsers mark such requests with Sec-Fetch-Site and Origin; requests without
 * either (curl, scripts) are not from a page. Deny-only.
 */
export function isCrossSiteWrite(method: string, headers: HeaderReader): boolean {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') return true;
  const origin = headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).host.toLowerCase() !== (headers.get('host') ?? '').trim().toLowerCase();
  } catch {
    return true; // "null" or garbage
  }
}

export const CROSS_SITE_MESSAGE = 'Petición rechazada: viene de otra página.';

export function guardStudioApi(req: NextRequest): NextResponse | null {
  const access = getStudioAccess(req.headers, req.cookies);
  if (access === 'granted') {
    return isCrossSiteWrite(req.method, req.headers)
      ? NextResponse.json({ error: CROSS_SITE_MESSAGE }, { status: 403 })
      : null;
  }
  if (access === 'login-required') {
    return NextResponse.json({ error: 'PIN requerido' }, { status: 401 });
  }
  if (access === 'misconfigured') {
    return NextResponse.json({ error: getStudioConfigProblem() }, { status: 503 });
  }
  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}

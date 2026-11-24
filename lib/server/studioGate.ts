import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

/**
 * EverydayM Studio access gate.
 *
 * Access requires STUDIO_ENABLED=true (never set on Vercel) AND one of:
 *  - LOCAL: the request targets localhost / 127.0.0.1 / ::1 (your PC), no PIN.
 *  - LAN:   the request targets a private IPv4 address (phone on the same WiFi),
 *           STUDIO_LAN_PIN is configured (>= 6 chars) and the request carries a
 *           valid signed session cookie obtained by entering that PIN. The cookie
 *           is signed with STUDIO_SESSION_SECRET (>= 32 chars); without it no PIN
 *           login or LAN session is accepted (fail closed). LOCAL never needs it.
 */

export const STUDIO_SESSION_COOKIE = 'everydaym_studio_session';
export const STUDIO_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60; // 12 h
const MIN_PIN_LENGTH = 6;
const MIN_SESSION_SECRET_LENGTH = 32;

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

export function isStudioEnabledRuntime(): boolean {
  // Read via computed key as well so the value is never inlined at build time.
  const runtimeKey = ['STUDIO', 'ENABLED'].join('_');
  return process.env.STUDIO_ENABLED === 'true' && process.env[runtimeKey] === 'true';
}

function getLanPin(): string | null {
  const pinKey = ['STUDIO', 'LAN', 'PIN'].join('_');
  const pin = process.env[pinKey]?.trim();
  return pin && pin.length >= MIN_PIN_LENGTH ? pin : null;
}

export function isLanModeConfigured(): boolean {
  return getLanPin() !== null;
}

/**
 * Server-only secret that signs the LAN session cookie. No fallback to any other variable:
 * without it (or if it is too short) PIN login and LAN sessions fail closed.
 */
function getSessionSecret(): string | null {
  const secretKey = ['STUDIO', 'SESSION', 'SECRET'].join('_');
  const secret = process.env[secretKey]?.trim();
  return secret && secret.length >= MIN_SESSION_SECRET_LENGTH ? secret : null;
}

export function isLanSessionSecretConfigured(): boolean {
  return getSessionSecret() !== null;
}

/** Shown on the PIN screen when LAN mode is on but the session secret is missing or too short. */
export const MISSING_SESSION_SECRET_MESSAGE =
  `El Estudio no puede abrir sesión por la wifi: falta STUDIO_SESSION_SECRET (${MIN_SESSION_SECRET_LENGTH} caracteres o más) ` +
  'en el .env.local del ordenador. Genera uno con ' +
  '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"`, ' +
  'ponlo en .env.local y vuelve a abrir el Estudio.';

/** HMAC key derived from the PIN + session secret: rotating either invalidates sessions. */
function getSigningKey(pin: string, secret: string): Buffer {
  return createHmac('sha256', `${secret}::everydaym-studio-lan`).update(pin).digest();
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

export function verifyLanPin(candidate: string): boolean {
  const pin = getLanPin();
  const secret = getSessionSecret();
  if (!pin || !secret) return false;
  // Compare HMAC digests so the comparison is constant-time regardless of length.
  const key = getSigningKey(pin, secret);
  const expected = createHmac('sha256', key).update(pin).digest('base64url');
  const received = createHmac('sha256', key).update(candidate).digest('base64url');
  return safeEqual(expected, received);
}

export function createLanSessionToken(nowMs: number = Date.now()): string | null {
  const pin = getLanPin();
  const secret = getSessionSecret();
  if (!pin || !secret) return null;
  const expiresAt = Math.floor(nowMs / 1000) + STUDIO_SESSION_MAX_AGE_SECONDS;
  const payload = `v1.${expiresAt}`;
  return `${payload}.${sign(payload, pin, secret)}`;
}

export function isValidLanSessionToken(token: string | undefined, nowMs: number = Date.now()): boolean {
  const pin = getLanPin();
  const secret = getSessionSecret();
  if (!pin || !secret || !token) return false;

  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1') return false;

  const expiresAt = Number(parts[1]);
  if (!Number.isInteger(expiresAt) || expiresAt * 1000 < nowMs) return false;

  return safeEqual(sign(`v1.${parts[1]}`, pin, secret), parts[2]);
}

export type StudioAccess = 'local' | 'lan' | 'lan-login-required' | 'denied';

/** Decide how a request may use the Studio. */
export function getStudioAccess(headers: HeaderReader, cookies: CookieReader): StudioAccess {
  if (!isStudioEnabledRuntime()) return 'denied';

  const host = headers.get('host');
  const forwardedHost = headers.get('x-forwarded-host');

  if (isLocalhostHost(host) && (!forwardedHost || isLocalhostHost(forwardedHost))) {
    return 'local';
  }

  if (isPrivateLanHost(host) && (!forwardedHost || isPrivateLanHost(forwardedHost))) {
    if (!isLanModeConfigured()) return 'denied';
    return isValidLanSessionToken(cookies.get(STUDIO_SESSION_COOKIE)?.value)
      ? 'lan'
      : 'lan-login-required';
  }

  return 'denied';
}

export function isStudioRequestAllowed(headers: HeaderReader, cookies: CookieReader): boolean {
  const access = getStudioAccess(headers, cookies);
  return access === 'local' || access === 'lan';
}

/**
 * A write sent by another site's page (CSRF). On localhost the Studio needs no PIN, so any page
 * open in the same browser could otherwise POST to it: a <form> or a no-cors fetch with a
 * text/plain body reaches the route without a preflight. Browsers mark such requests with
 * Sec-Fetch-Site and Origin; requests without either (curl, scripts) are not from a page.
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

export function guardStudioApi(req: NextRequest): NextResponse | null {
  const access = getStudioAccess(req.headers, req.cookies);
  if ((access === 'local' || access === 'lan') && isCrossSiteWrite(req.method, req.headers)) {
    return NextResponse.json({ error: 'Petición rechazada: viene de otra página.' }, { status: 403 });
  }
  if (access === 'local' || access === 'lan') return null;
  if (access === 'lan-login-required') {
    return NextResponse.json({ error: 'PIN requerido' }, { status: 401 });
  }
  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}

export function getRequestIp(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
}

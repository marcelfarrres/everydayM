import { NextRequest, NextResponse } from 'next/server';
import {
  STUDIO_SESSION_COOKIE,
  STUDIO_SESSION_MAX_AGE_SECONDS,
  createLanSessionToken,
  getRequestIp,
  getStudioAccess,
  verifyLanPin,
} from '@/lib/server/studioGate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_FAILURES = 5;
const LOCKOUT_MS = 10 * 60 * 1000;
const failures = new Map<string, { count: number; firstAt: number }>();

function isLockedOut(ip: string, now: number): boolean {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (now - entry.firstAt > LOCKOUT_MS) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILURES;
}

function registerFailure(ip: string, now: number): void {
  const entry = failures.get(ip);
  if (!entry || now - entry.firstAt > LOCKOUT_MS) {
    failures.set(ip, { count: 1, firstAt: now });
  } else {
    entry.count += 1;
  }
}

/** Exchange the LAN PIN for a signed, httpOnly session cookie. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const access = getStudioAccess(req.headers, req.cookies);
  if (access === 'denied') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  if (access === 'local' || access === 'lan') {
    return NextResponse.json({ ok: true });
  }

  const ip = getRequestIp(req);
  const now = Date.now();
  if (isLockedOut(ip, now)) {
    return NextResponse.json(
      { error: 'Demasiados intentos. Espera 10 minutos.' },
      { status: 429 },
    );
  }

  let pin = '';
  try {
    const body: unknown = await req.json();
    if (body && typeof body === 'object' && 'pin' in body) {
      const value = (body as { pin: unknown }).pin;
      if (typeof value === 'string') pin = value.trim().slice(0, 64);
    }
  } catch {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });
  }

  if (!pin || !verifyLanPin(pin)) {
    registerFailure(ip, now);
    // Small fixed delay to slow down guessing.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 });
  }

  failures.delete(ip);
  const token = createLanSessionToken(now);
  if (!token) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STUDIO_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: false, // LAN over plain http
    path: '/',
    maxAge: STUDIO_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

/** Log out: clear the session cookie. */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (getStudioAccess(req.headers, req.cookies) === 'denied') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STUDIO_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}

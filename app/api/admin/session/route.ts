import { NextRequest, NextResponse } from 'next/server';
import {
  CROSS_SITE_MESSAGE,
  STUDIO_SESSION_COOKIE,
  STUDIO_SESSION_MAX_AGE_SECONDS,
  attemptStudioPinLogin,
  getStudioAccess,
  getStudioConfigProblem,
  isCrossSiteWrite,
  pinLockedMessage,
  revokeStudioSessionToken,
} from '@/lib/server/studioGate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Small fixed delay after a wrong PIN to slow down guessing. */
const WRONG_PIN_DELAY_MS = 600;

/**
 * Exchange the Studio PIN for a signed session cookie. Always required, also on this computer.
 * The failed-PIN lockout is global (see attemptStudioPinLogin): no header the caller sends
 * changes it.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const access = getStudioAccess(req.headers, req.cookies);
  if (access === 'denied') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  if (access === 'misconfigured') {
    return NextResponse.json({ error: getStudioConfigProblem() }, { status: 503 });
  }
  // A page on another site must not be able to try PINs through the owner's browser.
  if (isCrossSiteWrite(req.method, req.headers)) {
    return NextResponse.json({ error: CROSS_SITE_MESSAGE }, { status: 403 });
  }
  if (access === 'granted') {
    return NextResponse.json({ ok: true });
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

  const result = attemptStudioPinLogin(pin);

  if (result.status === 'misconfigured') {
    return NextResponse.json({ error: result.message }, { status: 503 });
  }
  if (result.status === 'locked') {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PIN_DELAY_MS));
    return NextResponse.json(
      { error: pinLockedMessage(result.retryAfterMs) },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)) } },
    );
  }
  if (result.status === 'wrong') {
    await new Promise((resolve) => setTimeout(resolve, WRONG_PIN_DELAY_MS));
    return NextResponse.json({ error: 'PIN incorrecto' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(STUDIO_SESSION_COOKIE, result.token, {
    httpOnly: true, // not readable from page scripts
    sameSite: 'strict', // not sent on requests started by other sites
    // Not `secure`: the Studio is used over plain http (localhost and the home Wi-Fi IP), and a
    // Secure cookie would never be sent back there. The cookie is signed and short-lived instead.
    secure: false,
    path: '/',
    maxAge: STUDIO_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}

/** Log out: the token is revoked on the server and the cookie cleared. */
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  if (getStudioAccess(req.headers, req.cookies) === 'denied') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  if (isCrossSiteWrite(req.method, req.headers)) {
    return NextResponse.json({ error: CROSS_SITE_MESSAGE }, { status: 403 });
  }
  revokeStudioSessionToken(req.cookies.get(STUDIO_SESSION_COOKIE)?.value);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(STUDIO_SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    path: '/',
    maxAge: 0,
  });
  return res;
}

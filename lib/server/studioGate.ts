import 'server-only';
import { NextRequest, NextResponse } from 'next/server';

const LOCALHOST_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function extractHostname(hostHeader: string | null | undefined): string {
  if (!hostHeader) return '';
  const trimmed = hostHeader.trim().toLowerCase();
  if (!trimmed) return '';

  // Handle IPv6 with port e.g. [::1]:3000
  if (trimmed.startsWith('[')) {
    const closeIdx = trimmed.indexOf(']');
    if (closeIdx !== -1) {
      return trimmed.slice(0, closeIdx + 1);
    }
    return trimmed;
  }

  // Handle IPv4 or hostname with port e.g. localhost:3000 or 127.0.0.1:3000
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx !== -1) {
    return trimmed.slice(0, colonIdx);
  }

  return trimmed;
}

export function isLocalhostHost(hostHeader: string | null | undefined): boolean {
  const hostname = extractHostname(hostHeader);
  return LOCALHOST_HOSTS.has(hostname);
}

export function isStudioEnabledRuntime(): boolean {
  const runtimeKey = ['STUDIO', 'ENABLED'].join('_');
  return (
    process.env.STUDIO_ENABLED === 'true' &&
    process.env[runtimeKey] === 'true'
  );
}

export function isStudioRequestAllowed(headers: {
  get(name: string): string | null;
}): boolean {
  if (!isStudioEnabledRuntime()) {
    return false;
  }

  const host = headers.get('host');
  if (!isLocalhostHost(host)) {
    return false;
  }

  const forwardedHost = headers.get('x-forwarded-host');
  if (forwardedHost && !isLocalhostHost(forwardedHost)) {
    return false;
  }

  return true;
}

export function guardStudioApi(req: NextRequest): NextResponse | null {
  if (!isStudioRequestAllowed(req.headers)) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  return null;
}

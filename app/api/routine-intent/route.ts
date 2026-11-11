import type { NextRequest } from 'next/server';
import { resolveRoutineIntent } from '@/lib/intent/gemini';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_TEXT_LENGTH = 500;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const MAX_TRACKED_IPS = 500;

const ipRequestTimestamps = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0]?.trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return '127.0.0.1';
}

function isRateLimited(ip: string, now: number): boolean {
  if (ipRequestTimestamps.size > MAX_TRACKED_IPS) {
    for (const [trackedIp, timestamps] of ipRequestTimestamps.entries()) {
      const recent = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (recent.length === 0) {
        ipRequestTimestamps.delete(trackedIp);
      } else {
        ipRequestTimestamps.set(trackedIp, recent);
      }
    }
  }

  const previous = ipRequestTimestamps.get(ip) ?? [];
  const windowTimestamps = previous.filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (windowTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    ipRequestTimestamps.set(ip, windowTimestamps);
    return true;
  }

  windowTimestamps.push(now);
  ipRequestTimestamps.set(ip, windowTimestamps);
  return false;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const now = Date.now();

  if (isRateLimited(ip, now)) {
    return Response.json(
      {
        error:
          'Has superado el límite de consultas por minuto. Espera unos segundos e inténtalo de nuevo.',
      },
      {
        status: 429,
        headers: { 'Retry-After': '60' },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'Formato de petición inválido. Se esperaba JSON { text }.' },
      { status: 400 },
    );
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !('text' in body) ||
    typeof (body as { text: unknown }).text !== 'string'
  ) {
    return Response.json(
      { error: 'El campo "text" es obligatorio y debe ser texto.' },
      { status: 400 },
    );
  }

  const rawText = (body as { text: string }).text;
  const trimmed = rawText.trim();

  if (trimmed.length === 0) {
    return Response.json(
      { error: 'Describe la rutina que quieres realizar.' },
      { status: 400 },
    );
  }

  if (trimmed.length > MAX_TEXT_LENGTH) {
    return Response.json(
      {
        error: `La descripción no puede superar los ${MAX_TEXT_LENGTH} caracteres.`,
      },
      { status: 400 },
    );
  }

  const result = await resolveRoutineIntent(trimmed);
  return Response.json(result, { status: 200 });
}

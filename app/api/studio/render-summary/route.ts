import fs from 'node:fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import {
  assertStudioRequest,
  renderTiktokSummaryMp4,
} from '@/lib/server/tiktokSummaryRenderer';
import type { RoutineMeta } from '@/types/workout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const blocked = assertStudioRequest(req) ?? guardStudioApi(req);
  if (blocked) return blocked;

  return NextResponse.json({
    studioAvailable: true,
    resolution: '1080x1920',
    fps: 30,
  });
}

function isValidRoutineMeta(value: unknown): value is RoutineMeta {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.totalSeconds === 'number' &&
    typeof candidate.rounds === 'number' &&
    Array.isArray(candidate.circuit)
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = assertStudioRequest(req) ?? guardStudioApi(req);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Cuerpo JSON inválido. Se esperaba { meta, handle? }.' },
      { status: 400 },
    );
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json(
      { error: 'Petición inválida. Falta el objeto meta de la rutina.' },
      { status: 400 },
    );
  }

  const payload = body as { meta?: unknown; handle?: unknown };
  if (!isValidRoutineMeta(payload.meta)) {
    return NextResponse.json(
      {
        error:
          'Los metadatos de la rutina (meta) son inválidos o están incompletos.',
      },
      { status: 400 },
    );
  }

  const handle =
    typeof payload.handle === 'string' && payload.handle.trim().length > 0
      ? payload.handle.trim().slice(0, 32)
      : '@everydaym';

  let renderResult: Awaited<ReturnType<typeof renderTiktokSummaryMp4>> | null =
    null;

  try {
    renderResult = await renderTiktokSummaryMp4({
      meta: payload.meta,
      handle,
    });

    const videoBuffer = await fs.readFile(renderResult.outputPath);

    return new NextResponse(new Uint8Array(videoBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition':
          'attachment; filename="everydaym-tiktok-summary.mp4"',
        'Content-Length': String(videoBuffer.byteLength),
        'X-Summary-Duration': String(renderResult.durationSeconds),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : 'Error al renderizar el vídeo resumen con FFmpeg.';
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (renderResult) {
      await renderResult.cleanup();
    }
  }
}

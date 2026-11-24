import 'server-only';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { ClipQueueError, getClip } from '@/lib/server/clips/queue';
import { ClipRequestError } from '@/lib/server/clips/select';
import type { ClipQueueItem } from '@/lib/clips/queue';

/* Small HTTP helpers shared by the clip routes. */

export function clipError(err: unknown, fallback = 'Error en la cola de clips.'): NextResponse {
  if (err instanceof ClipQueueError || err instanceof ClipRequestError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  return NextResponse.json({ error: err instanceof Error ? err.message : fallback }, { status: 500 });
}

export async function clipFromParams(params: Promise<{ id: string }>): Promise<ClipQueueItem | NextResponse> {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Ese clip no existe.' }, { status: 404 });
  const item = await getClip(id);
  return item ?? NextResponse.json({ error: 'Ese clip no existe.' }, { status: 404 });
}

export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json()) as unknown;
    return typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** A file from the clips folder, with byte ranges (Safari only plays a <video> that allows them). */
export async function fileResponse(
  req: NextRequest,
  file: string | null,
  o: { contentType: string; downloadName?: string },
): Promise<Response> {
  const stat = file ? await fs.stat(file).catch(() => null) : null;
  if (!file || !stat?.isFile()) return NextResponse.json({ error: 'Todavía no está listo.' }, { status: 404 });
  const size = stat.size;
  const headers: Record<string, string> = {
    'Content-Type': o.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };
  if (o.downloadName) headers['Content-Disposition'] = `attachment; filename="${o.downloadName}"`;

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(createReadStream(file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, 'Content-Length': String(size) } });
}

/** "everydaym-resumen-2026-11-24.mp4" */
export function downloadName(item: ClipQueueItem, ext: string): string {
  const day = item.createdAt.slice(0, 10);
  return `everydaym-${item.type.replace(/_/g, '-')}-${day}-${item.id.slice(0, 4)}.${ext}`;
}

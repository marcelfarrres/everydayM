import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { guardStudioApi } from '@/lib/server/studioGate';
import { cleanPrompt, runExport, validateExport, type ExportJob, type ExportMode } from '@/lib/server/tiktokExport';
import type { RoutineItem, RoutineMeta } from '@/types/workout';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Jobs live in memory on the Studio machine (kept on globalThis so dev reloads don't lose them).
const store = globalThis as unknown as { __tiktokJobs?: Map<string, ExportJob> };
const jobs = (store.__tiktokJobs ??= new Map());

/** POST { mode, queue, meta, handle } → { id }. One export at a time; it runs in the background. */
export async function POST(req: NextRequest) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;

  if ([...jobs.values()].some((job) => job.status === 'running')) {
    return NextResponse.json({ error: 'Ya hay un vídeo preparándose. Espera a que termine.' }, { status: 409 });
  }

  let body: { mode?: unknown; queue?: unknown; meta?: unknown; handle?: unknown; prompt?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Petición inválida.' }, { status: 400 });
  }
  const mode: ExportMode = body.mode === 'full' ? 'full' : 'summary';
  const queue = body.queue as RoutineItem[];
  const meta = body.meta as RoutineMeta;
  const problem = validateExport(mode, queue, meta);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const rawHandle = typeof body.handle === 'string' ? body.handle.replace(/[^\w.@]/g, '').slice(0, 30) : '';
  const handle = rawHandle ? (rawHandle.startsWith('@') ? rawHandle : `@${rawHandle}`) : '@everydaym';

  const id = randomUUID();
  const job: ExportJob = { status: 'running', progress: 0, step: 'Empezando' };
  jobs.set(id, job);
  void runExport(job, { mode, queue, meta, handle, prompt: cleanPrompt(body.prompt, meta) });
  return NextResponse.json({ id });
}

/** GET ?id=… → progress. GET ?id=…&file=1 → the MP4. */
export async function GET(req: NextRequest) {
  const blocked = guardStudioApi(req);
  if (blocked) return blocked;

  const id = req.nextUrl.searchParams.get('id') ?? '';
  const job = jobs.get(id);
  if (!job) return NextResponse.json({ error: 'No existe ese vídeo.' }, { status: 404 });

  if (req.nextUrl.searchParams.get('file') !== '1') {
    return NextResponse.json({ status: job.status, progress: job.progress, step: job.step, error: job.error });
  }
  if (job.status !== 'done' || !job.file) {
    return NextResponse.json({ error: 'Todavía no está listo.' }, { status: 409 });
  }
  const size = fs.statSync(job.file).size;
  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
  };
  if (req.nextUrl.searchParams.get('download') === '1') {
    headers['Content-Disposition'] = `attachment; filename="everydaym-${new Date().toISOString().slice(0, 10)}.mp4"`;
  }
  // Safari only plays a <video> when it can ask for byte ranges.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    const stream = Readable.toWeb(fs.createReadStream(job.file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(job.file)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, 'Content-Length': String(size) } });
}

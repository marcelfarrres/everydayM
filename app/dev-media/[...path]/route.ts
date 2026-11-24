import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { NextRequest, NextResponse } from 'next/server';
import { isLocalhostHost, isPrivateLanHost } from '@/lib/server/studioGate';
import { localFilePath, mediaDriver } from '@/lib/server/mediaStore';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/*
 * Development only: serves the local media folder (.media/) that the media store uses when
 * Bunny is not configured, so the Studio and the app work end to end without credentials.
 * Set NEXT_PUBLIC_MEDIA_BASE_URL=/dev-media (or leave it empty). 404 in production, when
 * Bunny is configured, or for hosts other than this computer and the home network.
 * Supports Range requests (Safari needs them to play <video>).
 */

const CONTENT_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
};

function notFound() {
  return NextResponse.json({ error: 'Not Found' }, { status: 404 });
}

function isAllowed(req: NextRequest): boolean {
  if (process.env.NODE_ENV !== 'development') return false;
  try {
    if (mediaDriver() !== 'local') return false;
  } catch {
    return false;
  }
  const host = req.headers.get('host');
  return isLocalhostHost(host) || isPrivateLanHost(host);
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!isAllowed(req)) return notFound();

  let filePath: string;
  try {
    filePath = localFilePath((await ctx.params).path.join('/'));
  } catch {
    return notFound();
  }

  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat || !stat.isFile()) return notFound();

  const headers = new Headers({
    'Content-Type': CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*',
  });

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  let start = 0;
  let end = stat.size - 1;
  let status = 200;

  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    } else {
      // "bytes=-500": the last 500 bytes
      start = Math.max(0, stat.size - Number(range[2]));
    }
    if (start > end || start >= stat.size) {
      headers.set('Content-Range', `bytes */${stat.size}`);
      return new NextResponse(null, { status: 416, headers });
    }
    status = 206;
    headers.set('Content-Range', `bytes ${start}-${end}/${stat.size}`);
  }

  headers.set('Content-Length', String(end - start + 1));
  const body = Readable.toWeb(createReadStream(filePath, { start, end })) as unknown as ReadableStream<Uint8Array>;
  return new NextResponse(body, { status, headers });
}

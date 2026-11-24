import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { localFilePath, mediaDriver, normalizeObjectPath, objectPathFromUrl, publicUrl } from '@/lib/server/mediaStore';
import { CACHE_DIR } from '@/lib/server/clips/paths';
import { join } from '@/lib/server/clips/run';

/*
 * The media a clip is made from. FFmpeg is only ever pointed at our own files:
 *  - a URL is accepted only when it is under the configured media base
 *    (NEXT_PUBLIC_MEDIA_BASE_URL, or the dev media route /dev-media in local mode);
 *  - with the local driver the file is read straight from .media/;
 *  - with Bunny it is downloaded from the CDN once and kept in .clips/cache/, so the next
 *    render of the same clip costs no transfer. The cache is trimmed to CACHE_MAX_BYTES,
 *    least recently used first.
 */

const CACHE_MAX_BYTES = 6 * 1024 * 1024 * 1024; // 6 GB

/** The stored object behind a media URL, or null when the URL is not ours. */
export function mediaObjectPath(url: unknown): string | null {
  if (typeof url !== 'string' || !url || url.length > 2000 || url.includes('..')) return null;
  // Absolute URLs or root-relative ones (/dev-media/…); never bare paths or old Supabase links.
  if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) return null;
  if (url.includes('/storage/v1/object/')) return null;
  try {
    const objectPath = objectPathFromUrl(url);
    return objectPath ? normalizeObjectPath(objectPath) : null;
  } catch {
    return null;
  }
}

export function isAllowedMediaUrl(url: unknown): boolean {
  return mediaObjectPath(url) !== null;
}

const INFLIGHT_KEY = Symbol.for('everydaym.clips.downloads');
type GlobalWithDownloads = typeof globalThis & { [INFLIGHT_KEY]?: Map<string, Promise<string>> };
const inflight = ((globalThis as GlobalWithDownloads)[INFLIGHT_KEY] ??= new Map());

function cacheFileFor(objectPath: string): string {
  const hash = createHash('sha1').update(objectPath).digest('hex').slice(0, 20);
  const ext = path.extname(objectPath).replace(/[^.a-z0-9]/gi, '').slice(0, 6) || '.bin';
  return join(CACHE_DIR, `${hash}${ext}`);
}

async function download(objectPath: string, target: string): Promise<string> {
  const res = await fetch(publicUrl(objectPath), { cache: 'no-store' });
  if (!res.ok || !res.body) throw new Error(`No se pudo descargar «${objectPath}» (HTTP ${res.status}).`);
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const temp = `${target}.${randomUUID().slice(0, 8)}.part`;
  try {
    await pipeline(Readable.fromWeb(res.body as unknown as NodeReadableStream<Uint8Array>), createWriteStream(temp));
    await fs.rename(temp, target);
  } catch (err) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw err;
  }
  return target;
}

/** A local file for a media URL: the original on disk (local driver) or a cached download. */
export async function localSource(url: string): Promise<string> {
  const objectPath = mediaObjectPath(url);
  if (!objectPath) throw new Error('Hay un vídeo que no es de la biblioteca de EverydayM.');

  if (mediaDriver() === 'local') {
    const file = localFilePath(objectPath);
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) throw new Error(`Falta «${objectPath}» en la carpeta .media.`);
    return file;
  }

  const target = cacheFileFor(objectPath);
  const cached = await fs.stat(target).catch(() => null);
  if (cached?.isFile() && cached.size > 0) {
    const now = new Date();
    await fs.utimes(target, now, now).catch(() => {}); // most recently used
    return target;
  }
  const running = inflight.get(objectPath);
  if (running) return running;
  const job = download(objectPath, target).finally(() => inflight.delete(objectPath));
  inflight.set(objectPath, job);
  return job;
}

/** Every URL as a local file, four downloads at a time. */
export async function localSources(urls: readonly string[], onProgress?: (done: number, total: number) => void): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const unique = [...new Set(urls)];
  for (let i = 0; i < unique.length; i += 4) {
    await Promise.all(
      unique.slice(i, i + 4).map(async (url) => {
        files.set(url, await localSource(url));
      }),
    );
    onProgress?.(Math.min(unique.length, i + 4), unique.length);
  }
  return files;
}

/** Keep the download cache under its size limit, dropping the least recently used files. */
export async function trimSourceCache(maxBytes = CACHE_MAX_BYTES): Promise<void> {
  const names = await fs.readdir(CACHE_DIR).catch(() => [] as string[]);
  const files = (
    await Promise.all(
      names
        .filter((n) => !n.endsWith('.part'))
        .map(async (name) => {
          const file = join(CACHE_DIR, name);
          const stat = await fs.stat(file).catch(() => null);
          return stat?.isFile() ? { file, size: stat.size, used: stat.mtimeMs } : null;
        }),
    )
  ).filter((f): f is { file: string; size: number; used: number } => f !== null);
  let total = files.reduce((sum, f) => sum + f.size, 0);
  for (const f of files.sort((a, b) => a.used - b.used)) {
    if (total <= maxBytes) break;
    await fs.rm(f.file, { force: true }).catch(() => {});
    total -= f.size;
  }
}

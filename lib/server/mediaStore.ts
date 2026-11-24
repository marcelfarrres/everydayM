import 'server-only';
import { createReadStream, openAsBlob } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

/*
 * Where the Studio keeps every file: videos, lite copies, posters, music and the catalog.
 *
 * Driver "bunny" — Bunny Storage HTTP API (https://docs.bunny.net/storage/http), when
 * BUNNY_STORAGE_ZONE, BUNNY_STORAGE_HOST, BUNNY_STORAGE_KEY and NEXT_PUBLIC_MEDIA_BASE_URL are set:
 *   PUT    https://{host}/{zone}/{path}    raw bytes -> 201
 *   GET    https://{host}/{zone}/{path}    -> 200 file, 404 missing
 *   GET    https://{host}/{zone}/{dir}/    -> 200 JSON array (ObjectName, Length, IsDirectory…)
 *   DELETE https://{host}/{zone}/{path}    -> 200 (a directory is deleted recursively!)
 *   Header AccessKey = storage zone password (not the account API key).
 *   Optional header Checksum = SHA-256 of the body, hex UPPERCASE; Bunny rejects a mismatch.
 *   Host by primary region: storage.bunnycdn.com (Falkenstein) or uk., ny., la., sg., se.,
 *   br., jh., syd. + storage.bunnycdn.com. The wrong region answers 401.
 *
 * Driver "local" — development only, when none of the BUNNY_STORAGE_* variables is set: files go
 * to `.media/` in the project (git-ignored) and are served by app/dev-media/[...path]. The public
 * base URL is NEXT_PUBLIC_MEDIA_BASE_URL, or "/dev-media" when it is empty.
 *
 * In production without Bunny every call fails with a clear error. Uploads stream from disk
 * (a file-backed Blob), never a whole video in memory.
 */

export type MediaDriver = 'bunny' | 'local';

const LOCAL_DEFAULT_BASE_URL = '/dev-media';
const LOCAL_ROOT = path.join(process.cwd(), '.media');
const SUPABASE_PUBLIC_MARKER = '/storage/v1/object/public/workout-videos/';

interface StoreConfig {
  driver: MediaDriver;
  baseUrl: string; // public URL prefix, no trailing slash (may be relative for "local")
  bunny?: { zone: string; host: string; key: string };
}

const STORAGE_VARS = ['BUNNY_STORAGE_ZONE', 'BUNNY_STORAGE_HOST', 'BUNNY_STORAGE_KEY'] as const;

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function trimSlashes(value: string): string {
  return value.replace(/\/+$/g, '');
}

function getConfig(): StoreConfig {
  const [zone, host, key] = STORAGE_VARS.map(readEnv);
  const baseUrl = trimSlashes(readEnv('NEXT_PUBLIC_MEDIA_BASE_URL'));
  const anyStorageVar = Boolean(zone || host || key);

  if (anyStorageVar) {
    const missing = [...STORAGE_VARS, 'NEXT_PUBLIC_MEDIA_BASE_URL'].filter((name) => !readEnv(name));
    if (missing.length > 0) {
      throw new Error(`Configuración de Bunny incompleta en .env.local: falta ${missing.join(', ')}.`);
    }
    return {
      driver: 'bunny',
      baseUrl,
      bunny: {
        zone: zone.replace(/^\/+|\/+$/g, ''),
        host: host.replace(/^https?:\/\//i, '').replace(/\/+$/g, ''),
        key,
      },
    };
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Falta configurar Bunny (BUNNY_STORAGE_ZONE, BUNNY_STORAGE_HOST, BUNNY_STORAGE_KEY y NEXT_PUBLIC_MEDIA_BASE_URL). El almacenamiento en disco solo funciona con «npm run dev».',
    );
  }
  return { driver: 'local', baseUrl: baseUrl || LOCAL_DEFAULT_BASE_URL };
}

export function mediaDriver(): MediaDriver {
  return getConfig().driver;
}

/** "videos/a b.mp4" -> "videos/a%20b.mp4" (each segment encoded, slashes kept). */
function encodePath(objectPath: string): string {
  return objectPath.split('/').map(encodeURIComponent).join('/');
}

/** A clean relative path: no leading slash, no "..", no empty segments, no trailing slash. */
export function normalizeObjectPath(raw: string): string {
  const cleaned = raw.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  const segments = cleaned.split('/');
  if (
    !cleaned ||
    cleaned.endsWith('/') ||
    segments.some((s) => !s || s === '.' || s === '..')
  ) {
    throw new Error(`Ruta de archivo no válida: «${raw}».`);
  }
  return cleaned;
}

/** Unique base name for a new object: "<timestamp>-<8 hex>". */
export function newObjectBaseName(): string {
  return `${Date.now()}-${randomUUID().slice(0, 8)}`;
}

/** The folder layout, identical in Bunny and on local disk. */
export const MEDIA_PATHS = {
  exerciseVideo: (base: string) => `videos/${base}.mp4`,
  exerciseLite: (base: string) => `videos/lite/${base}.mp4`,
  exercisePoster: (base: string) => `posters/${base}.webp`,
  talkVideo: (base: string) => `talks/${base}.mp4`,
  talkLite: (base: string) => `talks/lite/${base}.mp4`,
  talkPoster: (base: string) => `talks/posters/${base}.webp`,
  musicTrack: (base: string) => `music/${base}.m4a`,
} as const;

export function publicUrl(objectPath: string): string {
  return `${getConfig().baseUrl}/${encodePath(normalizeObjectPath(objectPath))}`;
}

/** Absolute path of an object in the local driver (always inside .media/). */
export function localFilePath(objectPath: string): string {
  const resolved = path.resolve(LOCAL_ROOT, normalizeObjectPath(objectPath));
  if (!resolved.startsWith(LOCAL_ROOT + path.sep)) {
    throw new Error('Ruta fuera de la carpeta de medios.');
  }
  return resolved;
}

function bunnyUrl(config: StoreConfig, objectPath: string, isDirectory = false): string {
  const bunny = config.bunny!;
  const suffix = objectPath ? `${encodePath(objectPath)}${isDirectory ? '/' : ''}` : '';
  return `https://${bunny.host}/${encodeURIComponent(bunny.zone)}/${suffix}`;
}

async function bunnyErrorText(res: Response): Promise<string> {
  const text = (await res.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200);
  const hint =
    res.status === 401
      ? ' Revisa BUNNY_STORAGE_KEY (la «Password» de lectura y escritura de la storage zone, no la API key de la cuenta) y BUNNY_STORAGE_HOST (el «API Endpoint» de Storage → zona → Access; depende de la región, Frankfurt = storage.bunnycdn.com, y si no coincide Bunny responde 401).'
      : '';
  return `HTTP ${res.status}${text ? ` · ${text}` : ''}.${hint}`;
}

async function sha256HexUpper(source: string | Buffer): Promise<string> {
  const hash = createHash('sha256');
  if (typeof source === 'string') {
    for await (const chunk of createReadStream(source)) hash.update(chunk as Buffer);
  } else {
    hash.update(source);
  }
  return hash.digest('hex').toUpperCase();
}

async function bunnyPut(
  config: StoreConfig,
  objectPath: string,
  body: Blob | Buffer,
  checksum: string,
  contentType: string,
): Promise<void> {
  const res = await fetch(bunnyUrl(config, objectPath), {
    method: 'PUT',
    headers: {
      AccessKey: config.bunny!.key,
      Checksum: checksum,
      'Content-Type': contentType,
    },
    body: body instanceof Blob ? body : new Uint8Array(body),
  });
  if (res.status !== 201) {
    throw new Error(`Bunny no aceptó «${objectPath}»: ${await bunnyErrorText(res)}`);
  }
}

/** Upload a local file (streamed from disk) and return its public URL. Overwrites. */
export async function putObject(
  objectPath: string,
  filePath: string,
  contentType: string,
): Promise<string> {
  const cleanPath = normalizeObjectPath(objectPath);
  const config = getConfig();

  if (config.driver === 'bunny') {
    const checksum = await sha256HexUpper(filePath);
    await bunnyPut(config, cleanPath, await openAsBlob(filePath, { type: contentType }), checksum, contentType);
  } else {
    const target = localFilePath(cleanPath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(filePath, target);
  }
  return publicUrl(cleanPath);
}

/** Upload small in-memory content (the catalog and its backups). */
export async function putContent(
  objectPath: string,
  content: string | Buffer,
  contentType: string,
): Promise<string> {
  const cleanPath = normalizeObjectPath(objectPath);
  const config = getConfig();
  const data = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;

  if (config.driver === 'bunny') {
    await bunnyPut(config, cleanPath, data, await sha256HexUpper(data), contentType);
  } else {
    const target = localFilePath(cleanPath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    // Write then rename, so a reader never sees half a file.
    const temp = `${target}.${randomUUID().slice(0, 8)}.tmp`;
    await fs.writeFile(temp, data);
    await fs.rename(temp, target);
  }
  return publicUrl(cleanPath);
}

/** Read a small object as text through the storage API (not the CDN). null = not found. */
export async function getObjectText(objectPath: string): Promise<string | null> {
  const cleanPath = normalizeObjectPath(objectPath);
  const config = getConfig();

  if (config.driver === 'bunny') {
    const res = await fetch(bunnyUrl(config, cleanPath), {
      headers: { AccessKey: config.bunny!.key },
      cache: 'no-store',
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`Bunny no devolvió «${cleanPath}»: ${await bunnyErrorText(res)}`);
    }
    return await res.text();
  }

  try {
    return await fs.readFile(localFilePath(cleanPath), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export interface StoredObjectInfo {
  name: string;
  size: number;
  isDirectory: boolean;
}

/** List a directory (one level). A missing directory is an empty list. */
export async function listObjects(dirPath: string): Promise<StoredObjectInfo[]> {
  const cleanDir = normalizeObjectPath(dirPath);
  const config = getConfig();

  if (config.driver === 'bunny') {
    const res = await fetch(bunnyUrl(config, cleanDir, true), {
      headers: { AccessKey: config.bunny!.key, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.status === 404) return [];
    if (!res.ok) {
      throw new Error(`Bunny no listó «${cleanDir}/»: ${await bunnyErrorText(res)}`);
    }
    const items = (await res.json()) as Array<{ ObjectName?: string; Length?: number; IsDirectory?: boolean }>;
    return items
      .filter((item) => typeof item.ObjectName === 'string')
      .map((item) => ({
        name: item.ObjectName as string,
        size: Number(item.Length ?? 0),
        isDirectory: Boolean(item.IsDirectory),
      }));
  }

  try {
    const dir = localFilePath(cleanDir);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return await Promise.all(
      entries.map(async (entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        size: entry.isDirectory() ? 0 : (await fs.stat(path.join(dir, entry.name))).size,
      })),
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

/**
 * The object path behind a stored URL, or a bare path as is. URLs under the media base URL
 * map to their path; old Supabase Storage URLs map to the same path (the move to Bunny keeps
 * paths). Any other URL is not ours: null, never touched.
 */
export function objectPathFromUrl(urlOrPath: string): string | null {
  const value = urlOrPath.trim().split(/[?#]/)[0];
  if (!value) return null;

  const markerIdx = value.indexOf(SUPABASE_PUBLIC_MARKER);
  if (markerIdx !== -1) {
    return decodeURIComponent(value.slice(markerIdx + SUPABASE_PUBLIC_MARKER.length)) || null;
  }

  let baseUrl: string;
  try {
    baseUrl = getConfig().baseUrl;
  } catch {
    return null;
  }
  if (value.startsWith(`${baseUrl}/`)) {
    return decodeURIComponent(value.slice(baseUrl.length + 1)) || null;
  }
  // Local driver with a relative base: also accept the absolute form http://host:port/dev-media/…
  if (baseUrl.startsWith('/') && /^https?:\/\//i.test(value)) {
    const pathname = new URL(value).pathname;
    if (pathname.startsWith(`${baseUrl}/`)) {
      return decodeURIComponent(pathname.slice(baseUrl.length + 1)) || null;
    }
  }
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return null;
  return value;
}

/**
 * Something ffprobe can open for a stored URL: the file on disk for the local driver,
 * the absolute URL otherwise. null when it cannot be resolved.
 */
export function probeSourceFor(url: string): string | null {
  try {
    if (getConfig().driver === 'local') {
      const objectPath = objectPathFromUrl(url);
      if (objectPath) return localFilePath(objectPath);
    }
  } catch {
    return null;
  }
  return /^https?:\/\//i.test(url) ? url : null;
}

/**
 * Delete one stored file, given its public URL or path. Best effort: returns false instead
 * of throwing. A file that is already gone counts as deleted. Never deletes directories.
 */
export async function deleteObject(urlOrPath: string | null | undefined): Promise<boolean> {
  if (!urlOrPath) return false;
  try {
    const objectPath = objectPathFromUrl(urlOrPath);
    if (!objectPath) return false;
    const cleanPath = normalizeObjectPath(objectPath);
    const config = getConfig();

    if (config.driver === 'bunny') {
      const res = await fetch(bunnyUrl(config, cleanPath), {
        method: 'DELETE',
        headers: { AccessKey: config.bunny!.key },
      });
      return res.ok || res.status === 404;
    }

    const target = localFilePath(cleanPath);
    const stat = await fs.stat(target).catch(() => null);
    if (!stat) return true;
    if (stat.isDirectory()) return false;
    await fs.rm(target, { force: true });
    return true;
  } catch {
    return false;
  }
}

/** Delete several stored files; returns how many went. */
export async function deleteObjects(urls: Array<string | null | undefined>): Promise<number> {
  const unique = [...new Set(urls.filter((u): u is string => Boolean(u)))];
  const results = await Promise.all(unique.map((u) => deleteObject(u)));
  return results.filter(Boolean).length;
}

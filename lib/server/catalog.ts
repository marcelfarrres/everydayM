import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Catalog, CatalogExercise, MusicTrack } from '@/types/catalog';
import type { ExerciseTalk, MuscleSelection } from '@/types/workout';
import { deleteObject, getObjectText, listObjects, putContent } from '@/lib/server/mediaStore';

/*
 * The catalog (catalog/catalog.json in the media store) is the app's whole database.
 *
 *  - Read through the storage API, never the CDN, so the Studio always sees its last write.
 *  - Written whole by updateCatalog(): reads, applies the change, keeps a dated copy of the
 *    previous file in catalog/backups/ (last 20 kept) and writes the new one.
 *  - One writer (the Studio on Marcel's computer), but concurrent requests are serialised by
 *    an in-process lock kept on globalThis, so it is shared by every route bundle in dev.
 *  - Slow work (FFmpeg, uploads) happens before calling updateCatalog, never inside it.
 *  - Network hiccups are retried inside each storage request (mediaStore → fetchWithRetry), never
 *    by running updateCatalog again: one save = one mutate, one backup name, one catalog body.
 *    A retried PUT repeats the same bytes to the same path (backup or catalog), so it cannot
 *    duplicate a backup or leave half a file (Bunny checks the Checksum header). Reads retry too.
 *    If the catalog PUT still fails, the backup just written stays: it may be the only copy of
 *    the previous version when the PUT did land but its answer was lost.
 *
 * The app reads ${NEXT_PUBLIC_MEDIA_BASE_URL}/catalog/catalog.json through the CDN: the pull
 * zone needs an Edge Rule so this file is not cached (see docs/MUDANZA-BUNNY.md).
 */

export const CATALOG_PATH = 'catalog/catalog.json';
const BACKUP_DIR = 'catalog/backups';
const BACKUPS_TO_KEEP = 20;

export class CatalogNotFoundError extends Error {
  readonly status = 404;
}

export function emptyCatalog(): Catalog {
  return { version: 1, updatedAt: new Date(0).toISOString(), exercises: [], music: [] };
}

export function newId(): string {
  return randomUUID();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return fallback;
}

function strOrNull(value: unknown): string | null {
  const s = str(value);
  return s ? s : null;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTalk(raw: unknown, exerciseId: string): ExerciseTalk | null {
  const t = asRecord(raw);
  if (!t || !str(t.id) || !str(t.video_url)) return null;
  return {
    id: str(t.id),
    exercise_id: exerciseId,
    video_url: str(t.video_url),
    video_lite_url: strOrNull(t.video_lite_url),
    poster_url: strOrNull(t.poster_url),
    duration_seconds: num(t.duration_seconds),
    note: strOrNull(t.note),
  };
}

function normalizeExercise(raw: unknown): CatalogExercise | null {
  const e = asRecord(raw);
  if (!e || !str(e.id)) return null;
  const id = str(e.id);
  const talks = Array.isArray(e.talks)
    ? e.talks.map((t) => normalizeTalk(t, id)).filter((t): t is ExerciseTalk => t !== null)
    : [];
  return {
    id,
    title: str(e.title, 'Sin nombre'),
    type: str(e.type, 'workout'),
    video_url: str(e.video_url),
    video_lite_url: strOrNull(e.video_lite_url),
    poster_url: strOrNull(e.poster_url),
    muscle: str(e.muscle, 'cuerpo_completo'),
    muscles: Array.isArray(e.muscles) ? (e.muscles as MuscleSelection[]) : null,
    difficulty: typeof e.difficulty === 'number' ? e.difficulty : str(e.difficulty, '5'),
    duration_seconds: num(e.duration_seconds, 60),
    equipment: str(e.equipment, 'ninguno'),
    talks,
  };
}

function normalizeTrack(raw: unknown): MusicTrack | null {
  const m = asRecord(raw);
  if (!m || !str(m.id) || !str(m.audio_url)) return null;
  return {
    id: str(m.id),
    title: str(m.title, 'Sin título'),
    artist: strOrNull(m.artist),
    source_url: strOrNull(m.source_url),
    license: strOrNull(m.license),
    audio_url: str(m.audio_url),
    duration_seconds: num(m.duration_seconds),
    enabled: m.enabled !== false,
  };
}

/** Parse catalog JSON defensively: unknown fields dropped, broken entries skipped. */
export function parseCatalog(text: string): Catalog {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('El catálogo (catalog/catalog.json) no es JSON válido. Restaura una copia de catalog/backups/.');
  }
  const root = asRecord(parsed);
  if (!root) throw new Error('El catálogo no tiene el formato esperado.');
  if (root.version !== undefined && root.version !== 1) {
    throw new Error(`Versión de catálogo no soportada: ${String(root.version)}.`);
  }
  return {
    version: 1,
    updatedAt: str(root.updatedAt, new Date(0).toISOString()),
    exercises: Array.isArray(root.exercises)
      ? root.exercises.map(normalizeExercise).filter((e): e is CatalogExercise => e !== null)
      : [],
    music: Array.isArray(root.music)
      ? root.music.map(normalizeTrack).filter((m): m is MusicTrack => m !== null)
      : [],
  };
}

export async function readCatalog(): Promise<Catalog> {
  const text = await getObjectText(CATALOG_PATH);
  return text === null ? emptyCatalog() : parseCatalog(text);
}

// In-process lock shared by every route bundle (Next dev compiles routes separately).
const LOCK_KEY = Symbol.for('everydaym.catalog.lock');
type GlobalWithLock = typeof globalThis & { [LOCK_KEY]?: Promise<unknown> };

function withCatalogLock<T>(task: () => Promise<T>): Promise<T> {
  const holder = globalThis as GlobalWithLock;
  const previous = holder[LOCK_KEY] ?? Promise.resolve();
  const run = previous.then(task, task);
  holder[LOCK_KEY] = run.catch(() => undefined);
  return run;
}

function backupName(now: Date): string {
  // 2026-11-24T10-15-30-123Z: sorts by date as text, safe in any file system.
  return `catalog-${now.toISOString().replace(/[:.]/g, '-')}.json`;
}

async function pruneBackups(): Promise<void> {
  const files = (await listObjects(BACKUP_DIR))
    .filter((f) => !f.isDirectory && /^catalog-.*\.json$/.test(f.name))
    .map((f) => f.name)
    .sort();
  const excess = files.slice(0, Math.max(0, files.length - BACKUPS_TO_KEEP));
  await Promise.all(excess.map((name) => deleteObject(`${BACKUP_DIR}/${name}`)));
}

/**
 * Read-modify-write the catalog under the lock. `mutate` changes the catalog in place and
 * returns a result; throw from it to abort without writing.
 */
export function updateCatalog<T>(mutate: (catalog: Catalog) => T | Promise<T>): Promise<T> {
  return withCatalogLock(async () => {
    const previousText = await getObjectText(CATALOG_PATH);
    const catalog = previousText === null ? emptyCatalog() : parseCatalog(previousText);

    const result = await mutate(catalog);

    // Name and bodies are fixed here, before any request: retries resend exactly these.
    const now = new Date();
    catalog.updatedAt = now.toISOString();
    const nextText = JSON.stringify(catalog);
    if (previousText !== null) {
      await putContent(`${BACKUP_DIR}/${backupName(now)}`, previousText, 'application/json');
    }
    await putContent(CATALOG_PATH, nextText, 'application/json');
    await pruneBackups().catch(() => {});
    return result;
  });
}

export function findExercise(catalog: Catalog, id: string): CatalogExercise {
  const exercise = catalog.exercises.find((e) => e.id === id);
  if (!exercise) throw new CatalogNotFoundError('Ejercicio no encontrado.');
  return exercise;
}

export function findTrack(catalog: Catalog, id: string): MusicTrack {
  const track = catalog.music.find((m) => m.id === id);
  if (!track) throw new CatalogNotFoundError('Pista no encontrada.');
  return track;
}

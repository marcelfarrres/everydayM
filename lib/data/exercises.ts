import type { MusicTrack, RestVideo } from '@/types/catalog';
import type { Exercise, ExerciseTalk } from '@/types/workout';

// The catalogue the Studio publishes next to the media: { version, updatedAt, exercises, music, rests }.
// Only what the app needs is read here; unknown fields are ignored.
const CATALOG_PATH = '/catalog/catalog.json';
// Without NEXT_PUBLIC_MEDIA_BASE_URL, development reads the local media folder (app/dev-media).
const DEV_MEDIA_BASE = '/dev-media';
// One download serves everyone who asks within this window (the composer, the player's music,
// "Repetir"…); after it, the next call reads the file again.
const FRESH_MS = 30_000;

/** What the public app reads from the catalogue. */
export interface PublicCatalog {
  exercises: Exercise[];
  music: MusicTrack[]; // only enabled tracks
  rests: RestVideo[]; // only enabled rest videos ([] in catalogs without them)
}

type Row = Record<string, unknown>;

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function toTalk(value: unknown): ExerciseTalk | null {
  if (!isRow(value)) return null;
  const videoUrl = text(value.video_url);
  if (value.id == null || value.exercise_id == null || !videoUrl) return null;
  const duration = Number(value.duration_seconds);
  return {
    id: String(value.id),
    exercise_id: String(value.exercise_id),
    video_url: videoUrl,
    video_lite_url: text(value.video_lite_url),
    poster_url: text(value.poster_url),
    duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : 0,
    note: typeof value.note === 'string' ? value.note : null,
  };
}

/** One catalogue entry, or null when it lacks what a routine cannot do without. */
function toExercise(value: unknown): Exercise | null {
  if (!isRow(value)) return null;
  const title = text(value.title);
  const videoUrl = text(value.video_url);
  if (value.id == null || !title || !videoUrl) return null;
  const talks = Array.isArray(value.talks)
    ? value.talks.map(toTalk).filter((t): t is ExerciseTalk => t !== null)
    : [];
  return {
    ...(value as unknown as Exercise),
    id: String(value.id),
    title,
    video_url: videoUrl,
    talks,
  };
}

/** One playlist track, or null when it is switched off or has no file. */
function toTrack(value: unknown): MusicTrack | null {
  if (!isRow(value) || value.id == null || value.enabled === false) return null;
  const audioUrl = text(value.audio_url);
  if (!audioUrl) return null;
  const duration = Number(value.duration_seconds);
  return {
    id: String(value.id),
    title: text(value.title) ?? '',
    artist: text(value.artist),
    source_url: text(value.source_url),
    license: text(value.license),
    audio_url: audioUrl,
    duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : 0,
    enabled: true,
  };
}

/** One rest video, or null when it is switched off or has no file. */
function toRest(value: unknown): RestVideo | null {
  if (!isRow(value) || value.id == null || value.enabled === false) return null;
  const videoUrl = text(value.video_url);
  if (!videoUrl) return null;
  const duration = Number(value.duration_seconds);
  return {
    id: String(value.id),
    title: text(value.title) ?? '',
    video_url: videoUrl,
    video_lite_url: text(value.video_lite_url),
    poster_url: text(value.poster_url),
    duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : 0,
    enabled: true,
  };
}

/** Parses a catalogue body; broken entries are dropped instead of failing the whole list. */
export function exercisesFromCatalog(body: unknown): Exercise[] {
  if (!isRow(body) || !Array.isArray(body.exercises)) {
    throw new Error('El catálogo de ejercicios no tiene el formato esperado.');
  }
  return body.exercises.map(toExercise).filter((e): e is Exercise => e !== null);
}

/** The playlist: enabled tracks with a file. A catalogue without music is simply silent. */
export function musicFromCatalog(body: unknown): MusicTrack[] {
  if (!isRow(body) || !Array.isArray(body.music)) return [];
  return body.music.map(toTrack).filter((t): t is MusicTrack => t !== null);
}

/** The rest videos: enabled ones with a file. A catalogue written before they existed has none. */
export function restsFromCatalog(body: unknown): RestVideo[] {
  if (!isRow(body) || !Array.isArray(body.rests)) return [];
  return body.rests.map(toRest).filter((r): r is RestVideo => r !== null);
}

/** Where the media (and the catalogue) live, without a trailing slash. */
export function mediaBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_MEDIA_BASE_URL?.trim().replace(/\/+$/, '');
  if (base) return base;
  if (process.env.NODE_ENV !== 'production') return DEV_MEDIA_BASE;
  throw new Error('Falta NEXT_PUBLIC_MEDIA_BASE_URL: no se sabe dónde está el catálogo de ejercicios.');
}

async function downloadCatalog(): Promise<PublicCatalog> {
  const base = mediaBaseUrl();

  let response: Response;
  try {
    // Always the current file: the Studio rewrites it when a video or a track is added.
    response = await fetch(`${base}${CATALOG_PATH}`, { cache: 'no-store' });
  } catch {
    throw new Error('No se ha podido descargar el catálogo de ejercicios. Revisa la conexión.');
  }
  if (!response.ok) {
    throw new Error(`No se ha podido descargar el catálogo de ejercicios (error ${response.status}).`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error('El catálogo de ejercicios no es un JSON válido.');
  }
  return { exercises: exercisesFromCatalog(body), music: musicFromCatalog(body), rests: restsFromCatalog(body) };
}

let recent: { at: number; promise: Promise<PublicCatalog> } | null = null;

/** The catalogue: one request shared by every caller within a few seconds; a failure is not kept. */
export function fetchCatalog(): Promise<PublicCatalog> {
  const now = Date.now();
  if (recent && now - recent.at < FRESH_MS) return recent.promise;
  const promise = downloadCatalog();
  const entry = { at: now, promise };
  recent = entry;
  promise.catch(() => {
    if (recent === entry) recent = null; // let the next attempt retry
  });
  return promise;
}

/** Forget the shared download (tests, or to force a fresh read). */
export function clearCatalogCache(): void {
  recent = null;
}

/** Every exercise with its talks, read from the catalogue on the media host. */
export async function fetchExercises(): Promise<Exercise[]> {
  return (await fetchCatalog()).exercises;
}

/** The enabled music tracks, from the same catalogue download. */
export async function fetchMusic(): Promise<MusicTrack[]> {
  return (await fetchCatalog()).music;
}

/** The enabled rest videos, from the same catalogue download. */
export async function fetchRests(): Promise<RestVideo[]> {
  return (await fetchCatalog()).rests;
}

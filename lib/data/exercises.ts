import type { Exercise, ExerciseTalk } from '@/types/workout';

// The catalogue the Studio publishes next to the media: { version, updatedAt, exercises, music }.
// Only what the routine needs is read here; unknown fields are ignored.
const CATALOG_PATH = '/catalog/catalog.json';

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

/** Parses a catalogue body; broken entries are dropped instead of failing the whole list. */
export function exercisesFromCatalog(body: unknown): Exercise[] {
  if (!isRow(body) || !Array.isArray(body.exercises)) {
    throw new Error('El catálogo de ejercicios no tiene el formato esperado.');
  }
  return body.exercises.map(toExercise).filter((e): e is Exercise => e !== null);
}

/** Every exercise with its talks, read from the catalogue on the media host. */
export async function fetchExercises(): Promise<Exercise[]> {
  const base = process.env.NEXT_PUBLIC_MEDIA_BASE_URL?.trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('Falta NEXT_PUBLIC_MEDIA_BASE_URL: no se sabe dónde está el catálogo de ejercicios.');
  }

  let response: Response;
  try {
    // Revalidate with the CDN each time: the Studio rewrites the file when a video is added.
    response = await fetch(`${base}${CATALOG_PATH}`, { cache: 'no-cache' });
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
  return exercisesFromCatalog(body);
}

import 'server-only';
import type { MuscleId, MuscleRole, MuscleSelection } from '@/types/workout';

export type StudioClipType = 'workout' | 'warmup' | 'intro' | 'filler';

const VALID_CLIP_TYPES = new Set<StudioClipType>([
  'workout',
  'warmup',
  'intro',
  'filler',
]);

const VALID_MUSCLE_IDS = new Set<MuscleId>([
  'pectorales',
  'hombros',
  'biceps',
  'antebrazos',
  'abdominales',
  'oblicuos',
  'cuadriceps',
  'aductores',
  'gemelos',
  'trapecio',
  'dorsales',
  'triceps',
  'lumbares',
  'gluteos',
  'isquiotibiales',
]);

const LEGACY_MUSCLE_BY_ID: Record<MuscleId, string> = {
  pectorales: 'pecho',
  hombros: 'brazos',
  biceps: 'brazos',
  antebrazos: 'brazos',
  abdominales: 'core',
  oblicuos: 'core',
  cuadriceps: 'piernas',
  aductores: 'piernas',
  gemelos: 'piernas',
  trapecio: 'espalda',
  dorsales: 'espalda',
  triceps: 'brazos',
  lumbares: 'espalda',
  gluteos: 'piernas',
  isquiotibiales: 'piernas',
};

export interface ValidatedExerciseMetadata {
  title: string;
  type: StudioClipType;
  difficulty: number;
  muscle: string;
  muscles: MuscleSelection[];
  equipment: string;
}

export function validateExerciseMetadata(raw: unknown): ValidatedExerciseMetadata {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Metadatos de ejercicio inválidos.');
  }

  const obj = raw as Record<string, unknown>;
  const title = typeof obj.title === 'string' ? obj.title.trim() : '';
  if (!title) {
    throw new Error('El título del ejercicio es obligatorio.');
  }

  const rawType = typeof obj.type === 'string' ? obj.type.trim() : 'workout';
  if (!VALID_CLIP_TYPES.has(rawType as StudioClipType)) {
    throw new Error(`Tipo de clip no válido: ${rawType}`);
  }
  const type = rawType as StudioClipType;

  const rawDifficulty = Number(obj.difficulty ?? 5);
  const difficulty = Number.isFinite(rawDifficulty)
    ? Math.min(10, Math.max(1, Math.round(rawDifficulty)))
    : 5;

  const equipment =
    typeof obj.equipment === 'string' && obj.equipment.trim()
      ? obj.equipment.trim()
      : 'ninguno';

  const muscles: MuscleSelection[] = [];
  if (Array.isArray(obj.muscles)) {
    for (const item of obj.muscles) {
      if (typeof item === 'object' && item !== null) {
        const entry = item as Record<string, unknown>;
        const id = entry.id as MuscleId;
        const role = entry.role as MuscleRole;
        if (
          VALID_MUSCLE_IDS.has(id) &&
          (role === 'primary' || role === 'secondary')
        ) {
          muscles.push({ id, role });
        }
      }
    }
  }

  const primaryMuscle = muscles.find((m) => m.role === 'primary');
  if (type === 'workout' && !primaryMuscle) {
    throw new Error(
      'Para un clip de entreno (workout) debes marcar al menos un músculo principal.',
    );
  }

  const normalizedMuscles = type === 'workout' ? muscles : [];
  const muscle =
    type === 'workout' && primaryMuscle
      ? LEGACY_MUSCLE_BY_ID[primaryMuscle.id]
      : 'cuerpo_completo';

  return {
    title,
    type,
    difficulty,
    muscle,
    muscles: normalizedMuscles,
    equipment,
  };
}

/** Row ids from the URL (uuid or bigint as text): reject anything else before querying. */
export function validateRowId(raw: unknown, label = 'el registro'): string {
  const id = typeof raw === 'string' ? raw.trim() : '';
  if (!id || id.length > 64 || !/^[A-Za-z0-9-]+$/.test(id)) {
    throw new Error(`Identificador no válido para ${label}.`);
  }
  return id;
}

function optionalText(
  obj: Record<string, unknown>,
  key: string,
  label: string,
  maxLength: number,
): string | null {
  const value = obj[key];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw new Error(`${label} debe ser texto.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${label} admite como máximo ${maxLength} caracteres.`);
  }
  return trimmed || null;
}

function optionalHttpUrl(obj: Record<string, unknown>, key: string, label: string): string | null {
  const text = optionalText(obj, key, label, 500);
  if (!text) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(`${label} no es una dirección web válida.`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${label} debe empezar por https://.`);
  }
  return parsed.toString();
}

function asObject(raw: unknown, what: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`Datos de ${what} inválidos.`);
  }
  return raw as Record<string, unknown>;
}

export interface ValidatedTalkMetadata {
  note: string | null;
}

/** A vídeo hablado only carries an optional short note (what it is about). */
export function validateTalkMetadata(raw: unknown): ValidatedTalkMetadata {
  if (raw === undefined || raw === null) return { note: null };
  const obj = asObject(raw, 'vídeo hablado');
  return { note: optionalText(obj, 'note', 'La nota', 200) };
}

export interface ValidatedMusicMetadata {
  title: string;
  artist: string | null;
  source_url: string | null;
  license: string | null;
}

export function validateMusicMetadata(raw: unknown): ValidatedMusicMetadata {
  const obj = asObject(raw, 'la pista');
  const title = optionalText(obj, 'title', 'El título', 120);
  if (!title) {
    throw new Error('El título de la pista es obligatorio.');
  }
  return {
    title,
    artist: optionalText(obj, 'artist', 'El artista', 120),
    source_url: optionalHttpUrl(obj, 'source_url', 'La página de origen'),
    license: optionalText(obj, 'license', 'La licencia', 120),
  };
}

export type ValidatedMusicPatch = Partial<ValidatedMusicMetadata> & { enabled?: boolean };

/** Partial update: only the fields present are changed; at least one is required. */
export function validateMusicPatch(raw: unknown): ValidatedMusicPatch {
  const obj = asObject(raw, 'la pista');
  const patch: ValidatedMusicPatch = {};

  if ('title' in obj) {
    const title = optionalText(obj, 'title', 'El título', 120);
    if (!title) throw new Error('El título de la pista es obligatorio.');
    patch.title = title;
  }
  if ('artist' in obj) patch.artist = optionalText(obj, 'artist', 'El artista', 120);
  if ('source_url' in obj) patch.source_url = optionalHttpUrl(obj, 'source_url', 'La página de origen');
  if ('license' in obj) patch.license = optionalText(obj, 'license', 'La licencia', 120);
  if ('enabled' in obj) {
    if (typeof obj.enabled !== 'boolean') {
      throw new Error('«enabled» debe ser verdadero o falso.');
    }
    patch.enabled = obj.enabled;
  }

  if (Object.keys(patch).length === 0) {
    throw new Error('No hay ningún cambio que guardar.');
  }
  return patch;
}

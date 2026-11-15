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

export function extractStorageObjectPath(videoUrl: string): string | null {
  if (!videoUrl) return null;
  const marker = '/storage/v1/object/public/workout-videos/';
  const idx = videoUrl.indexOf(marker);
  if (idx === -1) return null;
  const objectPath = decodeURIComponent(
    videoUrl.slice(idx + marker.length).split('?')[0],
  );
  return objectPath || null;
}

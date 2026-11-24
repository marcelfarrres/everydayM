import type {
  BlockVariation,
  MuscleId,
  MuscleRole,
  RoutineIntent,
  RoutineIntentMuscle,
} from '@/types/workout';

// Defined once in types/workout.ts; re-exported so lib/intent keeps its own entry point.
export type { BlockVariation, MuscleId, MuscleRole, RoutineIntent, RoutineIntentMuscle };

export type RoutineIntentSource = 'gemini' | 'keywords';

export interface RoutineIntentResponse {
  intent: RoutineIntent;
  source: RoutineIntentSource;
}

export const ALL_MUSCLE_IDS: readonly MuscleId[] = [
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
] as const;

export const MUSCLE_LABELS_ES: Record<MuscleId, string> = {
  pectorales: 'pectorales',
  hombros: 'hombros',
  biceps: 'bíceps',
  antebrazos: 'antebrazos',
  abdominales: 'abdominales',
  oblicuos: 'oblicuos',
  cuadriceps: 'cuádriceps',
  aductores: 'aductores',
  gemelos: 'gemelos',
  trapecio: 'trapecio',
  dorsales: 'dorsales',
  triceps: 'tríceps',
  lumbares: 'lumbares',
  gluteos: 'glúteos',
  isquiotibiales: 'isquiotibiales',
};

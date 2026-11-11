import type { MuscleId, MuscleRole } from '@/types/workout';

export type { MuscleId, MuscleRole };

export interface RoutineIntentMuscle {
  id: MuscleId;
  role: MuscleRole;
  weight: number; // 0..1
}

export interface RoutineIntent {
  muscles: RoutineIntentMuscle[]; // weight 0..1
  difficulty: number; // 1-10
  targetMinutes: number | null; // null => use manual rounds/exercises
  slotSeconds: number | null; // null => engine default by difficulty (40-60)
  includeWarmup: boolean;
  focusLabel: string;
}

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

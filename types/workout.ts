export type MuscleRole = 'secondary' | 'primary';

export type MuscleId =
  | 'pectorales'
  | 'hombros'
  | 'biceps'
  | 'antebrazos'
  | 'abdominales'
  | 'oblicuos'
  | 'cuadriceps'
  | 'aductores'
  | 'gemelos'
  | 'trapecio'
  | 'dorsales'
  | 'triceps'
  | 'lumbares'
  | 'gluteos'
  | 'isquiotibiales';

export interface MuscleSelection {
  id: MuscleId;
  role: MuscleRole;
}

export interface MuscleRegion {
  ids: MuscleId[];
  label: string;
  d: string;
}

export type ExerciseType = 'workout' | 'warmup' | 'intro' | 'filler';

/** Marcel talking to camera about an exercise (~15 s, with voice). Row of public.exercise_talks. */
export interface ExerciseTalk {
  id: string;
  exercise_id: string;
  video_url: string; // original
  video_lite_url: string | null; // lighter copy the app plays
  poster_url: string | null; // still from the middle of the clip
  duration_seconds: number;
  note: string | null;
}

export interface Exercise {
  id: string;
  title: string;
  type: ExerciseType | string; // legacy rows may hold other strings
  video_url: string; // original (1080 wide, used by exports)
  video_lite_url?: string | null; // lighter copy the app plays; null until generated
  poster_url?: string | null; // still from the middle of the clip
  muscle: string;
  muscles?: MuscleSelection[] | null;
  difficulty: string | number;
  duration_seconds: number; // REAL clip length (studio now stores ffprobe value; legacy rows say 60)
  equipment?: string;
  talks?: ExerciseTalk[]; // only when loaded alongside the exercise
}

export interface RoutineMeta {
  totalSeconds: number; // whole routine incl. rests/outro
  slotSeconds: number; // standard exercise slot (e.g. 50)
  rounds: number;
  exercisesPerRound: number;
  difficulty: number; // 1-10
  muscles: MuscleSelection[]; // targeted
  blocks: Exercise[][]; // one list per block (round), in play order; see uniqueExercises()
  warmups: Exercise[];
  focusLabel: string; // e.g. "Full body · brazos"
  background?: Exercise; // filler video (type 'filler'; fallback: any clip)
}

/** Short: between two exercises of a block. Long: before a block starts. */
export type RestKind = 'short' | 'long';

// No intro or plan step: "Empezar" goes straight to the warm-up.
export type RoutineItem =
  | { kind: 'warmup'; exercise: Exercise }
  | {
      kind: 'workout';
      exercise: Exercise;
      round: number;
      totalRounds: number;
      exerciseIndexInRound: number;
      totalExercisesPerRound: number;
    }
  | {
      kind: 'rest';
      duration: number;
      prepSeconds: number;
      nextExercise: Exercise;
      nextRound: number;
      totalRounds: number;
      isEndOfRound: boolean;
      restKind: RestKind; // 'long' before the first exercise of a block
      talks: ExerciseTalk[]; // talks to play in a long rest (0-2); [] in short rests
    }
  | {
      kind: 'outro';
      duration: number;
      meta: RoutineMeta;
      exercise: Exercise;
    }; // end screen, replaces alert()

export interface RoutineIntentMuscle {
  id: MuscleId;
  role: MuscleRole;
  weight: number; // 0..1
}

/** How much the blocks differ: the same circuit, a few swaps, or all different. */
export type BlockVariation = 'same' | 'some' | 'all';

// The one definition: lib/intent/types.ts re-exports it.
export interface RoutineIntent {
  muscles: RoutineIntentMuscle[]; // weight 0..1
  difficulty: number; // 1-10
  targetMinutes: number | null; // null => use manual rounds/exercises
  slotSeconds: number | null; // null => engine default by difficulty (40-60)
  includeWarmup: boolean;
  focusLabel: string;
  rounds?: number | null; // blocks said by the user ("3 bloques"); null => the engine picks
  exercisesPerRound?: number | null; // series per block said by the user ("de 4 series"); null => the engine picks
  variation?: BlockVariation; // undefined => 'some'
}

/** Extra context for buildRoutine that does not come from the user's request. */
export interface BuildRoutineOptions {
  recentExerciseIds?: readonly string[]; // used in the last routines: penalised, not forbidden
}

export interface TimelineSegment {
  index: number;
  kind: RoutineItem['kind'];
  start: number;
  duration: number;
  label: string;
}

export interface WorkoutFilters {
  difficulty: number;
  muscles: MuscleSelection[];
  exercisesPerRound: number;
  totalRounds: number;
  includeWarmup: boolean;
}

export interface PlaylistTrack {
  id: number;
  label: string;
  url: string;
}

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

export interface Exercise {
  id: string;
  title: string;
  type: ExerciseType | string; // legacy rows may hold other strings
  video_url: string;
  muscle: string;
  muscles?: MuscleSelection[] | null;
  difficulty: string | number;
  duration_seconds: number; // REAL clip length (studio now stores ffprobe value; legacy rows say 60)
  equipment?: string;
}

export interface RoutineMeta {
  totalSeconds: number; // whole routine incl. intro/summary/rests/outro
  slotSeconds: number; // standard exercise slot (e.g. 50)
  rounds: number;
  exercisesPerRound: number;
  difficulty: number; // 1-10
  muscles: MuscleSelection[]; // targeted
  circuit: Exercise[]; // unique exercises of one round, in order
  warmups: Exercise[];
  focusLabel: string; // e.g. "Full body · brazos"
  background?: Exercise; // filler video (type 'filler'; fallback: any clip)
}

export type RoutineItem =
  | { kind: 'intro'; exercise: Exercise } // max 10 s, logo
  | {
      kind: 'summary';
      duration: number;
      meta: RoutineMeta;
      exercise: Exercise;
    } // ~8 s animated overview over meta.background
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

export interface RoutineIntent {
  muscles: RoutineIntentMuscle[]; // weight 0..1
  difficulty: number; // 1-10
  targetMinutes: number | null; // null => use manual rounds/exercises
  slotSeconds: number | null; // null => engine default by difficulty (40-60)
  includeWarmup: boolean;
  focusLabel: string;
  rounds?: number | null; // said by the user ("3 rondas"); null => the engine picks
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

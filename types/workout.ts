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

export interface Exercise {
  id: string;
  title: string;
  type: string;
  video_url: string;
  muscle: string;
  muscles?: MuscleSelection[] | null;
  difficulty: string | number;
  duration_seconds: number;
  equipment?: string;
}

export type RoutineItem =
  | { kind: 'intro'; exercise: Exercise }
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
      nextExercise: Exercise;
      nextRound: number;
      totalRounds: number;
      isEndOfRound: boolean;
    };

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

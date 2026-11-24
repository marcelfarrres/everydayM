import type { Exercise, ExerciseTalk, MuscleId, RoutineIntent, RoutineItem } from '@/types/workout';

/** Small seeded generator (mulberry32) so every test run draws the same numbers. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function talk(exerciseId: string, n: number, seconds = 15): ExerciseTalk {
  return {
    id: `${exerciseId}-talk-${n}`,
    exercise_id: exerciseId,
    video_url: `${exerciseId}-talk-${n}.mp4`,
    video_lite_url: null,
    poster_url: null,
    duration_seconds: seconds,
    note: null,
  };
}

export function exercise(
  id: string,
  primary: MuscleId[],
  options: { type?: string; seconds?: number; talks?: number[] } = {},
): Exercise {
  return {
    id,
    title: id,
    type: options.type ?? 'workout',
    video_url: `${id}.mp4`,
    muscle: '',
    muscles: primary.map((m) => ({ id: m, role: 'primary' as const })),
    difficulty: 5,
    duration_seconds: options.seconds ?? 45,
    talks: (options.talks ?? []).map((seconds, n) => talk(id, n, seconds)),
  };
}

const range = (prefix: string, count: number, primary: MuscleId[], talks: number[] = []) =>
  Array.from({ length: count }, (_, i) => exercise(`${prefix}${i + 1}`, primary, { talks }));

/** A library with room to vary: 10 glute, 6 quad and 4 chest exercises, 4 warm-ups, 1 filler. */
export function library(options: { talks?: number[] } = {}): Exercise[] {
  return [
    ...Array.from({ length: 4 }, (_, i) => exercise(`w${i + 1}`, [], { type: 'warmup', seconds: 40 })),
    exercise('filler', [], { type: 'filler' }),
    ...range('g', 10, ['gluteos'], options.talks),
    ...range('q', 6, ['cuadriceps'], options.talks),
    ...range('p', 4, ['pectorales'], options.talks),
  ];
}

export function gluteIntent(over: Partial<RoutineIntent> = {}): RoutineIntent {
  return {
    muscles: [{ id: 'gluteos', role: 'primary', weight: 1 }],
    difficulty: 5,
    targetMinutes: null,
    slotSeconds: null,
    includeWarmup: true,
    focusLabel: 'Glúteos',
    ...over,
  };
}

export type RestItem = Extract<RoutineItem, { kind: 'rest' }>;

export function rests(queue: RoutineItem[]): RestItem[] {
  return queue.filter((item): item is RestItem => item.kind === 'rest');
}

export function ids(list: readonly Exercise[]): string[] {
  return list.map((item) => item.id);
}

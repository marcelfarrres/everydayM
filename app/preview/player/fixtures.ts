import type { Exercise, ExerciseTalk, MuscleSelection, RoutineItem } from '@/types/workout';

/*
 * Development fixture for /preview/player: a handful of exercises whose clips all point at the
 * app's own /marcel-ready.mp4, so the player can be seen with no database.
 */

const CLIP = '/marcel-ready.mp4';
const POSTER = '/marcel-ready-poster.webp';

function talk(id: string, exerciseId: string, note: string): ExerciseTalk {
  return {
    id,
    exercise_id: exerciseId,
    video_url: CLIP,
    video_lite_url: null,
    poster_url: POSTER,
    duration_seconds: 5,
    note,
  };
}

function exercise(
  id: string,
  title: string,
  muscles: MuscleSelection[],
  options: Partial<Exercise> = {},
): Exercise {
  return {
    id,
    title,
    type: 'workout',
    video_url: CLIP,
    video_lite_url: null,
    poster_url: POSTER,
    muscle: muscles[0]?.id ?? 'full body',
    muscles,
    difficulty: 5,
    duration_seconds: 5,
    ...options,
  };
}

export const FIXTURE_TALKS: ExerciseTalk[] = [
  talk('talk-sentadilla', 'fx-sentadilla', 'Técnica: rodillas hacia fuera'),
  talk('talk-flexion', 'fx-flexion', 'Curiosidad: por qué cuesta tanto la última'),
];

export const FIXTURE_EXERCISES: Exercise[] = [
  exercise('fx-warm-1', 'Movilidad de cadera', [{ id: 'gluteos', role: 'primary' }], { type: 'warmup' }),
  exercise('fx-warm-2', 'Círculos de hombro', [{ id: 'hombros', role: 'primary' }], { type: 'warmup' }),
  exercise('fx-sentadilla', 'Sentadilla', [{ id: 'cuadriceps', role: 'primary' }, { id: 'gluteos', role: 'secondary' }], {
    talks: [FIXTURE_TALKS[0]],
  }),
  exercise('fx-flexion', 'Flexiones', [{ id: 'pectorales', role: 'primary' }, { id: 'triceps', role: 'secondary' }], {
    talks: [FIXTURE_TALKS[1]],
  }),
  exercise('fx-remo', 'Remo con mancuerna', [{ id: 'dorsales', role: 'primary' }, { id: 'biceps', role: 'secondary' }]),
  exercise('fx-zancada', 'Zancada alterna', [{ id: 'cuadriceps', role: 'primary' }, { id: 'gluteos', role: 'primary' }]),
  exercise('fx-plancha', 'Plancha con toque de hombro', [{ id: 'abdominales', role: 'primary' }, { id: 'hombros', role: 'secondary' }]),
  exercise('fx-puente', 'Puente de glúteo', [{ id: 'gluteos', role: 'primary' }, { id: 'isquiotibiales', role: 'secondary' }]),
];

export const FIXTURE_MUSCLES: MuscleSelection[] = [
  { id: 'cuadriceps', role: 'primary' },
  { id: 'pectorales', role: 'primary' },
  { id: 'dorsales', role: 'primary' },
  { id: 'gluteos', role: 'secondary' },
];

/**
 * Until the engine fills `talks` itself, the first long rest borrows the fixture talks, so both
 * "long rest with talks" and "long rest without talks" can be seen. If the engine already filled
 * any rest, its choice is kept.
 */
export function withFixtureTalks(queue: RoutineItem[]): RoutineItem[] {
  if (queue.some((item) => item.kind === 'rest' && item.talks.length > 0)) return queue;
  const first = queue.findIndex((item) => item.kind === 'rest' && item.restKind === 'long');
  return queue.map((item, index) => (index === first && item.kind === 'rest' ? { ...item, talks: FIXTURE_TALKS } : item));
}

/** A small seeded random generator, so the same routine is built on every load. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

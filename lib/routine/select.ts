import type { Exercise, MuscleId } from '@/types/workout';

export interface ScoredExercise {
  exercise: Exercise;
  score: number; // how well it fits the request (muscles, difficulty)
  weight: number; // what the draw uses: the score, lowered if used in the last routines
  musclePriority: number; // 0 hits a primary target, 1 hits any target, 2 hits none
  primaryIds: readonly MuscleId[]; // the exercise's own primary muscles
}

// Recently used exercises keep a fifth of their chance: they still come up when nothing else fits.
export const RECENT_PENALTY = 0.2;
// Clearly worse fits stay out of the draw while better ones are left, so randomness never costs quality.
const GOOD_SHARE = 0.4;

/**
 * A weighted random pick among the good candidates of `pool` that are not excluded.
 * Random on purpose: asking for the same thing twice should not give the same routine.
 */
export function pickWeighted(
  pool: readonly ScoredExercise[],
  excludedIds: ReadonlySet<string>,
  rng: () => number,
): Exercise | null {
  const available = pool.filter((item) => !excludedIds.has(item.exercise.id));
  if (available.length === 0) return null;

  const best = Math.max(...available.map((item) => item.score));
  const good = available.filter((item) => item.score >= best * GOOD_SHARE);
  const totalWeight = good.reduce((acc, item) => acc + Math.max(0, item.weight), 0);
  if (totalWeight <= 0) {
    return good[Math.min(good.length - 1, Math.floor(rng() * good.length))].exercise;
  }

  let randomVal = rng() * totalWeight;
  for (const item of good) {
    const weight = Math.max(0, item.weight);
    if (randomVal < weight) return item.exercise;
    randomVal -= weight;
  }
  return good[good.length - 1].exercise;
}

/** True when both exercises have a primary muscle in common (a fair swap for each other). */
export function sharesPrimaryMuscle(a: ScoredExercise, b: ScoredExercise): boolean {
  return a.primaryIds.some((id) => b.primaryIds.includes(id));
}

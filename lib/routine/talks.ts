import type { Exercise, ExerciseTalk } from '@/types/workout';

function talkDuration(talk: ExerciseTalk): number {
  const seconds = Number(talk.duration_seconds);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/** Whole seconds the talks take back to back. */
export function talksSeconds(talks: readonly ExerciseTalk[]): number {
  return Math.ceil(talks.reduce((acc, talk) => acc + talkDuration(talk), 0));
}

function talksOf(exercises: readonly Exercise[]): ExerciseTalk[] {
  const seen = new Set<string>();
  const out: ExerciseTalk[] = [];
  for (const exercise of exercises) {
    for (const talk of Array.isArray(exercise.talks) ? exercise.talks : []) {
      if (talk && talk.id && !seen.has(talk.id)) {
        seen.add(talk.id);
        out.push(talk);
      }
    }
  }
  return out;
}

/**
 * Talks for the long rest before `block`: 1 or 2 at random from its exercises' talks, never one
 * already in `usedTalkIds` (which it updates: a talk plays at most once per routine).
 */
export function pickTalks(
  block: readonly Exercise[],
  usedTalkIds: Set<string>,
  rng: () => number,
): ExerciseTalk[] {
  const pool = talksOf(block).filter((talk) => !usedTalkIds.has(talk.id));
  if (pool.length === 0) return [];

  const count = pool.length >= 2 && rng() < 0.5 ? 2 : 1;
  const picked: ExerciseTalk[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.min(pool.length - 1, Math.floor(rng() * pool.length));
    const [talk] = pool.splice(index, 1);
    picked.push(talk);
    usedTalkIds.add(talk.id);
  }
  return picked;
}

/** What a long rest's talks are likely to add up to, for duration estimates before blocks exist. */
export function expectedTalkSeconds(exercises: readonly Exercise[]): number {
  const talks = talksOf(exercises);
  if (talks.length === 0) return 0;
  const average = talksSeconds(talks) / talks.length;
  // Half the long rests get one talk, half get two.
  return talks.length >= 2 ? average * 1.5 : average;
}

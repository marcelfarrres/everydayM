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
 * The talk for the long rest before `block`: one at random from its own exercises' talks, never one
 * already in `usedTalkIds` (which it updates: a talk plays at most once per routine). None if the
 * block has no unused talk. (One per long rest since 26-11-2026: then the rest video, then the last
 * seconds with the next exercise.)
 */
export function pickTalks(
  block: readonly Exercise[],
  usedTalkIds: Set<string>,
  rng: () => number,
): ExerciseTalk[] {
  const pool = talksOf(block).filter((talk) => !usedTalkIds.has(talk.id));
  if (pool.length === 0) return [];
  const talk = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  usedTalkIds.add(talk.id);
  return [talk];
}

/** What a long rest's talk is likely to last, for duration estimates before blocks exist (one talk per long rest). */
export function expectedTalkSeconds(exercises: readonly Exercise[]): number {
  const talks = talksOf(exercises);
  return talks.length === 0 ? 0 : talksSeconds(talks) / talks.length;
}

import type { Exercise, RoutineItem } from '@/types/workout';

export const OUTRO_DURATION_SECONDS = 8;
export const DEFAULT_CLIP_SECONDS = 60;
// A short clip leaves its slot unfilled; the gap goes to the next rest, but never more than this,
// or rests drag on (a 32 s clip in a 50 s slot used to add 18 s of rest).
export const MAX_PREP_SECONDS = 8;

export function getClipDuration(
  exercise: Exercise | undefined,
  fallbackSeconds: number = DEFAULT_CLIP_SECONDS,
): number {
  if (!exercise) return fallbackSeconds;
  const raw = Number(exercise.duration_seconds);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.max(1, Math.round(raw));
  }
  return fallbackSeconds;
}

export function getRestDuration(difficulty: number): number {
  const clamped = Math.min(10, Math.max(1, Math.round(difficulty)));
  return 20 - Math.round(((clamped - 1) * 10) / 9);
}

// A long rest (before a block) gets this much more than a short one, before any talks stretch it.
export const LONG_REST_EXTRA_SECONDS = 10;

export function getLongRestBase(restSeconds: number): number {
  return restSeconds + LONG_REST_EXTRA_SECONDS;
}

/**
 * ms from the start of a rest until the clouds open. A long rest's talks start speaking then,
 * not under the clouds. CloudTransition times its opening from this same constant, so the
 * engine's long-rest durations and the animation cannot drift apart. (3.82 s since 24-11-2026:
 * 1.3 s longer than before, so the words of the clouds can be read for 2.5 s.)
 */
export const TALK_LEAD_MS = 3820;

/** Whole seconds a long rest needs so `talkSeconds` of talks finish: the lead time plus the talks. */
export function getTalkRestSeconds(talkSeconds: number): number {
  return talkSeconds > 0 ? Math.ceil(talkSeconds + TALK_LEAD_MS / 1000) : 0;
}

export function getDefaultSlotSeconds(difficulty: number): number {
  const clamped = Math.min(10, Math.max(1, Math.round(difficulty)));
  const raw = 40 + ((clamped - 1) * 20) / 9;
  return Math.round(raw / 5) * 5;
}

export function getItemDuration(
  item: RoutineItem | undefined,
  clipSecondsFallback: number = DEFAULT_CLIP_SECONDS,
): number {
  if (!item) return clipSecondsFallback;

  switch (item.kind) {
    case 'rest':
    case 'outro':
      return Math.max(1, Math.round(item.duration));
    case 'warmup':
    case 'workout':
      return getClipDuration(item.exercise, clipSecondsFallback);
  }
}

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

import type { Exercise, RoutineItem } from '@/types/workout';

export const INTRO_DURATION_SECONDS = 10;
export const SUMMARY_DURATION_SECONDS = 8;
export const OUTRO_DURATION_SECONDS = 8;
export const DEFAULT_CLIP_SECONDS = 60;

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
    case 'intro':
      return Math.min(
        INTRO_DURATION_SECONDS,
        getClipDuration(item.exercise, INTRO_DURATION_SECONDS),
      );
    case 'summary':
    case 'rest':
    case 'outro':
      return Math.max(1, Math.round(item.duration));
    case 'warmup':
    case 'workout':
      return getClipDuration(item.exercise, clipSecondsFallback);
  }
}

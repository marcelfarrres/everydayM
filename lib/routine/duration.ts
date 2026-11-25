import type { Exercise, RoutineItem } from '@/types/workout';

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

// A long rest (before a block) gets this much more than a short one, before any talks stretch it.
export const LONG_REST_EXTRA_SECONDS = 10;

export function getLongRestBase(restSeconds: number): number {
  return restSeconds + LONG_REST_EXTRA_SECONDS;
}

/**
 * ms from the start of a rest until the clouds open. A long rest's talks start speaking then,
 * not under the clouds. CloudTransition times its opening from this same constant, so the
 * engine's long-rest durations and the animation cannot drift apart. (3.82 s since 24-11-2026:
 * 1.3 s longer than before, so the words of the clouds can be read for 2.5 s; 3.37 s since
 * 25-11-2026, 0.45 s shorter, with the rocket rising slowly by the words.)
 */
export const TALK_LEAD_MS = 3370;

/**
 * The rest after a block (its segment comes off the rocket, 25-11-2026): its clouds last this much
 * longer (three sentences: the block done, the % done, the segment coming off), so they open
 * BLOCK_END_LEAD_MS into the rest, and the rest is this much longer (in whole seconds) so the
 * countdown keeps its time once they have opened. (4.5 s since 25-11-2026, a second more than
 * before: the segment is now taken off by the mechanics and falls slowly, and the engine relights
 * before the rocket goes, one thing at a time: SEPARATION in rocketFlight.ts.)
 */
export const BLOCK_END_EXTRA_MS = 4500;
export const BLOCK_END_LEAD_MS = TALK_LEAD_MS + BLOCK_END_EXTRA_MS;

/** A plain rest after a block, without talks to fit: a long rest and the clouds' extra time. */
export function getBlockEndRestBase(restSeconds: number): number {
  return getLongRestBase(restSeconds) + Math.ceil(BLOCK_END_EXTRA_MS / 1000);
}

/**
 * The last seconds of a long rest (phone): the next exercise fills the screen behind a veil, with
 * "Prepárate" and the countdown. A talk never runs into them: the rest stretches instead.
 */
export const LONG_REST_READY_SECONDS = 5;

/**
 * Less rest video than this (s) between the end of the talk and those last seconds is not worth
 * showing: the talk goes straight into them.
 */
export const LONG_REST_MIN_RESTING_SECONDS = 4;

/**
 * Whole seconds a long rest needs so a talk of `talkSeconds` plays whole: the lead time (when its
 * clouds open: BLOCK_END_LEAD_MS after a block or the warm-up), the talk, and the last seconds
 * (LONG_REST_READY_SECONDS) after it. 0 without a talk.
 */
export function getTalkRestSeconds(talkSeconds: number, leadMs: number = TALK_LEAD_MS): number {
  return talkSeconds > 0 ? Math.ceil(talkSeconds + leadMs / 1000 + LONG_REST_READY_SECONDS) : 0;
}

/** The rest between one block and the next lasts at least this long (s): clouds, its talk, the rest video. */
export const BETWEEN_BLOCKS_MIN_SECONDS = 60;

/**
 * A long rest, after the warm-up or between blocks (`betweenBlocks`). Both have the longer clouds
 * (they open BLOCK_END_LEAD_MS in, and the talk starts then); between blocks it lasts at least a
 * minute. A talk that needs more stretches it (getTalkRestSeconds).
 */
export function getLongRestSeconds(restSeconds: number, talkSeconds: number, betweenBlocks: boolean): number {
  const usual = Math.max(getBlockEndRestBase(restSeconds), getTalkRestSeconds(talkSeconds, BLOCK_END_LEAD_MS));
  return betweenBlocks ? Math.max(BETWEEN_BLOCKS_MIN_SECONDS, usual) : usual;
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

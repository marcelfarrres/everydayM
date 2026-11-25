import type { Exercise, RestClip, RoutineItem } from '@/types/workout';

/*
 * The rest video of each long rest (after the warm-up and between blocks): Marcel resting on
 * camera, looped and muted while no vídeo hablado speaks. Chosen from the catalog's rest videos in
 * turn, so none repeats until all have been used. While the catalog has none, a warm-up clip (the
 * calmest) stands in: one of the routine's own warm-ups, else any warm-up, else the next exercise.
 */

type ClipSource = Pick<Exercise, 'id' | 'video_url' | 'video_lite_url' | 'poster_url' | 'duration_seconds'>;

/** Only what the player needs of a rest video (or of a clip standing in for one). */
export function toRestClip(media: ClipSource): RestClip {
  const duration = Number(media.duration_seconds);
  return {
    id: media.id,
    video_url: media.video_url,
    video_lite_url: media.video_lite_url ?? null,
    poster_url: media.poster_url ?? null,
    duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : 0,
  };
}

const isWarmup = (exercise: Exercise) => exercise.type?.toLowerCase() === 'warmup';

/**
 * The queue with a `restClip` on every long rest. `clips`: the catalog's rest videos; `warmups`:
 * the routine's own warm-ups; `library`: every exercise (for any warm-up). `rng` picks where the
 * turn starts (called once, so it does not disturb the rest of the build).
 */
export function assignRestClips(
  queue: RoutineItem[],
  clips: readonly ClipSource[],
  warmups: readonly Exercise[],
  library: readonly Exercise[],
  rng: () => number,
): RoutineItem[] {
  const longRests = queue.filter((item) => item.kind === 'rest' && item.restKind === 'long').length;
  if (longRests === 0) return queue;
  const pool: ClipSource[] = clips.length > 0 ? [...clips] : warmups.length > 0 ? [...warmups] : library.filter(isWarmup);
  const start = pool.length > 1 ? Math.floor(rng() * pool.length) % pool.length : 0;
  let turn = 0;
  return queue.map((item) => {
    if (item.kind !== 'rest' || item.restKind !== 'long') return item;
    const source = pool.length > 0 ? pool[(start + turn) % pool.length] : item.nextExercise;
    turn += 1;
    return { ...item, restClip: toRestClip(source) };
  });
}

/**
 * At play time: the rest's own clip, or (a routine saved before rest videos existed) one of the
 * routine's warm-ups, else the next exercise.
 */
export function restClipOf(queue: readonly RoutineItem[], rest: Extract<RoutineItem, { kind: 'rest' }>): RestClip {
  if (rest.restClip) return rest.restClip;
  const warmup = queue.find((item) => item.kind === 'warmup');
  return toRestClip(warmup?.kind === 'warmup' ? warmup.exercise : rest.nextExercise);
}

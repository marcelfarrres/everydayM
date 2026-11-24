import type { Exercise, ExerciseTalk } from '@/types/workout';

type Playable = Pick<Exercise | ExerciseTalk, 'video_url' | 'video_lite_url'>;

/** The URL the app should play: the light copy when there is one, otherwise the original. */
export function playbackUrl(media: Playable): string {
  return media.video_lite_url || media.video_url;
}

/**
 * After a <video> failed to load: point it at the original when it was playing the light copy
 * (a missing or broken lite file must not stop the routine). false when there is nothing else
 * to try (it already was the original).
 */
export function retryWithOriginal(el: Pick<HTMLVideoElement, 'getAttribute' | 'src'>, media: Playable): boolean {
  const original = media.video_url;
  if (!original || el.getAttribute('src') === original) return false;
  el.src = original;
  return true;
}

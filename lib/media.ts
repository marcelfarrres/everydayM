import type { Exercise, ExerciseTalk } from '@/types/workout';

/** The URL the app should play: the light copy when there is one, otherwise the original. */
export function playbackUrl(media: Pick<Exercise | ExerciseTalk, 'video_url' | 'video_lite_url'>): string {
  return media.video_lite_url || media.video_url;
}

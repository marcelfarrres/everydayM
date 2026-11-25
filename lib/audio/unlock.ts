import { getAudioContext } from '@/lib/audio';
import { playbackUrl } from '@/lib/media';
import type { RoutineItem } from '@/types/workout';
import { getMusicEngine } from './music';
import { preloadSfx } from './sfx';
import { primeTalkVideo } from './talkVideo';

/*
 * Everything the player will later play with sound, unlocked in one go. Call it synchronously
 * inside the tap that starts the routine ("Empezar"), before any await: iPhone only allows sound
 * from a user gesture, and only for what was started during it.
 */

/** The first vídeo hablado the routine will play, so it starts loading during the tap. */
function firstTalkUrl(queue: RoutineItem[] | undefined): string | undefined {
  for (const item of queue ?? []) {
    if (item.kind === 'rest' && item.talks.length > 0) return playbackUrl(item.talks[0]);
  }
  return undefined;
}

export function unlockPlayerAudio({
  startMusic = true,
  queue,
}: {
  /** false when the routine is still being built (it may fail): the music starts with the player. */
  startMusic?: boolean;
  queue?: RoutineItem[];
} = {}) {
  try {
    getAudioContext(); // creates or resumes the shared context, inside the tap
    preloadSfx(); // the recorded effects start loading now, so the first take-off isn't late
    getMusicEngine()?.unlock(startMusic);
    primeTalkVideo(firstTalkUrl(queue));
  } catch {
    // sound is a bonus: never block the routine
  }
}

/*
 * The music's watchdog, as pure rules (the engine in music.ts asks them what to do).
 *
 * Why it exists: on iPhone (WebKit, so also Chrome on iOS) a <video> that starts playing with
 * sound pauses every other media element of the page that plays sound, our music <audio>
 * included: on iOS the "video with audio" kind of media session may not play alongside another
 * audio session (WebKit: MediaSessionManagerIOS adds `ConcurrentPlaybackNotPermitted` to
 * `VideoAudio`, and `PlatformMediaSession::canPlayConcurrently` says no for Audio + VideoAudio).
 * Starting the music again does not pause the video back (plain audio has no such
 * restriction), so the music can be brought back right under the voice. The system can also
 * leave the shared AudioContext `suspended` or `interrupted` (a call, Siri, another app), and
 * then the music element plays into nothing.
 *
 * So, while a workout runs, whenever something may have stopped the music (a talk starts or
 * ends, the music element pauses on its own, the context changes state, every few seconds
 * anyway), the engine looks again and, if the music should sound and doesn't, resumes the
 * context and plays the element again, a few times with growing waits. If the browser refuses
 * without a tap, the player shows «Activar sonido» instead of staying silent.
 */

/** Checks of one episode before giving up and asking for a tap. */
export const WATCHDOG_MAX_ATTEMPTS = 4;
/** Wait before the first check after a kick, then before each retry (the last one repeats). */
export const WATCHDOG_DELAYS_MS = [150, 400, 900, 1800] as const;
/** A look every so often while the workout runs, in case an event never came. */
export const WATCHDOG_POLL_MS = 2000;

export interface WatchdogInput {
  /** The music should be heard now: workout running, not paused by the user, not muted, page visible, tracks. */
  wanted: boolean;
  /** Every track failed to load: nothing to bring back. */
  gaveUp: boolean;
  /** The music goes through the AudioContext ('graph') or plays straight from the elements ('direct'). */
  route: 'graph' | 'direct';
  /** The AudioContext's state (null: there is none). */
  context: string | null;
  /** The live music element has a track and is not paused. */
  musicPlaying: boolean;
  /** Recoveries already tried in this episode. */
  attempts: number;
  /** The browser refused play() or resume() without a tap. */
  refused: boolean;
  /** The music is lowered for a talk. */
  ducked: boolean;
  /** A talk is really playing with sound right now. */
  voiceAudible: boolean;
}

export interface WatchdogPlan {
  /**
   * idle: the music is not meant to sound (nothing to watch). ok: it sounds. recover: try to
   * bring it back now. ask-tap: the browser wants a tap, show «Activar sonido».
   */
  action: 'idle' | 'ok' | 'recover' | 'ask-tap';
  resumeContext: boolean;
  playMusic: boolean;
  /** Lowered with no voice to make room for: back to the chosen level. */
  restoreLevel: boolean;
}

/** The context is not making sound and should be resumed (`interrupted` is WebKit's own state). */
export function contextNeedsResume(state: string | null | undefined): boolean {
  return state === 'suspended' || state === 'interrupted';
}

export function watchdogPlan(input: WatchdogInput): WatchdogPlan {
  const restoreLevel = input.ducked && !input.voiceAudible;
  if (!input.wanted || input.gaveUp) return { action: 'idle', resumeContext: false, playMusic: false, restoreLevel };
  const resumeContext = input.route === 'graph' && contextNeedsResume(input.context);
  const playMusic = !input.musicPlaying;
  if (!resumeContext && !playMusic) return { action: 'ok', resumeContext, playMusic, restoreLevel };
  if (input.refused || input.attempts >= WATCHDOG_MAX_ATTEMPTS) {
    return { action: 'ask-tap', resumeContext, playMusic, restoreLevel };
  }
  return { action: 'recover', resumeContext, playMusic, restoreLevel };
}

/** How long to wait before the check that follows `attempts` recoveries. */
export function retryDelayMs(attempts: number): number {
  const i = Math.min(WATCHDOG_DELAYS_MS.length - 1, Math.max(0, Math.floor(attempts)));
  return WATCHDOG_DELAYS_MS[i];
}

/**
 * A pause of the live music element that our own code did not ask for: the music should still
 * be sounding. (Our own pauses always come with the music no longer wanted, or right before we
 * load the next track, which the next check then plays.)
 */
export function pauseIsUnexpected({ live, wanted }: { live: boolean; wanted: boolean }): boolean {
  return live && wanted;
}

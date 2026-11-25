/*
 * A sound on the browser's animation timeline: an empty animation (no target, no keyframes) that
 * "finishes" at the moment the sound belongs to, so it is as late or as early as the animations
 * it goes with. Pause it, play it or cancel it like them. A cue that comes due much later than it
 * should (a tab that was hidden, a moment already past) stays silent instead of bursting out.
 */

const LATE_MS = 250;

/**
 * Plays `play` at `at` (a `performance.now()` time), on the animation timeline. Returns the cue
 * (null when it is already past or there is no Web Animations).
 */
export function sfxCue(at: number, play: () => void): Animation | null {
  if (typeof window === 'undefined' || typeof KeyframeEffect === 'undefined' || typeof Animation === 'undefined') return null;
  const now = performance.now();
  if (!Number.isFinite(at) || at < now - LATE_MS) return null;
  try {
    const delay = Math.max(0, at - now);
    const cue = new Animation(new KeyframeEffect(null, null, { duration: 0, delay }), document.timeline);
    cue.onfinish = () => {
      // (after a pause the cue's start time moves with it: lateness is measured from there)
      const due = (typeof cue.startTime === 'number' ? cue.startTime : now) + delay;
      if (performance.now() - due <= LATE_MS) play();
    };
    cue.play();
    cue.startTime = now;
    return cue;
  } catch {
    return null;
  }
}

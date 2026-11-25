/*
 * One AudioContext for the whole app: browsers cap how many can exist, and iPhone only lets
 * sound out of one that was resumed after a tap.
 */

let sharedAudioCtx: AudioContext | null = null;

/** The shared AudioContext (created on first use), or null on the server or old browsers. */
export function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtx) return null;

  if (!sharedAudioCtx) {
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/** The shared AudioContext only if it already exists: never creates one outside a tap. */
export function peekAudioContext(): AudioContext | null {
  return sharedAudioCtx;
}

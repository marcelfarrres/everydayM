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

export function playCountdownBeep(secondsRemaining: number) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Higher pitch on 1s / go
    const frequency = secondsRemaining <= 1 ? 880 : 660;
    const duration = secondsRemaining <= 1 ? 0.18 : 0.11;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration + 0.02);
  } catch {
    // Ignore audio context restriction errors if user hasn't interacted yet
  }
}

import { SFX_LOOPS, clamp01, type SfxName } from './sfxRecipes';

/*
 * The sound effects that are real recordings: one file per sound in `public/sfx/<name>.mp3`
 * (sources and licences in public/sfx/CREDITS.md). `sfx.ts` plays them; a sound left out here,
 * or whose file is missing or can't be decoded, plays its synthesised recipe instead.
 *
 * Files are normalised to a common level (loudest 200 ms at about -16 dBFS RMS, peaks ≤ -1 dBFS),
 * so `gain` is only the mix: how loud this sound sits over the music. To swap a sound, replace
 * its mp3 (same name); to make it louder or softer, change its `gain` here.
 *
 * Levels (not yet checked by ear) relative to the music, which plays at the same volume knob:
 * flight and separation clearly audible but under it, the stands' thud softer, interface clicks subtle,
 * and the rocket base's ambience (drum, steps, button, tower) subtler still.
 */

export interface SfxSample {
  /** File name inside `public/sfx/`. */
  file: string;
  /** Level of this sound, 0..1 (on top of the effects bus, which follows the music's volume). */
  gain: number;
  /** Playback speed and pitch (1 = as recorded). */
  rate?: number;
  /** Loops only: the seamless span of the file, in seconds (it has a little padding at each end). */
  loop?: { start: number; end: number };
}

/** Where the files are served from: the app's own public folder, never an absolute URL. */
export const SFX_SAMPLE_DIR = '/sfx/';

export const SFX_SAMPLES: Partial<Record<SfxName, SfxSample>> = {
  // Flight
  launch: { file: 'launch.mp3', gain: 0.75 },
  slowMo: { file: 'slowMo.mp3', gain: 0.5, loop: { start: 0.15, end: 4.15 } },
  boost: { file: 'boost.mp3', gain: 0.7 },
  land: { file: 'land.mp3', gain: 0.7 },
  separate: { file: 'separate.mp3', gain: 0.75 },
  // The rocket drops off its stands (the repair crew itself is silent)
  pam: { file: 'pam.mp3', gain: 0.55 },
  // Interface
  banner: { file: 'banner.mp3', gain: 0.3 },
  clack: { file: 'clack.mp3', gain: 0.28 },
  ignite: { file: 'ignite.mp3', gain: 0.4 },
  // The end screen: a real snare roll (10.5 s, steady: its crescendo is the loop's intensity) and
  // the crash that ends it. Nothing else sounds then (the music has faded out), so they sit high.
  drumRoll: { file: 'drumRoll.mp3', gain: 0.6, loop: { start: 0.1, end: 10.35 } },
  drumHit: { file: 'drumHit.mp3', gain: 0.8 },
  // The creator's joke: a low "wrong answer" buzz (no music plays in the creator yet)
  error: { file: 'error.mp3', gain: 0.5 },
  // The first screen's rocket base (phone): ambience, below the interface clicks and the buzzer.
  // The ratchet and the steps repeat fast, so they sit lowest.
  drumClick: { file: 'drumClick.mp3', gain: 0.12 },
  metalStep: { file: 'metalStep.mp3', gain: 0.08 },
  ladderStep: { file: 'ladderStep.mp3', gain: 0.08 },
  buttonThunk: { file: 'buttonThunk.mp3', gain: 0.24 },
  towerDock: { file: 'towerDock.mp3', gain: 0.22 },
  // beep and beepFinal (3-2-1) stay synthesised.
};

export function sampleUrl(sample: SfxSample): string {
  return SFX_SAMPLE_DIR + sample.file;
}

/** Level of a sampled loop at `intensity`: its gain, following the recipe's curve (low → high). */
export function sampleLoopGain(name: keyof typeof SFX_LOOPS, sample: SfxSample, intensity: number): number {
  const { low, high } = SFX_LOOPS[name];
  const t = clamp01(intensity);
  const curve = high.gain > 0 ? (low.gain * (1 - t) + high.gain * t) / high.gain : 1;
  return sample.gain * curve;
}

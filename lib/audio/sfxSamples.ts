import { SFX_LOOPS, type SfxName } from './sfxRecipes';

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
 * flight and separation clearly audible but under it, repair hits softer, interface clicks subtle.
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
  // Repair (they repeat every ~0.6 s: the recipe's `vary` still changes pitch and level a little)
  hammer: { file: 'hammer.mp3', gain: 0.45 },
  ratchet: { file: 'ratchet.mp3', gain: 0.55 },
  puff: { file: 'puff.mp3', gain: 0.4 },
  pam: { file: 'pam.mp3', gain: 0.55 },
  // Interface
  banner: { file: 'banner.mp3', gain: 0.3 },
  clack: { file: 'clack.mp3', gain: 0.28 },
  ignite: { file: 'ignite.mp3', gain: 0.4 },
  // beep, beepFinal (3-2-1) and engineRumble stay synthesised.
};

export function sampleUrl(sample: SfxSample): string {
  return SFX_SAMPLE_DIR + sample.file;
}

/** Level of a sampled loop at `intensity`: its gain, following the recipe's curve (low → high). */
export function sampleLoopGain(name: keyof typeof SFX_LOOPS, sample: SfxSample, intensity: number): number {
  const { low, high } = SFX_LOOPS[name];
  const t = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0;
  const curve = high.gain > 0 ? (low.gain * (1 - t) + high.gain * t) / high.gain : 1;
  return sample.gain * curve;
}

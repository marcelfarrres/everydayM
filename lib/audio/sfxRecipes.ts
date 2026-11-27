/*
 * The sound effects as data, plus the pure rules around them (levels, envelopes, variation,
 * voice limits), kept apart from Web Audio so they can be tested. `sfx.ts` plays them.
 *
 * Most sounds are real recordings now (`sfxSamples.ts`, files in public/sfx/): for those, the
 * recipe's layers and `gain` are the fallback while a file is missing or can't be decoded, and its
 * category, `vary`, `maxVoices` and `minGap` still apply to the recording. `beep` and `beepFinal`
 * are only synthesised. They never duck the music.
 *
 * To adjust a synthesised sound, change its `gain` (the whole sound) or a layer's `gain` (one
 * part of it) here; a recording's level is its `gain` in `sfxSamples.ts`.
 */

// ── Names and categories ─────────────────────────────────────────────────────────────────

/** `alert` sounds also play while a vídeo hablado speaks; `ambient` ones go quiet then. */
export type SfxCategory = 'alert' | 'ambient';

export type SfxOneShot =
  | 'beep'
  | 'beepFinal'
  | 'launch'
  | 'separate'
  | 'boost'
  | 'land'
  | 'banner'
  | 'pam'
  | 'clack'
  | 'ignite'
  | 'drumHit'
  | 'error'
  | 'drumClick'
  | 'metalStep'
  | 'ladderStep'
  | 'buttonThunk'
  | 'towerDock'
  | 'engineStart'
  | 'hookGrab'
  | 'truckRoll'
  | 'liftWhir'
  | 'spark'
  | 'veilWhoosh';

export type SfxLoopName = 'slowMo' | 'drumRoll';

export type SfxName = SfxOneShot | SfxLoopName;

export type Wave = 'sine' | 'triangle' | 'square' | 'sawtooth';
export type NoiseFilter = 'lowpass' | 'highpass' | 'bandpass';

/** Seconds. The level rises in `attack`, stays for `hold`, then falls exponentially in `decay`. */
export interface Envelope {
  attack: number;
  hold?: number;
  decay: number;
}

interface LayerBase {
  at?: number; // start, seconds after the sound starts
  gain: number; // peak of this layer, 0..1
  env: Envelope;
  /** The same layer again `count` times, `every` seconds apart, each one `fade` times the last. */
  repeat?: { count: number; every: number; fade?: number };
}

export interface ToneLayer extends LayerBase {
  kind: 'tone';
  wave: Wave;
  freq: number; // Hz
  freqEnd?: number; // glides to it over the layer (exponential)
}

export interface NoiseLayer extends LayerBase {
  kind: 'noise';
  filter: NoiseFilter;
  freq: number; // filter frequency, Hz
  freqEnd?: number;
  q?: number;
}

export type SfxLayer = ToneLayer | NoiseLayer;

export interface OneShotRecipe {
  category: SfxCategory;
  gain: number; // the whole sound, 0..1
  layers: SfxLayer[];
  /** Random change on each play, so repeats don't tire: ± semitones and up to this share quieter. */
  vary?: { pitch: number; gain: number };
  maxVoices: number; // at most this many of this sound at once (the oldest is cut)
  minGap: number; // seconds: a second call sooner than this is ignored
}

/** The engine loop: two detuned saws + noise, low-passed, with a flutter. */
export interface LoopParams {
  gain: number;
  oscFreq: number; // Hz of the saws
  cutoff: number; // low-pass, Hz
  noiseMix: number; // 0..1 share of noise
  flutterRate: number; // Hz
  flutterDepth: number; // 0..1
}

export interface LoopRecipe {
  category: SfxCategory;
  /** Params at intensity 0 and at intensity 1 (in between: interpolated). */
  low: LoopParams;
  high: LoopParams;
  fadeIn: number; // seconds
  fadeOut: number;
}

// ── Tuning: global ───────────────────────────────────────────────────────────────────────

/** Effects level at the music's full volume (the music volume scales it). */
export const SFX_MASTER = 0.55;
/** How fast the bus follows volume, mute and a talk starting or ending (seconds). */
export const SFX_BUS_RAMP = 0.12;
/** At most this many one-shots at once; the oldest is cut with a short fade. */
export const MAX_VOICES = 8;
/** At most this many loops at once. */
export const MAX_LOOPS = 3;
/** The fade when a voice is cut to make room (seconds). */
export const STEAL_FADE = 0.03;
/** Soft limiter on the effects bus, so several at once don't clip. */
export const SFX_LIMITER = { threshold: -8, knee: 8, ratio: 8, attack: 0.003, release: 0.2 } as const;
/** Lowest level of an exponential ramp (Web Audio can't ramp to 0). */
export const SILENCE = 0.0001;

// ── Tuning: every sound ─────────────────────────────────────────────────────────────────

export const SFX_RECIPES: Record<SfxOneShot, OneShotRecipe> = {
  // 3-2-1 pips: plain sine, above where the music's bass and voice sit.
  beep: {
    category: 'alert',
    gain: 0.4,
    maxVoices: 2,
    minGap: 0.25,
    layers: [{ kind: 'tone', wave: 'sine', freq: 880, gain: 1, env: { attack: 0.004, hold: 0.05, decay: 0.07 } }],
  },
  beepFinal: {
    category: 'alert',
    gain: 0.42,
    maxVoices: 2,
    minGap: 0.25,
    layers: [
      { kind: 'tone', wave: 'sine', freq: 1320, gain: 1, env: { attack: 0.004, hold: 0.12, decay: 0.14 } },
      { kind: 'tone', wave: 'sine', freq: 2640, gain: 0.12, env: { attack: 0.004, hold: 0.06, decay: 0.1 } },
    ],
  },

  // Rocket.
  launch: {
    category: 'ambient',
    gain: 0.38,
    maxVoices: 1,
    minGap: 0.3,
    layers: [
      { kind: 'noise', filter: 'bandpass', freq: 300, freqEnd: 1800, q: 0.8, gain: 0.9, env: { attack: 0.05, hold: 0.1, decay: 0.75 } },
      { kind: 'tone', wave: 'sine', freq: 75, freqEnd: 45, gain: 0.8, env: { attack: 0.01, decay: 0.45 } },
      { kind: 'tone', wave: 'triangle', freq: 150, freqEnd: 90, gain: 0.35, env: { attack: 0.01, decay: 0.3 } },
    ],
  },
  separate: {
    category: 'ambient',
    gain: 0.32,
    maxVoices: 2,
    minGap: 0.1,
    layers: [
      // "clonc": two inharmonic partials, a dry knock under them, then a hiss.
      { kind: 'tone', wave: 'sine', freq: 520, gain: 0.7, env: { attack: 0.002, decay: 0.22 } },
      { kind: 'tone', wave: 'sine', freq: 1370, gain: 0.35, env: { attack: 0.002, decay: 0.12 } },
      { kind: 'noise', filter: 'bandpass', freq: 1200, q: 2, gain: 0.5, env: { attack: 0.001, decay: 0.03 } },
      { kind: 'noise', filter: 'highpass', freq: 4000, at: 0.04, gain: 0.35, env: { attack: 0.02, decay: 0.35 } },
    ],
  },
  boost: {
    category: 'ambient',
    gain: 0.32,
    maxVoices: 1,
    minGap: 0.2,
    layers: [
      { kind: 'noise', filter: 'bandpass', freq: 600, freqEnd: 2500, q: 1, gain: 0.9, env: { attack: 0.03, decay: 0.32 } },
      { kind: 'tone', wave: 'triangle', freq: 110, freqEnd: 170, gain: 0.4, env: { attack: 0.02, decay: 0.28 } },
    ],
  },
  land: {
    category: 'ambient',
    gain: 0.34,
    maxVoices: 1,
    minGap: 0.3,
    layers: [
      // Skid: a narrow noise band sliding down; then a muffled thud.
      { kind: 'noise', filter: 'bandpass', freq: 1800, freqEnd: 900, q: 3, gain: 0.6, env: { attack: 0.02, hold: 0.08, decay: 0.2 } },
      { kind: 'tone', wave: 'sine', freq: 95, freqEnd: 45, at: 0.24, gain: 0.9, env: { attack: 0.003, decay: 0.25 } },
      { kind: 'noise', filter: 'lowpass', freq: 380, at: 0.24, gain: 0.6, env: { attack: 0.002, decay: 0.09 } },
    ],
  },
  banner: {
    category: 'ambient',
    gain: 0.22,
    maxVoices: 2,
    minGap: 0.1,
    layers: [
      { kind: 'noise', filter: 'highpass', freq: 3000, gain: 0.8, env: { attack: 0.001, decay: 0.015 } },
      { kind: 'tone', wave: 'triangle', freq: 300, freqEnd: 520, at: 0.01, gain: 0.5, env: { attack: 0.005, decay: 0.16 } },
    ],
  },

  // The rocket drops off its stands at the end of a rest.
  pam: {
    category: 'ambient',
    gain: 0.34,
    maxVoices: 2,
    minGap: 0.08,
    vary: { pitch: 1, gain: 0.1 },
    layers: [
      { kind: 'tone', wave: 'sine', freq: 120, freqEnd: 55, gain: 0.9, env: { attack: 0.002, decay: 0.18 } },
      { kind: 'noise', filter: 'lowpass', freq: 420, gain: 0.6, env: { attack: 0.001, decay: 0.08 } },
      { kind: 'noise', filter: 'highpass', freq: 2500, gain: 0.3, env: { attack: 0.001, decay: 0.012 } },
    ],
  },
  clack: {
    category: 'ambient',
    gain: 0.26,
    maxVoices: 3,
    minGap: 0.05,
    vary: { pitch: 1, gain: 0.15 },
    layers: [
      { kind: 'noise', filter: 'bandpass', freq: 1800, q: 4, gain: 0.9, env: { attack: 0.001, decay: 0.05 } },
      { kind: 'tone', wave: 'sine', freq: 420, gain: 0.5, env: { attack: 0.001, decay: 0.06 } },
      { kind: 'tone', wave: 'sine', freq: 1100, gain: 0.25, env: { attack: 0.001, decay: 0.04 } },
    ],
  },
  ignite: {
    category: 'ambient',
    gain: 0.28,
    maxVoices: 2,
    minGap: 0.15,
    vary: { pitch: 1, gain: 0.1 },
    layers: [
      {
        kind: 'noise',
        filter: 'highpass',
        freq: 5000,
        gain: 0.7,
        env: { attack: 0.001, decay: 0.03 },
        repeat: { count: 3, every: 0.025, fade: 0.8 },
      },
      { kind: 'noise', filter: 'bandpass', freq: 400, freqEnd: 1400, q: 1, at: 0.05, gain: 0.8, env: { attack: 0.04, decay: 0.32 } },
    ],
  },

  // The end screen: the hit that closes the drum roll as the rocket's last piece joins (a crash
  // cymbal over a thud). Its own sound once: nothing else plays at that moment.
  drumHit: {
    category: 'ambient',
    gain: 0.36,
    maxVoices: 1,
    minGap: 0.3,
    layers: [
      // the crash: bright noise with a long tail, and a shorter, darker body under it
      { kind: 'noise', filter: 'highpass', freq: 5200, gain: 0.8, env: { attack: 0.002, hold: 0.02, decay: 1.05 } },
      { kind: 'noise', filter: 'bandpass', freq: 2600, q: 0.8, gain: 0.55, env: { attack: 0.002, decay: 0.5 } },
      // the drum under it
      { kind: 'tone', wave: 'sine', freq: 110, freqEnd: 52, gain: 0.9, env: { attack: 0.002, decay: 0.24 } },
      { kind: 'noise', filter: 'lowpass', freq: 500, gain: 0.5, env: { attack: 0.001, decay: 0.07 } },
    ],
  },

  // The creator's joke ("¿Tan poco tiempo tenemos?"): a low, short "wrong answer" buzzer. Square
  // and saw low down, a semitone apart so they rasp: nothing like the 3-2-1's clean high sine.
  error: {
    category: 'ambient',
    gain: 0.3,
    maxVoices: 1,
    minGap: 0.3,
    layers: [
      { kind: 'tone', wave: 'square', freq: 140, freqEnd: 120, gain: 0.55, env: { attack: 0.005, hold: 0.16, decay: 0.08 } },
      { kind: 'tone', wave: 'sawtooth', freq: 148, freqEnd: 127, gain: 0.45, env: { attack: 0.005, hold: 0.16, decay: 0.08 } },
    ],
  },

  // The first screen's rocket base (phone): ambience, quiet. They have recordings (sfxSamples.ts):
  // these recipes are the fallback. None is a clean sine up high, so none can pass for the 3-2-1.

  // The drum's ratchet: a dry metallic tick per rocket passing the centre. `minGap` keeps a fast
  // roulette from machine-gunning (at most ~12 a second).
  drumClick: {
    category: 'ambient',
    gain: 0.12,
    maxVoices: 2,
    minGap: 0.08,
    vary: { pitch: 1.5, gain: 0.25 },
    layers: [
      { kind: 'noise', filter: 'bandpass', freq: 2600, q: 7, gain: 0.9, env: { attack: 0.001, decay: 0.018 } },
      { kind: 'noise', filter: 'bandpass', freq: 900, q: 3, at: 0.004, gain: 0.45, env: { attack: 0.001, decay: 0.03 } },
      { kind: 'tone', wave: 'triangle', freq: 240, freqEnd: 200, gain: 0.3, env: { attack: 0.001, decay: 0.03 } },
    ],
  },
  // A boot on a metal grating: a soft thud and a little ring of the plate.
  metalStep: {
    category: 'ambient',
    gain: 0.07,
    maxVoices: 2,
    minGap: 0.11,
    vary: { pitch: 2, gain: 0.3 },
    layers: [
      { kind: 'noise', filter: 'lowpass', freq: 700, gain: 0.9, env: { attack: 0.002, decay: 0.05 } },
      { kind: 'noise', filter: 'bandpass', freq: 1900, q: 6, at: 0.006, gain: 0.35, env: { attack: 0.001, decay: 0.06 } },
    ],
  },
  // A rung of the ladder: a hollow knock on a tube.
  ladderStep: {
    category: 'ambient',
    gain: 0.07,
    maxVoices: 2,
    minGap: 0.12,
    vary: { pitch: 2, gain: 0.3 },
    layers: [
      { kind: 'noise', filter: 'bandpass', freq: 1250, q: 5, gain: 0.8, env: { attack: 0.001, decay: 0.05 } },
      { kind: 'tone', wave: 'triangle', freq: 360, freqEnd: 330, gain: 0.35, env: { attack: 0.001, decay: 0.07 } },
    ],
  },
  // The red button pushed home: a low, padded thunk.
  buttonThunk: {
    category: 'ambient',
    gain: 0.3,
    maxVoices: 1,
    minGap: 0.15,
    layers: [
      { kind: 'tone', wave: 'sine', freq: 150, freqEnd: 62, gain: 0.9, env: { attack: 0.002, decay: 0.13 } },
      { kind: 'noise', filter: 'lowpass', freq: 520, gain: 0.6, env: { attack: 0.001, decay: 0.05 } },
      { kind: 'noise', filter: 'highpass', freq: 2800, gain: 0.15, env: { attack: 0.001, decay: 0.008 } },
    ],
  },
  // The launch tower's arms close on the rocket: a heavy clank, inharmonic, with a low knock.
  towerDock: {
    category: 'ambient',
    gain: 0.26,
    maxVoices: 1,
    minGap: 0.2,
    layers: [
      { kind: 'tone', wave: 'triangle', freq: 310, gain: 0.55, env: { attack: 0.002, decay: 0.24 } },
      { kind: 'tone', wave: 'triangle', freq: 787, gain: 0.3, env: { attack: 0.002, decay: 0.14 } },
      { kind: 'noise', filter: 'bandpass', freq: 1500, q: 2, gain: 0.6, env: { attack: 0.001, decay: 0.04 } },
      { kind: 'tone', wave: 'sine', freq: 95, freqEnd: 60, gain: 0.7, env: { attack: 0.002, decay: 0.14 } },
    ],
  },

  // The creator (phone): no music plays there, so these carry the mood. Synthesised only (no
  // files); their levels in the creator: lib/audio/creatorSfx.ts.

  // A rocket's engine coming to life (the wheel settles on it, the typing bar takes focus): a low
  // rumble that swells and settles in ~0.6 s, a breath of hiss on top. Never a clean high tone.
  engineStart: {
    category: 'ambient',
    gain: 0.34,
    maxVoices: 1,
    minGap: 0.45,
    vary: { pitch: 1, gain: 0.15 },
    layers: [
      { kind: 'noise', filter: 'lowpass', freq: 180, freqEnd: 420, gain: 0.9, env: { attack: 0.16, hold: 0.12, decay: 0.3 } },
      { kind: 'tone', wave: 'sawtooth', freq: 46, freqEnd: 62, gain: 0.32, env: { attack: 0.14, hold: 0.1, decay: 0.3 } },
      { kind: 'tone', wave: 'triangle', freq: 92, freqEnd: 120, gain: 0.3, env: { attack: 0.12, hold: 0.08, decay: 0.28 } },
      { kind: 'noise', filter: 'bandpass', freq: 1100, freqEnd: 700, q: 1.2, at: 0.06, gain: 0.16, env: { attack: 0.1, decay: 0.3 } },
    ],
  },
  // The crane's hook takes a piece: a bright clang of steel on steel, a little ring after it.
  hookGrab: {
    category: 'ambient',
    gain: 0.3,
    maxVoices: 1,
    minGap: 0.25,
    vary: { pitch: 1.2, gain: 0.15 },
    layers: [
      { kind: 'tone', wave: 'triangle', freq: 523, gain: 0.5, env: { attack: 0.001, decay: 0.2 } },
      { kind: 'tone', wave: 'triangle', freq: 1367, gain: 0.22, env: { attack: 0.001, decay: 0.12 } },
      { kind: 'noise', filter: 'bandpass', freq: 2400, q: 3, gain: 0.55, env: { attack: 0.001, decay: 0.025 } },
      { kind: 'tone', wave: 'sine', freq: 130, freqEnd: 90, gain: 0.45, env: { attack: 0.002, decay: 0.1 } },
    ],
  },
  // The truck rolling in along the road: a low growl of tyres and engine, rising then gone.
  truckRoll: {
    category: 'ambient',
    gain: 0.22,
    maxVoices: 1,
    minGap: 0.6,
    layers: [
      { kind: 'noise', filter: 'lowpass', freq: 260, freqEnd: 160, gain: 0.9, env: { attack: 0.25, hold: 0.25, decay: 0.4 } },
      { kind: 'tone', wave: 'sawtooth', freq: 58, freqEnd: 44, gain: 0.22, env: { attack: 0.2, hold: 0.2, decay: 0.4 } },
    ],
  },
  // The truck's scissor lift raising a piece: a short motor whirr going up.
  liftWhir: {
    category: 'ambient',
    gain: 0.18,
    maxVoices: 1,
    minGap: 0.4,
    layers: [
      { kind: 'tone', wave: 'sawtooth', freq: 140, freqEnd: 230, gain: 0.35, env: { attack: 0.05, hold: 0.3, decay: 0.12 } },
      { kind: 'noise', filter: 'bandpass', freq: 900, freqEnd: 1500, q: 2, gain: 0.4, env: { attack: 0.05, hold: 0.3, decay: 0.12 } },
    ],
  },
  // A bolt's sparks: a short crackle (on top of the bolt's clack).
  spark: {
    category: 'ambient',
    gain: 0.14,
    maxVoices: 2,
    minGap: 0.08,
    vary: { pitch: 2, gain: 0.3 },
    layers: [{ kind: 'noise', filter: 'highpass', freq: 3500, gain: 0.8, env: { attack: 0.001, decay: 0.03 }, repeat: { count: 4, every: 0.035, fade: 0.7 } }],
  },
  // The white screen closing over everything: a soft airy swell.
  veilWhoosh: {
    category: 'ambient',
    gain: 0.2,
    maxVoices: 1,
    minGap: 1,
    layers: [
      { kind: 'noise', filter: 'bandpass', freq: 500, freqEnd: 2400, q: 0.7, gain: 0.8, env: { attack: 0.35, hold: 0.1, decay: 0.5 } },
      { kind: 'tone', wave: 'triangle', freq: 220, freqEnd: 330, gain: 0.12, env: { attack: 0.3, decay: 0.5 } },
    ],
  },
};


export const SFX_LOOPS: Record<SfxLoopName, LoopRecipe> = {
  // Distant, slowed-down engine while climbing through the clouds.
  slowMo: {
    category: 'ambient',
    low: { gain: 0.1, oscFreq: 34, cutoff: 220, noiseMix: 0.3, flutterRate: 2.5, flutterDepth: 0.4 },
    high: { gain: 0.1, oscFreq: 34, cutoff: 220, noiseMix: 0.3, flutterRate: 2.5, flutterDepth: 0.4 },
    fadeIn: 0.8,
    fadeOut: 0.8,
  },
  // The end screen's drum roll, from the moment the music has gone to the final hit, growing
  // (intensity 0 → 1). Synthesised: noise only (no saws), trembling 17 times a second like sticks
  // on a snare. It stops almost at once: the hit takes its place.
  drumRoll: {
    category: 'ambient',
    low: { gain: 0.09, oscFreq: 200, cutoff: 3800, noiseMix: 1, flutterRate: 16, flutterDepth: 0.85 },
    high: { gain: 0.2, oscFreq: 200, cutoff: 5200, noiseMix: 1, flutterRate: 19, flutterDepth: 0.85 },
    fadeIn: 0.25,
    fadeOut: 0.06,
  },
};

// ── Pure rules ───────────────────────────────────────────────────────────────────────────

export function isLoop(name: SfxName): name is SfxLoopName {
  return name in SFX_LOOPS;
}

export function sfxCategory(name: SfxName): SfxCategory {
  return isLoop(name) ? SFX_LOOPS[name].category : SFX_RECIPES[name].category;
}

/** `value` within 0..1 (anything not a finite number: 0). */
export function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

export interface SfxMixState {
  volume: number; // the music volume, 0..1
  muted: boolean; // the music mute
  talkSpeaking: boolean; // a vídeo hablado is playing with sound
}

/** Gains of the effects bus: master follows the music; ambient goes silent under a talk. */
export function sfxBusLevels({ volume, muted, talkSpeaking }: SfxMixState): Record<'master' | SfxCategory, number> {
  return {
    master: muted ? 0 : clamp01(volume) * SFX_MASTER,
    alert: 1,
    ambient: talkSpeaking ? 0 : 1,
  };
}

/** Whether a one-shot of this category is worth starting now (no point in silent voices). */
export function sfxAudible(category: SfxCategory, state: SfxMixState): boolean {
  const levels = sfxBusLevels(state);
  return levels.master > 0 && levels[category] > 0;
}

/** Envelope as points relative to the layer start: silence → peak → hold → silence. */
export function envelopePoints(env: Envelope, peak: number): { time: number; value: number }[] {
  const attack = Math.max(0.001, env.attack);
  const hold = Math.max(0, env.hold ?? 0);
  const decay = Math.max(0.005, env.decay);
  const top = Math.max(SILENCE * 2, peak);
  return [
    { time: 0, value: SILENCE },
    { time: attack, value: top },
    { time: attack + hold, value: top },
    { time: attack + hold + decay, value: SILENCE },
  ];
}

export function envelopeLength(env: Envelope): number {
  const points = envelopePoints(env, 1);
  return points[points.length - 1].time;
}

/** Every start of a layer (its repeats included), with the peak of each. */
export function layerHits(layer: SfxLayer): { at: number; gain: number }[] {
  const count = Math.max(1, Math.floor(layer.repeat?.count ?? 1));
  const every = layer.repeat?.every ?? 0;
  const fade = layer.repeat?.fade ?? 1;
  return Array.from({ length: count }, (_, i) => ({ at: (layer.at ?? 0) + i * every, gain: layer.gain * fade ** i }));
}

/** How long a one-shot lasts, in seconds (its last layer ends). */
export function recipeDuration(recipe: OneShotRecipe): number {
  let end = 0;
  for (const layer of recipe.layers) {
    for (const hit of layerHits(layer)) end = Math.max(end, hit.at + envelopeLength(layer.env));
  }
  return end;
}

/** This play's pitch factor and level factor (≤ 1: variation only ever makes it quieter). */
export function variation(vary: OneShotRecipe['vary'], random: () => number = Math.random): { pitch: number; gain: number } {
  if (!vary) return { pitch: 1, gain: 1 };
  const semitones = vary.pitch * (random() * 2 - 1);
  return { pitch: 2 ** (semitones / 12), gain: 1 - clamp01(vary.gain) * random() };
}

/** Loop params at `intensity` (0..1), interpolated between the recipe's low and high. */
export function loopParams(recipe: LoopRecipe, intensity: number): LoopParams {
  const t = clamp01(intensity);
  const mix = (a: number, b: number) => a * (1 - t) + b * t; // exact at both ends
  const { low, high } = recipe;
  return {
    gain: mix(low.gain, high.gain),
    oscFreq: mix(low.oscFreq, high.oscFreq),
    cutoff: mix(low.cutoff, high.cutoff),
    noiseMix: clamp01(mix(low.noiseMix, high.noiseMix)),
    flutterRate: mix(low.flutterRate, high.flutterRate),
    flutterDepth: clamp01(mix(low.flutterDepth, high.flutterDepth)),
  };
}

export interface ActiveVoice {
  id: number;
  name: SfxName;
  startedAt: number;
}

/**
 * Which voices to cut so a new `name` fits: first the oldest of the same sound beyond its
 * `perSound` limit, then the oldest of any sound beyond `total`.
 */
export function voicesToSteal(active: ActiveVoice[], name: SfxName, perSound: number, total: number): number[] {
  const byAge = [...active].sort((a, b) => a.startedAt - b.startedAt);
  const steal = new Set<number>();
  const same = byAge.filter((v) => v.name === name);
  const sameExcess = same.length - Math.max(0, perSound - 1);
  for (let i = 0; i < sameExcess; i++) steal.add(same[i].id);
  const left = byAge.filter((v) => !steal.has(v.id));
  const totalExcess = left.length - Math.max(0, total - 1);
  for (let i = 0; i < totalExcess; i++) steal.add(left[i].id);
  return [...steal];
}

/** A repeat call sooner than the sound's `minGap` is ignored (double renders, double taps). */
export function tooSoon(lastAt: number | undefined, now: number, minGap: number): boolean {
  return lastAt !== undefined && now - lastAt < minGap;
}

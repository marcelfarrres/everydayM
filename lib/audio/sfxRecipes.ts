/*
 * The sound effects as data, plus the pure rules around them (levels, envelopes, variation,
 * voice limits), kept apart from Web Audio so they can be tested. `sfx.ts` plays them.
 *
 * Everything is synthesised: short dry transients, filtered-noise hisses and low tones, so the
 * effects sit on top of the music without hiding it. They never duck the music.
 *
 * Nobody has tuned these by ear yet: levels are deliberately low. To adjust a sound, change its
 * `gain` (the whole sound) or a layer's `gain` (one part of it) here; nothing else needs to move.
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
  | 'hammer'
  | 'ratchet'
  | 'puff'
  | 'pam'
  | 'clack'
  | 'ignite';

export type SfxLoopName = 'engineRumble' | 'slowMo';

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

  // Repair: these repeat every ~0.6 s, hence the variation.
  hammer: {
    category: 'ambient',
    gain: 0.3,
    maxVoices: 2,
    minGap: 0.08,
    vary: { pitch: 1.5, gain: 0.2 },
    layers: [
      { kind: 'noise', filter: 'bandpass', freq: 2500, q: 1.5, gain: 0.8, env: { attack: 0.001, decay: 0.04 } },
      { kind: 'tone', wave: 'sine', freq: 180, freqEnd: 120, gain: 0.8, env: { attack: 0.002, decay: 0.09 } },
      { kind: 'tone', wave: 'sine', freq: 1900, gain: 0.15, env: { attack: 0.001, decay: 0.12 } },
    ],
  },
  ratchet: {
    category: 'ambient',
    gain: 0.24,
    maxVoices: 2,
    minGap: 0.08,
    vary: { pitch: 1, gain: 0.2 },
    layers: [
      {
        kind: 'noise',
        filter: 'bandpass',
        freq: 3200,
        q: 3,
        gain: 0.9,
        env: { attack: 0.001, decay: 0.012 },
        repeat: { count: 5, every: 0.035, fade: 0.85 },
      },
    ],
  },
  puff: {
    category: 'ambient',
    gain: 0.22,
    maxVoices: 2,
    minGap: 0.08,
    vary: { pitch: 2, gain: 0.25 },
    layers: [
      { kind: 'noise', filter: 'lowpass', freq: 900, freqEnd: 300, gain: 1, env: { attack: 0.02, decay: 0.3 } },
    ],
  },
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
};

export const SFX_LOOPS: Record<SfxLoopName, LoopRecipe> = {
  // Grows with `intensity` from 10 s before lift-off (0) to the launch (1).
  engineRumble: {
    category: 'ambient',
    low: { gain: 0.05, oscFreq: 42, cutoff: 160, noiseMix: 0.35, flutterRate: 7, flutterDepth: 0.25 },
    high: { gain: 0.22, oscFreq: 68, cutoff: 520, noiseMix: 0.55, flutterRate: 16, flutterDepth: 0.35 },
    fadeIn: 0.3,
    fadeOut: 0.35,
  },
  // Distant, slowed-down engine while climbing through the clouds.
  slowMo: {
    category: 'ambient',
    low: { gain: 0.1, oscFreq: 34, cutoff: 220, noiseMix: 0.3, flutterRate: 2.5, flutterDepth: 0.4 },
    high: { gain: 0.1, oscFreq: 34, cutoff: 220, noiseMix: 0.3, flutterRate: 2.5, flutterDepth: 0.4 },
    fadeIn: 0.8,
    fadeOut: 0.8,
  },
};

// ── Pure rules ───────────────────────────────────────────────────────────────────────────

export function isLoop(name: SfxName): name is SfxLoopName {
  return name in SFX_LOOPS;
}

export function sfxCategory(name: SfxName): SfxCategory {
  return isLoop(name) ? SFX_LOOPS[name].category : SFX_RECIPES[name].category;
}

function clamp01(value: number): number {
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

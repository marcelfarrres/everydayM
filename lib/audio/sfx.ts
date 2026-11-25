import { getAudioContext, peekAudioContext } from '@/lib/audio';
import { DEFAULT_MUSIC_SETTINGS } from './mix';
import { getMusicEngine } from './music';
import {
  MAX_LOOPS,
  MAX_VOICES,
  SFX_BUS_RAMP,
  SFX_LIMITER,
  SFX_LOOPS,
  SFX_RECIPES,
  SILENCE,
  STEAL_FADE,
  envelopeLength,
  envelopePoints,
  layerHits,
  loopParams,
  recipeDuration,
  sfxAudible,
  sfxBusLevels,
  tooSoon,
  variation,
  voicesToSteal,
  type ActiveVoice,
  type LoopParams,
  type LoopRecipe,
  type SfxCategory,
  type SfxLayer,
  type SfxLoopName,
  type SfxMixState,
  type SfxName,
  type SfxOneShot,
} from './sfxRecipes';
import { SFX_SAMPLES, sampleLoopGain, sampleUrl, type SfxSample } from './sfxSamples';

export type { SfxLoopName, SfxName, SfxOneShot } from './sfxRecipes';

/*
 * Sound effects on the app's one AudioContext (see SFX.md): real recordings from `public/sfx/`
 * (`sfxSamples.ts`), or the synthesised recipe (`sfxRecipes.ts`) for the sounds without a file
 * and whenever a file is missing, still loading or can't be decoded.
 *
 *   voice ─┐
 *   voice ─┼─ alert   ─┐
 *   loop  ─┴─ ambient ─┴─ limiter ─ master (music volume · mute) ─ destination
 *
 * They never touch the music. `master` follows the music's volume and mute; `ambient` goes
 * silent while a vídeo hablado speaks (the moment the music engine ducks for it).
 * Nothing here creates an AudioContext outside a tap: without one (server, old browser, before
 * "Empezar") every call is a harmless no-op.
 */

export interface PlaySfxOptions {
  /** Extra level for this play, 0..1 (default 1). */
  gain?: number;
  /** Called inside a tap: may wake the AudioContext itself (e.g. `ignite` on a rocket-button). */
  gesture?: boolean;
}

/** Stops the loop (with its fade). Also carries `setIntensity` for live changes. */
export type SfxLoopStop = (() => void) & { setIntensity: (intensity: number) => void };

interface Bus {
  ctx: AudioContext;
  master: GainNode;
  categories: Record<SfxCategory, GainNode>;
  noise: AudioBuffer;
  unsubscribe: () => void;
}

interface Voice extends ActiveVoice {
  output: GainNode;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
  timer: ReturnType<typeof setTimeout> | null;
  pending: number; // sources not ended yet
  done: boolean;
}

interface LoopVoice {
  id: number;
  stop: () => void;
}

let bus: Bus | null = null;
let voices: Voice[] = [];
let loops: LoopVoice[] = [];
let nextId = 1;
const lastStart = new Map<SfxOneShot, number>();

// ── Recordings: fetched and decoded once, then reused (an AudioBuffer works in any context) ──

const buffers = new Map<SfxName, AudioBuffer>();
/**
 * Each file's one load (fetch + decode), kept for the page's whole life from the moment it starts:
 * a second call (React's dev double mount, a first use while it is still loading, another screen)
 * gets the same promise, so each file is downloaded and decoded once per page. Null: missing or
 * undecodable, the recipe plays instead (not retried). Kept on `globalThis` so a module evaluated
 * twice (a dev refresh) still shares it.
 */
const SFX_LOADS_KEY = '__everydaymSfxLoads';
type SfxLoads = Map<string, Promise<AudioBuffer | null>>;
function sfxLoads(): SfxLoads {
  const g = globalThis as typeof globalThis & { [SFX_LOADS_KEY]?: SfxLoads };
  g[SFX_LOADS_KEY] ??= new Map();
  return g[SFX_LOADS_KEY];
}

/** decodeAudioData in both its forms (older Safari only has the callbacks). */
function decode(ctx: BaseAudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise((resolve, reject) => {
    const promise: Promise<AudioBuffer> | undefined = ctx.decodeAudioData(data, resolve, reject);
    if (promise) promise.catch(reject);
  });
}

function loadSample(ctx: BaseAudioContext, name: SfxName, sample: SfxSample) {
  if (buffers.has(name)) return;
  const url = sampleUrl(sample);
  const loads = sfxLoads();
  let load = loads.get(url);
  if (!load) {
    load = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.arrayBuffer();
      })
      .then((data) => decode(ctx, data))
      .catch(() => null);
    loads.set(url, load);
  }
  void load.then((buffer) => {
    if (buffer) buffers.set(name, buffer);
  });
}

/**
 * Start fetching and decoding every recording (once; later calls are free). Called in the tap
 * that unlocks the player's sound, so the first take-off is ready; any first use also calls it.
 */
export function preloadSfx(): void {
  try {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    const ctx = peekAudioContext();
    if (!ctx || ctx.state === 'closed') return;
    for (const [name, sample] of Object.entries(SFX_SAMPLES) as [SfxName, SfxSample | undefined][]) {
      if (sample) loadSample(ctx, name, sample);
    }
  } catch {
    // the recipes are always there
  }
}

/** The decoded recording of `name`, or null (no file, still loading, failed): play the recipe. */
function sampleFor(name: SfxName): { sample: SfxSample; buffer: AudioBuffer } | null {
  const sample = SFX_SAMPLES[name];
  const buffer = buffers.get(name);
  return sample && buffer ? { sample, buffer } : null;
}

function mixState(): SfxMixState {
  const engine = getMusicEngine();
  const music = engine?.getSnapshot();
  return {
    volume: music?.volume ?? DEFAULT_MUSIC_SETTINGS.volume,
    muted: music?.muted ?? DEFAULT_MUSIC_SETTINGS.muted,
    talkSpeaking: engine?.isDucked() ?? false,
  };
}

function rampTo(ctx: AudioContext, param: AudioParam, target: number, seconds: number) {
  const now = ctx.currentTime;
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  if (seconds > 0) param.linearRampToValueAtTime(target, now + seconds);
  else param.setValueAtTime(target, now);
}

function applyLevels(seconds: number) {
  if (!bus) return;
  const levels = sfxBusLevels(mixState());
  rampTo(bus.ctx, bus.master.gain, levels.master, seconds);
  rampTo(bus.ctx, bus.categories.alert.gain, levels.alert, seconds);
  rampTo(bus.ctx, bus.categories.ambient.gain, levels.ambient, seconds);
}

function makeNoise(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function ensureBus(ctx: AudioContext): Bus {
  if (bus && bus.ctx === ctx) return bus;
  bus?.unsubscribe();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = SFX_LIMITER.threshold;
  limiter.knee.value = SFX_LIMITER.knee;
  limiter.ratio.value = SFX_LIMITER.ratio;
  limiter.attack.value = SFX_LIMITER.attack;
  limiter.release.value = SFX_LIMITER.release;
  const master = ctx.createGain();
  limiter.connect(master);
  master.connect(ctx.destination);
  const categories = { alert: ctx.createGain(), ambient: ctx.createGain() };
  categories.alert.connect(limiter);
  categories.ambient.connect(limiter);

  const engine = getMusicEngine();
  const offSettings = engine?.subscribe(() => applyLevels(SFX_BUS_RAMP));
  const offDuck = engine?.onDuckedChange(() => applyLevels(SFX_BUS_RAMP));
  bus = {
    ctx,
    master,
    categories,
    noise: makeNoise(ctx),
    unsubscribe: () => {
      offSettings?.();
      offDuck?.();
    },
  };
  applyLevels(0);
  return bus;
}

function finish(voice: Voice) {
  if (voice.done) return;
  voice.done = true;
  if (voice.timer) clearTimeout(voice.timer);
  for (const node of [...voice.sources, ...voice.nodes, voice.output]) {
    try {
      node.disconnect();
    } catch {
      // already disconnected
    }
  }
  voices = voices.filter((v) => v !== voice);
}

/** Cut a voice to make room: a very short fade, then it ends and cleans itself up. */
function cut(voice: Voice, ctx: AudioContext) {
  const end = ctx.currentTime + STEAL_FADE;
  rampTo(ctx, voice.output.gain, 0, STEAL_FADE);
  for (const source of voice.sources) {
    try {
      source.stop(end + 0.01);
    } catch {
      // not started or already stopped
    }
  }
  voices = voices.filter((v) => v !== voice); // no longer counts toward the limits
}

/** One hit of a layer: source (→ filter) → envelope → voice output. */
function scheduleHit(
  ctx: AudioContext,
  noise: AudioBuffer,
  voice: Voice,
  layer: SfxLayer,
  start: number,
  peak: number,
  pitch: number,
) {
  const length = envelopeLength(layer.env);
  const end = start + length;
  const env = ctx.createGain();
  const [from, top, held, last] = envelopePoints(layer.env, peak);
  env.gain.setValueAtTime(from.value, start);
  env.gain.exponentialRampToValueAtTime(top.value, start + top.time);
  env.gain.setValueAtTime(held.value, start + held.time);
  env.gain.exponentialRampToValueAtTime(last.value, start + last.time);
  env.connect(voice.output);
  voice.nodes.push(env);

  let source: AudioScheduledSourceNode;
  let freqParam: AudioParam;
  if (layer.kind === 'tone') {
    const osc = ctx.createOscillator();
    osc.type = layer.wave;
    freqParam = osc.frequency;
    osc.connect(env);
    source = osc;
  } else {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = layer.filter;
    filter.Q.value = layer.q ?? (layer.filter === 'bandpass' ? 1 : 0.7);
    freqParam = filter.frequency;
    src.connect(filter);
    filter.connect(env);
    voice.nodes.push(filter);
    source = src;
  }
  freqParam.setValueAtTime(layer.freq * pitch, start);
  if (layer.freqEnd) freqParam.exponentialRampToValueAtTime(layer.freqEnd * pitch, end);

  voice.pending += 1;
  source.onended = () => {
    voice.pending -= 1;
    if (voice.pending <= 0) finish(voice);
  };
  if (source instanceof AudioBufferSourceNode) source.start(start, Math.random() * Math.max(0, noise.duration - length - 0.05));
  else source.start(start);
  source.stop(end + 0.02);
  voice.sources.push(source);
}

/** Play a one-shot effect. Silent (and free) when muted, without sound, or out of place. */
export function playSfx(name: SfxOneShot, opts: PlaySfxOptions = {}): void {
  try {
    if (typeof window === 'undefined') return;
    const recipe = SFX_RECIPES[name];
    if (!recipe) return;
    const ctx = opts.gesture ? getAudioContext() : peekAudioContext();
    if (!ctx || ctx.state === 'closed') return;
    preloadSfx();
    if (ctx.state !== 'running' && !opts.gesture) return; // it would pile up and burst out later
    if (document.visibilityState === 'hidden') return;
    if (!sfxAudible(recipe.category, mixState())) return;
    const clock = performance.now() / 1000; // ctx.currentTime stands still while suspended
    if (tooSoon(lastStart.get(name), clock, recipe.minGap)) return;
    lastStart.set(name, clock);

    const b = ensureBus(ctx);
    for (const id of voicesToSteal(voices, name, recipe.maxVoices, MAX_VOICES)) {
      const victim = voices.find((v) => v.id === id);
      if (victim) cut(victim, ctx);
    }

    const recording = sampleFor(name);
    const vary = variation(recipe.vary);
    const extra = Math.min(1, Math.max(0, opts.gain ?? 1));
    const output = ctx.createGain();
    output.gain.value = (recording ? recording.sample.gain : recipe.gain) * vary.gain * extra;
    output.connect(b.categories[recipe.category]);
    const voice: Voice = { id: nextId++, name, startedAt: clock, output, sources: [], nodes: [], timer: null, pending: 0, done: false };
    voices.push(voice);

    const t0 = ctx.currentTime + 0.005;
    let length: number;
    if (recording) {
      const rate = (recording.sample.rate ?? 1) * vary.pitch;
      const source = ctx.createBufferSource();
      source.buffer = recording.buffer;
      source.playbackRate.value = rate;
      source.connect(output);
      voice.pending = 1;
      source.onended = () => finish(voice);
      source.start(t0);
      voice.sources.push(source);
      length = recording.buffer.duration / rate;
    } else {
      for (const layer of recipe.layers) {
        for (const hit of layerHits(layer)) scheduleHit(ctx, b.noise, voice, layer, t0 + hit.at, hit.gain, vary.pitch);
      }
      length = recipeDuration(recipe);
    }
    // Safety net: if `ended` never fires (context suspended for good), free the nodes anyway.
    voice.timer = setTimeout(() => finish(voice), (length + 2) * 1000);
  } catch {
    // sound is a bonus: never break the interface
  }
}

function noopLoop(): SfxLoopStop {
  return Object.assign(() => {}, { setIntensity: () => {} });
}

/**
 * Fade-in, stop (with its fade) and live intensity for a loop whose sound ends in `level`.
 * `retune` applies an intensity at a time and returns the level it should reach.
 */
function controlLoop(
  ctx: AudioContext,
  recipe: LoopRecipe,
  level: GainNode,
  sources: AudioScheduledSourceNode[],
  nodes: AudioNode[],
  retune: (intensity: number, at: number) => number,
  intensity: number,
): SfxLoopStop {
  const now = ctx.currentTime;
  level.gain.setValueAtTime(SILENCE, now);
  level.gain.exponentialRampToValueAtTime(Math.max(SILENCE * 2, retune(intensity, now)), now + recipe.fadeIn);

  const id = nextId++;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const release = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const node of nodes) {
      try {
        node.disconnect();
      } catch {
        // already disconnected
      }
    }
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    loops = loops.filter((l) => l.id !== id);
    try {
      const t = ctx.currentTime;
      level.gain.cancelScheduledValues(t);
      level.gain.setValueAtTime(Math.max(SILENCE, level.gain.value), t);
      level.gain.exponentialRampToValueAtTime(SILENCE, t + recipe.fadeOut);
      sources[0].onended = release;
      for (const source of sources) source.stop(t + recipe.fadeOut + 0.05);
      timer = setTimeout(release, (recipe.fadeOut + 2) * 1000);
    } catch {
      release();
    }
  };
  const setIntensity = (value: number) => {
    if (stopped) return;
    try {
      const t = ctx.currentTime;
      const target = retune(value, t);
      level.gain.cancelScheduledValues(t);
      level.gain.setTargetAtTime(Math.max(SILENCE * 2, target), t, 0.12);
    } catch {
      // ignore
    }
  };
  loops.push({ id, stop });
  return Object.assign(stop, { setIntensity });
}

/** A recording looped over its seamless span (`sample.loop`). */
function startSampleLoop(
  ctx: AudioContext,
  b: Bus,
  name: SfxLoopName,
  recipe: LoopRecipe,
  { sample, buffer }: { sample: SfxSample; buffer: AudioBuffer },
  intensity: number,
): SfxLoopStop {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const start = Math.min(Math.max(0, sample.loop?.start ?? 0), buffer.duration);
  const end = Math.min(Math.max(start, sample.loop?.end ?? buffer.duration), buffer.duration);
  source.loopStart = start;
  source.loopEnd = end > start ? end : buffer.duration;
  source.playbackRate.value = sample.rate ?? 1;
  const level = ctx.createGain();
  source.connect(level);
  level.connect(b.categories[recipe.category]);
  const stop = controlLoop(ctx, recipe, level, [source], [source, level], (i) => sampleLoopGain(name, sample, i), intensity);
  source.start(ctx.currentTime, start);
  return stop;
}

/** The synthesised engine: two detuned saws + noise, low-passed, with a flutter. */
function startSynthLoop(ctx: AudioContext, b: Bus, recipe: LoopRecipe, intensity: number): SfxLoopStop {
  const sawA = ctx.createOscillator();
  const sawB = ctx.createOscillator();
  sawA.type = 'sawtooth';
  sawB.type = 'sawtooth';
  sawA.detune.value = -7;
  sawB.detune.value = 7;
  const sawGain = ctx.createGain();
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = b.noise;
  noiseSrc.loop = true;
  const noiseGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.9;
  const flutter = ctx.createGain(); // amplitude flutter of the engine
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  const lfoDepth = ctx.createGain();
  const level = ctx.createGain();

  sawA.connect(sawGain);
  sawB.connect(sawGain);
  sawGain.connect(filter);
  noiseSrc.connect(noiseGain);
  noiseGain.connect(filter);
  filter.connect(flutter);
  lfo.connect(lfoDepth);
  lfoDepth.connect(flutter.gain);
  flutter.connect(level);
  level.connect(b.categories[recipe.category]);

  const apply = (p: LoopParams, at: number, smooth: number) => {
    const set = (param: AudioParam, value: number) => {
      if (smooth > 0) param.setTargetAtTime(value, at, smooth);
      else param.setValueAtTime(value, at);
    };
    set(sawA.frequency, p.oscFreq);
    set(sawB.frequency, p.oscFreq);
    set(sawGain.gain, 0.5 * (1 - p.noiseMix));
    set(noiseGain.gain, p.noiseMix);
    set(filter.frequency, p.cutoff);
    set(lfo.frequency, p.flutterRate);
    set(lfoDepth.gain, p.flutterDepth / 2);
    set(flutter.gain, 1 - p.flutterDepth / 2);
  };
  let first = true;
  const retune = (value: number, at: number) => {
    const params = loopParams(recipe, value);
    apply(params, at, first ? 0 : 0.12);
    first = false;
    return params.gain;
  };

  const sources: AudioScheduledSourceNode[] = [sawA, sawB, noiseSrc, lfo];
  const nodes: AudioNode[] = [...sources, sawGain, noiseGain, filter, flutter, lfoDepth, level];
  const stop = controlLoop(ctx, recipe, level, sources, nodes, retune, intensity);
  const now = ctx.currentTime;
  for (const source of sources) source.start(now);
  return stop;
}

/**
 * Start a looping effect (`slowMo`). Returns its stop function, which can be
 * returned straight from a `useEffect`; `stop.setIntensity(0..1)` changes it live.
 */
export function startSfxLoop(name: SfxLoopName, opts: { intensity?: number } = {}): SfxLoopStop {
  try {
    if (typeof window === 'undefined') return noopLoop();
    const recipe = SFX_LOOPS[name];
    const ctx = peekAudioContext();
    if (!recipe || !ctx || ctx.state === 'closed') return noopLoop();
    preloadSfx();
    const b = ensureBus(ctx);
    while (loops.length >= MAX_LOOPS) loops[0].stop();
    const intensity = opts.intensity ?? 0;
    const recording = sampleFor(name);
    return recording ? startSampleLoop(ctx, b, name, recipe, recording, intensity) : startSynthLoop(ctx, b, recipe, intensity);
  } catch {
    return noopLoop();
  }
}

/** Silence every effect now (e.g. leaving the player). */
export function stopAllSfx(): void {
  try {
    for (const loop of [...loops]) loop.stop();
    const ctx = bus?.ctx;
    if (ctx) for (const voice of [...voices]) cut(voice, ctx);
  } catch {
    // ignore
  }
}

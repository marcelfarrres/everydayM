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
  type SfxCategory,
  type SfxLayer,
  type SfxLoopName,
  type SfxMixState,
  type SfxOneShot,
} from './sfxRecipes';

export type { SfxLoopName, SfxName, SfxOneShot } from './sfxRecipes';

/*
 * Sound effects, synthesised with Web Audio on the app's one AudioContext (see SFX.md).
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

    const vary = variation(recipe.vary);
    const extra = Math.min(1, Math.max(0, opts.gain ?? 1));
    const output = ctx.createGain();
    output.gain.value = recipe.gain * vary.gain * extra;
    output.connect(b.categories[recipe.category]);
    const voice: Voice = { id: nextId++, name, startedAt: clock, output, sources: [], nodes: [], timer: null, pending: 0, done: false };
    voices.push(voice);

    const t0 = ctx.currentTime + 0.005;
    for (const layer of recipe.layers) {
      for (const hit of layerHits(layer)) scheduleHit(ctx, b.noise, voice, layer, t0 + hit.at, hit.gain, vary.pitch);
    }
    // Safety net: if `ended` never fires (context suspended for good), free the nodes anyway.
    voice.timer = setTimeout(() => finish(voice), (recipeDuration(recipe) + 2) * 1000);
  } catch {
    // sound is a bonus: never break the interface
  }
}

function noopLoop(): SfxLoopStop {
  return Object.assign(() => {}, { setIntensity: () => {} });
}

/**
 * Start a looping effect (`engineRumble`, `slowMo`). Returns its stop function, which can be
 * returned straight from a `useEffect`; `stop.setIntensity(0..1)` changes it live.
 */
export function startSfxLoop(name: SfxLoopName, opts: { intensity?: number } = {}): SfxLoopStop {
  try {
    if (typeof window === 'undefined') return noopLoop();
    const recipe = SFX_LOOPS[name];
    const ctx = peekAudioContext();
    if (!recipe || !ctx || ctx.state === 'closed') return noopLoop();
    const b = ensureBus(ctx);
    while (loops.length >= MAX_LOOPS) loops[0].stop();

    let params: LoopParams = loopParams(recipe, opts.intensity ?? 0);
    const now = ctx.currentTime;

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
    apply(params, now, 0);
    level.gain.setValueAtTime(SILENCE, now);
    level.gain.exponentialRampToValueAtTime(Math.max(SILENCE * 2, params.gain), now + recipe.fadeIn);

    const sources: AudioScheduledSourceNode[] = [sawA, sawB, noiseSrc, lfo];
    const nodes: AudioNode[] = [...sources, sawGain, noiseGain, filter, flutter, lfoDepth, level];
    for (const source of sources) source.start(now);

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
        sawA.onended = release;
        for (const source of sources) source.stop(t + recipe.fadeOut + 0.05);
        timer = setTimeout(release, (recipe.fadeOut + 2) * 1000);
      } catch {
        release();
      }
    };
    const setIntensity = (intensity: number) => {
      if (stopped) return;
      try {
        params = loopParams(recipe, intensity);
        const t = ctx.currentTime;
        apply(params, t, 0.12);
        level.gain.cancelScheduledValues(t);
        level.gain.setTargetAtTime(Math.max(SILENCE * 2, params.gain), t, 0.12);
      } catch {
        // ignore
      }
    };
    loops.push({ id, stop });
    return Object.assign(stop, { setIntensity });
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

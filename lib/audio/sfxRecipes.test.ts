import { describe, expect, it } from 'vitest';
import { playSfx, preloadSfx, startSfxLoop, stopAllSfx } from './sfx';
import {
  SFX_LOOPS,
  SFX_MASTER,
  SFX_RECIPES,
  SILENCE,
  envelopeLength,
  envelopePoints,
  isLoop,
  layerHits,
  loopParams,
  recipeDuration,
  sfxAudible,
  sfxBusLevels,
  sfxCategory,
  tooSoon,
  variation,
  voicesToSteal,
  type LoopRecipe,
  type SfxLayer,
  type SfxName,
} from './sfxRecipes';

const ALL: SfxName[] = [...(Object.keys(SFX_RECIPES) as SfxName[]), ...(Object.keys(SFX_LOOPS) as SfxName[])];

describe('sound table', () => {
  it('has every sound the interface needs, with the right category', () => {
    expect(ALL.sort()).toEqual(
      [
        'banner',
        'beep',
        'beepFinal',
        'boost',
        'buttonThunk',
        'clack',
        'drumClick',
        'drumHit',
        'drumRoll',
        'error',
        'ignite',
        'land',
        'ladderStep',
        'launch',
        'metalStep',
        'pam',
        'separate',
        'slowMo',
        'towerDock',
      ].sort(),
    );
    expect(sfxCategory('beep')).toBe('alert');
    expect(sfxCategory('beepFinal')).toBe('alert');
    for (const name of ALL.filter((n) => n !== 'beep' && n !== 'beepFinal')) expect(sfxCategory(name)).toBe('ambient');
    expect(isLoop('slowMo')).toBe(true);
    expect(isLoop('pam')).toBe(false);
  });

  it('keeps every level conservative and every sound short', () => {
    for (const recipe of Object.values(SFX_RECIPES)) {
      expect(recipe.gain).toBeGreaterThan(0);
      expect(recipe.gain).toBeLessThanOrEqual(0.5);
      expect(recipe.maxVoices).toBeGreaterThanOrEqual(1);
      expect(recipeDuration(recipe)).toBeLessThan(1.2);
      for (const layer of recipe.layers) {
        expect(layer.gain).toBeGreaterThan(0);
        expect(layer.gain).toBeLessThanOrEqual(1);
        expect(layer.freq).toBeGreaterThan(0);
      }
    }
    for (const loop of Object.values(SFX_LOOPS)) {
      expect(loop.high.gain).toBeLessThanOrEqual(0.3);
      expect(loop.low.gain).toBeGreaterThan(0);
    }
  });

  it('makes the final beep higher and longer than the others', () => {
    const beep = SFX_RECIPES.beep.layers[0];
    const final = SFX_RECIPES.beepFinal.layers[0];
    expect(final.freq).toBeGreaterThan(beep.freq);
    expect(recipeDuration(SFX_RECIPES.beepFinal)).toBeGreaterThan(recipeDuration(SFX_RECIPES.beep));
  });

  it("makes the creator's error buzzer low and rough, never like the 3-2-1", () => {
    const error = SFX_RECIPES.error;
    for (const layer of error.layers) {
      expect(layer.kind).toBe('tone');
      expect(layer.freq).toBeLessThan(SFX_RECIPES.beep.layers[0].freq / 4);
      if (layer.kind === 'tone') expect(layer.wave).not.toBe('sine');
    }
    expect(recipeDuration(error)).toBeLessThan(0.4);
  });

  it("keeps the rocket base's sounds quiet, short and unlike the 3-2-1", () => {
    const base = ['drumClick', 'metalStep', 'ladderStep', 'buttonThunk', 'towerDock'] as const;
    for (const name of base) {
      const recipe = SFX_RECIPES[name];
      expect(recipe.category).toBe('ambient');
      // ambience: under the joke's buzzer and the ignition
      expect(recipe.gain).toBeLessThanOrEqual(SFX_RECIPES.error.gain);
      expect(recipeDuration(recipe)).toBeLessThan(0.35);
      // no clean sine anywhere near the beeps' pitch
      for (const layer of recipe.layers) {
        if (layer.kind === 'tone' && layer.wave === 'sine') expect(layer.freq).toBeLessThan(SFX_RECIPES.beep.layers[0].freq / 4);
      }
    }
    // the ticks and the steps are the quietest, and the ratchet can't machine-gun
    for (const soft of ['drumClick', 'metalStep', 'ladderStep'] as const) expect(SFX_RECIPES[soft].gain).toBeLessThan(SFX_RECIPES.buttonThunk.gain);
    expect(SFX_RECIPES.drumClick.minGap).toBeGreaterThanOrEqual(0.07);
  });

  it('synthesises the end drums when their files are missing: a roll that trembles and grows, a hit that rings', () => {
    const roll = SFX_LOOPS.drumRoll;
    expect(isLoop('drumRoll')).toBe(true);
    expect(isLoop('drumHit')).toBe(false);
    // only noise, trembling like sticks on a snare (10–25 strokes a second)
    for (const p of [roll.low, roll.high]) {
      expect(p.noiseMix).toBe(1);
      expect(p.flutterRate).toBeGreaterThanOrEqual(10);
      expect(p.flutterRate).toBeLessThanOrEqual(25);
      expect(p.flutterDepth).toBeGreaterThan(0.5);
    }
    // a crescendo, and it gives way to the hit almost at once
    expect(roll.high.gain).toBeGreaterThan(roll.low.gain);
    expect(roll.fadeOut).toBeLessThanOrEqual(0.1);
    // the hit outlasts the other one-shots (a cymbal rings) but stays under the limit
    expect(recipeDuration(SFX_RECIPES.drumHit)).toBeGreaterThan(recipeDuration(SFX_RECIPES.pam));
    expect(SFX_RECIPES.drumHit.maxVoices).toBe(1);
  });

  it('has no repair sounds: the crew works in silence (their hits were confused with the 3-2-1)', () => {
    for (const name of ['hammer', 'ratchet', 'puff', 'engineRumble']) expect(ALL).not.toContain(name);
  });
});

describe('sfxBusLevels', () => {
  it('follows the music volume and mute', () => {
    expect(sfxBusLevels({ volume: 1, muted: false, talkSpeaking: false }).master).toBeCloseTo(SFX_MASTER);
    expect(sfxBusLevels({ volume: 0.5, muted: false, talkSpeaking: false }).master).toBeCloseTo(SFX_MASTER / 2);
    expect(sfxBusLevels({ volume: 1, muted: true, talkSpeaking: false }).master).toBe(0);
    expect(sfxBusLevels({ volume: 7, muted: false, talkSpeaking: false }).master).toBeCloseTo(SFX_MASTER);
    expect(sfxBusLevels({ volume: Number.NaN, muted: false, talkSpeaking: false }).master).toBe(0);
  });

  it('silences only the ambient sounds under a talk', () => {
    const levels = sfxBusLevels({ volume: 0.8, muted: false, talkSpeaking: true });
    expect(levels.ambient).toBe(0);
    expect(levels.alert).toBe(1);
    expect(sfxAudible('alert', { volume: 0.8, muted: false, talkSpeaking: true })).toBe(true);
    expect(sfxAudible('ambient', { volume: 0.8, muted: false, talkSpeaking: true })).toBe(false);
    expect(sfxAudible('ambient', { volume: 0.8, muted: false, talkSpeaking: false })).toBe(true);
    expect(sfxAudible('alert', { volume: 0, muted: false, talkSpeaking: false })).toBe(false);
    expect(sfxAudible('alert', { volume: 1, muted: true, talkSpeaking: false })).toBe(false);
  });
});

describe('envelopes', () => {
  it('goes silence → peak → hold → silence', () => {
    const points = envelopePoints({ attack: 0.01, hold: 0.05, decay: 0.1 }, 0.5);
    expect(points.map((p) => p.value)).toEqual([SILENCE, 0.5, 0.5, SILENCE]);
    expect(points.map((p) => p.time)).toEqual([0, 0.01, expect.closeTo(0.06), expect.closeTo(0.16)]);
    expect(envelopeLength({ attack: 0.01, hold: 0.05, decay: 0.1 })).toBeCloseTo(0.16);
  });

  it('never asks Web Audio to ramp to zero or backwards', () => {
    const points = envelopePoints({ attack: 0, decay: 0 }, 0);
    for (const p of points) expect(p.value).toBeGreaterThan(0);
    for (let i = 1; i < points.length; i++) expect(points[i].time).toBeGreaterThanOrEqual(points[i - 1].time);
  });

  it('spreads repeats and fades them', () => {
    const layer: SfxLayer = {
      kind: 'noise',
      filter: 'highpass',
      freq: 3000,
      at: 0.1,
      gain: 1,
      env: { attack: 0.001, decay: 0.01 },
      repeat: { count: 3, every: 0.05, fade: 0.5 },
    };
    expect(layerHits(layer)).toEqual([
      { at: 0.1, gain: 1 },
      { at: expect.closeTo(0.15), gain: 0.5 },
      { at: expect.closeTo(0.2), gain: 0.25 },
    ]);
  });
});

describe('variation', () => {
  it('stays within ± the pitch range and never gets louder', () => {
    for (const r of [0, 0.25, 0.5, 0.99]) {
      const v = variation({ pitch: 2, gain: 0.3 }, () => r);
      expect(v.pitch).toBeGreaterThanOrEqual(2 ** (-2 / 12) - 1e-9);
      expect(v.pitch).toBeLessThanOrEqual(2 ** (2 / 12) + 1e-9);
      expect(v.gain).toBeLessThanOrEqual(1);
      expect(v.gain).toBeGreaterThanOrEqual(0.7);
    }
    expect(variation(undefined)).toEqual({ pitch: 1, gain: 1 });
  });
});

describe('loopParams', () => {
  it('grows a loop with intensity, between its low and high', () => {
    const grows: LoopRecipe = {
      category: 'ambient',
      low: { gain: 0.05, oscFreq: 42, cutoff: 160, noiseMix: 0.35, flutterRate: 7, flutterDepth: 0.25 },
      high: { gain: 0.22, oscFreq: 68, cutoff: 520, noiseMix: 0.55, flutterRate: 16, flutterDepth: 0.35 },
      fadeIn: 0.3,
      fadeOut: 0.35,
    };
    const quiet = loopParams(grows, 0);
    const mid = loopParams(grows, 0.5);
    const loud = loopParams(grows, 1);
    expect(quiet).toEqual(grows.low);
    expect(loud).toEqual(grows.high);
    expect(mid.gain).toBeGreaterThan(quiet.gain);
    expect(mid.gain).toBeLessThan(loud.gain);
    expect(mid.cutoff).toBeGreaterThan(quiet.cutoff);
    expect(loopParams(grows, 5)).toEqual(loud);
    expect(loopParams(grows, -1)).toEqual(quiet);
  });
});

describe('voicesToSteal', () => {
  const v = (id: number, name: SfxName, startedAt: number) => ({ id, name, startedAt });

  it('cuts the oldest of the same sound beyond its limit', () => {
    const active = [v(1, 'clack', 1), v(2, 'clack', 2), v(3, 'pam', 0)];
    expect(voicesToSteal(active, 'clack', 2, 8)).toEqual([1]);
    expect(voicesToSteal(active, 'pam', 2, 8)).toEqual([]);
  });

  it('cuts the oldest overall beyond the total', () => {
    const active = [v(1, 'clack', 3), v(2, 'pam', 1), v(3, 'banner', 2)];
    expect(voicesToSteal(active, 'beep', 2, 3)).toEqual([2]);
    expect(voicesToSteal(active, 'beep', 2, 4)).toEqual([]);
  });
});

describe('tooSoon', () => {
  it('ignores a repeat inside the gap', () => {
    expect(tooSoon(undefined, 5, 0.1)).toBe(false);
    expect(tooSoon(5, 5.05, 0.1)).toBe(true);
    expect(tooSoon(5, 5.2, 0.1)).toBe(false);
  });
});

describe('without Web Audio (server)', () => {
  it('does nothing and never throws', () => {
    expect(() => playSfx('beep')).not.toThrow();
    expect(() => playSfx('ignite', { gesture: true })).not.toThrow();
    const stop = startSfxLoop('slowMo', { intensity: 0.3 });
    expect(() => stop.setIntensity(1)).not.toThrow();
    expect(() => stop()).not.toThrow();
    const slow = startSfxLoop('slowMo');
    expect(() => slow()).not.toThrow();
    const roll = startSfxLoop('drumRoll', { intensity: 0 });
    expect(() => roll.setIntensity(1)).not.toThrow();
    expect(() => roll()).not.toThrow();
    expect(() => playSfx('drumHit')).not.toThrow();
    expect(() => preloadSfx()).not.toThrow();
    expect(() => stopAllSfx()).not.toThrow();
  });
});

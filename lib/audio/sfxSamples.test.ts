import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SFX_LOOPS, SFX_RECIPES, type SfxName } from './sfxRecipes';
import { SFX_SAMPLES, SFX_SAMPLE_DIR, sampleLoopGain, sampleUrl } from './sfxSamples';

const PUBLIC_SFX = path.join(process.cwd(), 'public', 'sfx');
const entries = Object.entries(SFX_SAMPLES) as [SfxName, NonNullable<(typeof SFX_SAMPLES)[SfxName]>][];
/** The first screen's rocket base: ambience, quieter than everything else. */
const BASE = ['drumClick', 'metalStep', 'ladderStep', 'buttonThunk', 'towerDock'] as const;

describe('recorded effects', () => {
  it('records every sound the user kept, and leaves the 3-2-1 synthesised', () => {
    expect(entries.map(([name]) => name).sort()).toEqual(
      [
        'banner',
        'boost',
        'buttonThunk',
        'clack',
        'drumClick',
        'drumHit',
        'drumRoll',
        'error',
        'ignite',
        'ladderStep',
        'land',
        'launch',
        'metalStep',
        'pam',
        'separate',
        'slowMo',
        'towerDock',
      ].sort(),
    );
    for (const name of ['beep', 'beepFinal'] as const) expect(SFX_SAMPLES[name]).toBeUndefined();
    // every recording still has its recipe to fall back on
    for (const [name] of entries) expect(name in SFX_RECIPES || name in SFX_LOOPS).toBe(true);
  });

  it('names each file after its sound and serves it from the app itself', () => {
    for (const [name, sample] of entries) {
      expect(sample.file).toBe(`${name}.mp3`);
      expect(sampleUrl(sample)).toBe(`/sfx/${name}.mp3`);
    }
    expect(SFX_SAMPLE_DIR).toBe('/sfx/');
  });

  it('has every file in public/sfx, small', () => {
    let total = 0;
    for (const [, sample] of entries) {
      const file = path.join(PUBLIC_SFX, sample.file);
      expect(fs.existsSync(file), sample.file).toBe(true);
      const size = fs.statSync(file).size;
      expect(size).toBeLessThan(100 * 1024);
      total += size;
    }
    expect(total).toBeLessThan(1.2 * 1024 * 1024);
  });

  it('keeps the levels in range: flight above the thud, the clicks lowest', () => {
    for (const [, sample] of entries) {
      expect(sample.gain).toBeGreaterThan(0);
      expect(sample.gain).toBeLessThanOrEqual(1);
      expect(sample.rate ?? 1).toBeGreaterThan(0);
    }
    const gain = (name: SfxName) => SFX_SAMPLES[name]?.gain ?? 0;
    for (const loud of ['launch', 'boost', 'land', 'separate'] as const) {
      expect(gain(loud)).toBeGreaterThan(gain('pam'));
    }
    const base: readonly SfxName[] = BASE;
    for (const click of ['banner', 'clack'] as const) {
      for (const other of entries.filter(([n]) => n !== 'banner' && n !== 'clack' && !base.includes(n))) {
        expect(gain(click)).toBeLessThan(other[1].gain);
      }
    }
  });

  it("keeps the rocket base's recordings as quiet ambience: under the clicks and the buzzer", () => {
    const gain = (name: SfxName) => SFX_SAMPLES[name]?.gain ?? 0;
    for (const name of BASE) {
      expect(SFX_RECIPES[name].category).toBe('ambient');
      expect(gain(name)).toBeGreaterThan(0);
      expect(gain(name)).toBeLessThan(Math.min(gain('banner'), gain('clack'), gain('error')));
      // short files (the tower's clank is the longest, under half a second): a few KB each
      expect(fs.statSync(path.join(PUBLIC_SFX, `${name}.mp3`)).size).toBeLessThan(12 * 1024);
    }
    // the ratchet and the steps repeat fast: quieter than the button and the tower
    for (const soft of ['drumClick', 'metalStep', 'ladderStep'] as const) {
      for (const hard of ['buttonThunk', 'towerDock'] as const) expect(gain(soft)).toBeLessThan(gain(hard));
    }
  });

  it('loops slowMo over a span inside its file, at a level that follows the recipe', () => {
    const slow = SFX_SAMPLES.slowMo;
    expect(slow?.loop).toBeDefined();
    expect(slow!.loop!.start).toBeGreaterThanOrEqual(0);
    expect(slow!.loop!.end).toBeGreaterThan(slow!.loop!.start + 1);
    // slowMo's recipe has the same level at every intensity: so does the recording
    expect(sampleLoopGain('slowMo', slow!, 0)).toBeCloseTo(slow!.gain);
    expect(sampleLoopGain('slowMo', slow!, 1)).toBeCloseTo(slow!.gain);
    expect(sampleLoopGain('slowMo', slow!, Number.NaN)).toBeCloseTo(slow!.gain);
  });

  it('has the end screen drums: a roll that loops inside its file and grows, and a crash', () => {
    const roll = SFX_SAMPLES.drumRoll;
    const hit = SFX_SAMPLES.drumHit;
    expect(roll?.loop).toBeDefined();
    expect(hit?.loop).toBeUndefined();
    // the file is a little over 10.5 s: the span stays inside it and covers the longest roll (~9 s) without looping
    expect(roll!.loop!.start).toBeGreaterThanOrEqual(0);
    expect(roll!.loop!.end).toBeLessThanOrEqual(10.5);
    expect(roll!.loop!.end - roll!.loop!.start).toBeGreaterThan(9.5);
    // it grows with its intensity, as the synthesised roll does
    expect(sampleLoopGain('drumRoll', roll!, 0)).toBeLessThan(sampleLoopGain('drumRoll', roll!, 1));
    expect(sampleLoopGain('drumRoll', roll!, 1)).toBeCloseTo(roll!.gain);
    // both small enough for a phone (< 120 KB each)
    for (const sample of [roll!, hit!]) expect(fs.statSync(path.join(PUBLIC_SFX, sample.file)).size).toBeLessThan(120 * 1024);
  });
});

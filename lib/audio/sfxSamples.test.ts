import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SFX_LOOPS, SFX_RECIPES, type SfxName } from './sfxRecipes';
import { SFX_SAMPLES, SFX_SAMPLE_DIR, sampleLoopGain, sampleUrl } from './sfxSamples';

const PUBLIC_SFX = path.join(process.cwd(), 'public', 'sfx');
const entries = Object.entries(SFX_SAMPLES) as [SfxName, NonNullable<(typeof SFX_SAMPLES)[SfxName]>][];

describe('recorded effects', () => {
  it('records every sound the user kept, and leaves the 3-2-1 synthesised', () => {
    expect(entries.map(([name]) => name).sort()).toEqual(
      ['banner', 'boost', 'clack', 'ignite', 'land', 'launch', 'pam', 'separate', 'slowMo'].sort(),
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
    for (const click of ['banner', 'clack'] as const) {
      for (const other of entries.filter(([n]) => n !== 'banner' && n !== 'clack')) expect(gain(click)).toBeLessThan(other[1].gain);
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
});

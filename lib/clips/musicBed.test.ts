import { describe, expect, it } from 'vitest';
import { planMusicBed } from './musicBed';

describe('planMusicBed', () => {
  it('loops the list until the crossfaded sum covers the video', () => {
    const { order, crossfade } = planMusicBed([100, 60], 300);
    expect(crossfade).toBe(3);
    // 100 + 57 + 97 + 57 = 311 ≥ 300.5
    expect(order).toEqual([0, 1, 0, 1]);
  });

  it('repeats a single track and skips unusable ones', () => {
    expect(planMusicBed([0, 40], 90).order).toEqual([1, 1, 1]);
  });

  it('returns nothing without music', () => {
    expect(planMusicBed([], 120).order).toEqual([]);
    expect(planMusicBed([1], 120).order).toEqual([]);
  });

  it('shortens the crossfade for very short tracks', () => {
    expect(planMusicBed([6], 20).crossfade).toBe(2);
  });
});

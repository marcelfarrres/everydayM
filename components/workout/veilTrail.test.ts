import { describe, expect, it } from 'vitest';
import { VEIL_WORDS, trailProgressAt, trailPuffs, trailShape, veilHandOffMs, veilWordsInMs } from '@/components/workout/veilTrail';

describe('the white screen: the hold', () => {
  it('holds the words 2 s once they are all in (also with reduced motion)', () => {
    for (const lines of [1, 2]) {
      for (const reduced of [false, true]) {
        const leavesAt = veilHandOffMs(lines, reduced) + VEIL_WORDS.leaveDelayMs;
        expect(leavesAt - veilWordsInMs(lines, reduced)).toBe(2000);
      }
    }
    expect(veilWordsInMs(2)).toBe(720);
    expect(veilWordsInMs(2, true)).toBe(0);
  });
});

describe('the white screen: the smoke leaves like a trail fading from the pad up', () => {
  const steps = Array.from({ length: 101 }, (_, i) => i / 100);

  it('the cleared edge only moves up; the trail only narrows', () => {
    let prev = trailShape(0);
    for (const p of steps.slice(1)) {
      const s = trailShape(p);
      expect(s.edge).toBeLessThanOrEqual(prev.edge);
      expect(s.width).toBeLessThanOrEqual(prev.width + 1e-12);
      expect(s.top).toBeLessThanOrEqual(prev.top + 1e-12);
      expect(s.top).toBeLessThanOrEqual(s.width + 1e-12);
      expect(s.opacity).toBeLessThanOrEqual(prev.opacity);
      prev = s;
    }
  });

  it('starts all white, below the screen, and ends all clear', () => {
    expect(trailShape(0)).toMatchObject({ width: 1, top: 1, opacity: 1 });
    expect(trailShape(0).edge).toBeGreaterThanOrEqual(1);
    const end = trailShape(1);
    expect(end.edge).toBeLessThanOrEqual(0);
    expect(end.width).toBe(0);
    expect(end.top).toBe(0);
    expect(end.opacity).toBe(0);
    const { puffs, core } = trailPuffs(1, 390, 844);
    expect(puffs.every((p) => p.r === 0)).toBe(true);
    expect(core.w).toBe(0);
  });

  it('at 0 the puffs and the middle cover the whole screen', () => {
    const W = 390;
    const H = 844;
    const { puffs, core } = trailPuffs(0, W, H);
    // (a point is white when inside the middle band or within 60 % of a puff's radius)
    for (let x = 0; x <= W; x += 13) {
      for (let y = 0; y <= H; y += 13) {
        const inCore = x >= core.x && x <= core.x + core.w && y >= core.y && y <= core.y + core.h;
        const inPuff = puffs.some((p) => Math.hypot(p.x - x, p.y - y) <= 0.6 * p.r);
        expect(inCore || inPuff).toBe(true);
      }
    }
  });

  it('halfway it has cleared the bottom half or so, and nothing is left below the edge', () => {
    const H = 844;
    const s = trailShape(0.5);
    expect(s.edge).toBeGreaterThan(0.4);
    expect(s.edge).toBeLessThan(0.7);
    const { puffs } = trailPuffs(0.5, 390, H);
    // (the puffs' solid cores end at the cleared edge)
    for (const p of puffs) expect(p.y + 0.6 * p.r).toBeLessThanOrEqual(s.edge * H + 0.15 * p.r + 1e-6);
  });

  it('finds when the edge reaches a height', () => {
    for (const e of [0.9, 0.6, 0.3]) expect(trailShape(trailProgressAt(e)).edge).toBeCloseTo(e, 6);
  });
});

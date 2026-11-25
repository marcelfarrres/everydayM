import { describe, expect, it } from 'vitest';
import { END_ROCKET, endFrame, endShip } from './endRocket';

describe('endFrame', () => {
  it('fits the finished rocket across the screen, its stages never shorter or longer than allowed', () => {
    for (const vw of [320, 390, 430]) {
      for (let n = 1; n <= 6; n++) {
        const { frame, seg } = endFrame(vw, n);
        expect(seg).toBeGreaterThanOrEqual(END_ROCKET.SEG_MIN);
        expect(seg).toBeLessThanOrEqual(END_ROCKET.SEG_MAX);
        if (n <= 5) expect(frame).toBeLessThanOrEqual(vw - 2 * END_ROCKET.SIDE);
      }
    }
  });
});

describe('endShip', () => {
  const { frame, seg } = endFrame(390, 4);

  it('arrives as the nose and its last stage, centred', () => {
    const { g, shift } = endShip(frame, 4, 1, false);
    expect(g.segments.map((s) => s.block)).toEqual([4]);
    expect(g.segments[0].end - g.segments[0].start).toBeCloseTo(seg, 0);
    expect(g.boosters).toBeNull();
    expect(shift).toBeLessThan(0);
  });

  it('carries the boosters on that same stage, wherever the tail is', () => {
    const one = endShip(frame, 4, 1, true).g;
    const all = endShip(frame, 4, 4, true).g;
    expect(one.boosters).not.toBeNull();
    expect(all.boosters).toEqual(one.boosters);
    const front = all.segments.at(-1)!;
    expect(all.boosters!.x0).toBeGreaterThanOrEqual(front.start);
    expect(all.boosters!.x1).toBeLessThanOrEqual(front.end);
  });

  it('adds each stage at the tail, the others staying where they were, and is centred once complete', () => {
    const two = endShip(frame, 4, 2, false).g;
    const three = endShip(frame, 4, 3, false).g;
    expect(three.segments.map((s) => s.block)).toEqual([2, 3, 4]);
    expect(three.segments.slice(1)).toEqual(two.segments);
    expect(endShip(frame, 4, 4, false).shift).toBeCloseTo(0);
  });

  it('keeps the boosters of a short stage on it too', () => {
    const small = endFrame(320, 6);
    const g = endShip(small.frame, 6, 6, true).g;
    const front = g.segments.at(-1)!;
    expect(g.boosters!.x1).toBeLessThanOrEqual(front.end);
  });
});

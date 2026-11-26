import { describe, expect, it } from 'vitest';
import { END_ROCKET, boosterSlide, endFrame, endShip } from './endRocket';
import { stackGeometry } from './rocketShape';

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

  it('puts the boosters on the tail end, and the finished rocket is the routine’s rocket at its start', () => {
    for (let on = 1; on <= 4; on++) {
      const g = endShip(frame, 4, on, true).g;
      // (just in from the tail: the new drawing's boosters start a fifth of the body's thickness in)
      expect(g.boosters!.x0).toBeCloseTo(g.x0 + 0.2 * g.T, 5);
      expect(g.boosters!.x1).toBeLessThanOrEqual(g.xs);
      // while the boosters are on, no fins
      expect(g.fins).toBeNull();
    }
    expect(endShip(frame, 4, 2, false).g.fins).not.toBeNull();
    // complete: exactly where the routine's rocket had them (along the tail half of the whole rocket)
    expect(endShip(frame, 4, 4, true).g.boosters).toEqual(stackGeometry({ width: frame, blocks: 4, boosters: true }).boosters);
  });

  it('slides the boosters back to the new tail as each stage joins', () => {
    expect(boosterSlide(frame, 4, 1)).toBeNull();
    for (let on = 2; on <= 4; on++) {
      const slide = boosterSlide(frame, 4, on)!;
      const dx = Number(/translateX\((-?[\d.]+)px\)/.exec(slide.from)![1]);
      // (they were further forward: a stage's length)
      expect(dx).toBeCloseTo(seg, 0);
    }
  });

  it('adds each stage at the tail, the others staying where they were, and is centred once complete', () => {
    const two = endShip(frame, 4, 2, false).g;
    const three = endShip(frame, 4, 3, false).g;
    expect(three.segments.map((s) => s.block)).toEqual([2, 3, 4]);
    // (where they are; what is written in them moves off the tail's livery, which the new tail now wears)
    const at = (g: typeof two) => g.segments.map((s) => ({ block: s.block, start: s.start, end: s.end }));
    expect(at(three).slice(1)).toEqual(at(two));
    expect(three.segments[0].content.left).toBeGreaterThan(three.livery.end);
    expect(endShip(frame, 4, 4, false).shift).toBeCloseTo(0);
  });

  it('keeps the boosters of a short one-stage rocket short of its nose', () => {
    const small = endFrame(320, 6);
    const g = endShip(small.frame, 6, 1, true).g;
    expect(g.boosters!.x1).toBeLessThanOrEqual(g.xs);
  });
});

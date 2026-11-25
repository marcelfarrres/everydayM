import { describe, expect, it } from 'vitest';
import { REST_FLIGHT, flyInKeyframes, offEdge, poseTransform, restPeriodMs, restPose, type FlightBox } from './endFlight';

const BOX: FlightBox = { vw: 390, vh: 844, park: { x: 195, y: 160 }, len: 358 };
const SMALL: FlightBox = { vw: 320, vh: 568, park: { x: 160, y: 120 }, len: 288 };
const cycle = REST_FLIGHT.passMs + REST_FLIGHT.gapMs;
const onScreen = (box: FlightBox, x: number) => x > -offEdge(box) + 1 && x < box.vw + offEdge(box) - 1;

describe('restPose', () => {
  it('starts parked, level, full size', () => {
    expect(restPose(0, BOX)).toEqual({ x: 195, y: 160, angle: 0, flip: 1, scale: 1, bank: 1 });
    expect(restPose(-50, BOX).x).toBe(195);
  });

  it('takes off to the right and leaves the screen, growing smaller', () => {
    const end = restPose(REST_FLIGHT.takeoffMs - 1, BOX);
    expect(end.x).toBeGreaterThan(BOX.vw + offEdge(BOX) - 5);
    expect(end.scale).toBeCloseTo(REST_FLIGHT.scale, 1);
    // speeding up: it covers more ground in its second half
    const mid = restPose(REST_FLIGHT.takeoffMs / 2, BOX);
    expect(mid.x - BOX.park.x).toBeLessThan(end.x - mid.x);
  });

  it.each([
    ['big phone', BOX],
    ['small phone', SMALL],
  ])('%s: each pass crosses from beyond one edge to beyond the other, below the title, banking in its turns', (_, box) => {
    for (let pass = 0; pass < 3; pass++) {
      const begin = REST_FLIGHT.takeoffMs + pass * cycle + REST_FLIGHT.gapMs;
      const first = restPose(begin, box);
      const last = restPose(begin + REST_FLIGHT.passMs - 1, box);
      expect(onScreen(box, first.x)).toBe(false);
      expect(onScreen(box, last.x)).toBe(false);
      // one edge to the other, the nose (mirrored or not) in the direction it flies
      expect(Math.sign(last.x - first.x)).toBe(first.flip);
      let prev = first;
      for (let t = begin; t < begin + REST_FLIGHT.passMs; t += 40) {
        const p = restPose(t, box);
        expect(p.y).toBeGreaterThanOrEqual(box.vh * REST_FLIGHT.top - 0.5);
        expect(p.y).toBeLessThanOrEqual(box.vh * REST_FLIGHT.bottom + 0.5);
        expect(Math.abs(p.angle)).toBeLessThan(75);
        expect(p.bank).toBeGreaterThanOrEqual(1 - REST_FLIGHT.bankMax);
        expect(p.bank).toBeLessThanOrEqual(1);
        // smooth: never a jump within a pass
        expect(Math.hypot(p.x - prev.x, p.y - prev.y)).toBeLessThan(30);
        expect(Math.abs(p.angle - prev.angle)).toBeLessThan(8);
        prev = p;
      }
    }
  });

  it('flies the same loop again and again', () => {
    const t = REST_FLIGHT.takeoffMs + 1234;
    expect(restPose(t + restPeriodMs(), BOX)).toEqual(restPose(t, BOX));
    expect(restPose(t + 5 * restPeriodMs(), BOX)).toEqual(restPose(t, BOX));
  });

  it('is out of sight between two passes', () => {
    for (let pass = 0; pass < 3; pass++) {
      const gap = REST_FLIGHT.takeoffMs + pass * cycle + REST_FLIGHT.gapMs / 2;
      expect(onScreen(BOX, restPose(gap, BOX).x)).toBe(false);
    }
  });

  it('banks: squashes across in a turn, not on a straight line', () => {
    let tightest = 1;
    for (let t = REST_FLIGHT.takeoffMs; t < REST_FLIGHT.takeoffMs + restPeriodMs(); t += 50) tightest = Math.min(tightest, restPose(t, BOX).bank);
    expect(tightest).toBeLessThan(0.9);
  });
});

describe('poseTransform', () => {
  it('moves from the parking place, turns, mirrors and squashes', () => {
    expect(poseTransform({ x: 205, y: 150, angle: 12.345, flip: -1, scale: 0.6, bank: 0.8 }, { x: 195, y: 160 })).toBe(
      'translate(10px, -10px) rotate(12.35deg) scale(-0.6, 0.48)',
    );
    expect(poseTransform(restPose(0, BOX), BOX.park)).toBe('translate(0px, 0px) rotate(0deg) scale(1, 1)');
  });
});

describe('flyInKeyframes', () => {
  it('comes in from beyond the top left and lands in its place, level', () => {
    const keys = flyInKeyframes(BOX);
    expect(keys[0].offset).toBe(0);
    expect(keys.at(-1)).toEqual({ offset: 1, transform: 'translate(0px, 0px) rotate(0deg)' });
    const [, x, y] = /translate\((-?\d+)px, (-?\d+)px\)/.exec(String(keys[0].transform))!.map(Number);
    // its far end out of the left edge, all of it above the top
    expect(BOX.park.x + x + BOX.len / 2).toBeLessThan(0);
    expect(BOX.park.y + y).toBeLessThan(-50);
  });
});

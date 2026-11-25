import { describe, expect, it } from 'vitest';
import { SEPARATION as S } from './rocketFlight';
import { SEPARATION_PUFFS, crewAt, crewEnter, pieceAt, puffAt, track } from './separation';

const OFF = 160;
const FALL = 320;

describe('the separation, as poses of the clouds\' clock', () => {
  it('interpolates between moments and holds before and after', () => {
    const keys: [number, number][] = [
      [100, 0],
      [200, 10],
    ];
    expect(track(keys, 0)).toBe(0);
    expect(track(keys, 150)).toBe(5);
    expect(track(keys, 999)).toBe(10);
  });

  it('the mechanics: in from the left edge once the badge is home, at work, gone before the part falls alone', () => {
    expect(crewAt(S.crewInMs - 1, OFF).a.shown).toBe(false);
    expect(crewAt(S.crewInMs, OFF).b.x).toBe(-OFF);
    for (const who of ['a', 'b'] as const) {
      const { to } = crewEnter(who);
      // at their place from the end of their way in until they step back
      for (let t = to; t < S.crewOutMs; t += 10) expect(Math.abs(crewAt(t, OFF)[who].x)).toBeLessThanOrEqual(3);
      // never right of their place by more than the brake (the words are on the right)
      for (let t = S.crewInMs; t < S.crewGoneMs + 100; t += 10) expect(crewAt(t, OFF)[who].x).toBeLessThanOrEqual(5);
    }
    expect(crewAt(S.crewGoneMs - 1, OFF).a.x).toBeLessThan(-OFF * 0.9);
    expect(crewAt(S.crewGoneMs + 40, OFF).b.shown).toBe(false);
    expect(S.crewGoneMs).toBeLessThanOrEqual(S.releaseMs + S.creepMs);
  });

  it('the wrench turns at the latch before the hammer winds up; the blow lands at the release', () => {
    for (const s of S.turnsMs) expect(crewAt(s, OFF).b.arm).toBeGreaterThan(crewAt(s - 45, OFF).b.arm + 20);
    expect(crewAt(S.turnsMs[1] + 140, OFF).a.arm).toBe(-55);
    expect(crewAt(S.releaseMs - 40, OFF).a.arm).toBeLessThan(-160);
    expect(crewAt(S.releaseMs, OFF).a.arm).toBe(-62);
    // they turn round to leave
    expect(crewAt(S.crewOutMs, OFF).a.face).toBe(1);
    expect(crewAt(S.crewGoneMs - 100, OFF).a.face).toBe(-1);
  });

  it('the part: unseen until the blow, comes loose, then falls slowly out of the bottom, tumbling a little', () => {
    expect(pieceAt(S.releaseMs - 1, FALL).shown).toBe(false);
    const loose = pieceAt(S.releaseMs + S.creepMs, FALL);
    expect(loose.x).toBeGreaterThanOrEqual(-6);
    let prev = 0;
    for (let t = S.releaseMs; t < S.releaseMs + S.fallMs; t += 20) {
      const p = pieceAt(t, FALL);
      expect(p.shown).toBe(true);
      expect(p.x).toBeLessThanOrEqual(prev);
      expect(Math.abs(p.rot)).toBeLessThanOrEqual(16);
      prev = p.x;
    }
    expect(prev).toBeLessThan(-FALL * 0.9);
    expect(pieceAt(S.releaseMs + S.fallMs, FALL).shown).toBe(false);
    // calm: it only fades where it is
    const calm = pieceAt(S.releaseMs + S.fallMs / 2, FALL, true);
    expect([calm.x, calm.y, calm.rot]).toEqual([0, 0, 0]);
    expect(calm.opacity).toBeCloseTo(0.5);
  });

  it('smoke: at the latch as it gives, one for each try of the engine (none with reduced motion)', () => {
    expect(SEPARATION_PUFFS.filter((p) => p.from === 'tail').map((p) => p.at)).toEqual([S.sputtersMs[0] + 40, S.sputtersMs[1] + 40, S.catchMs + 30]);
    for (const puff of SEPARATION_PUFFS) {
      expect(puffAt(puff, puff.at - 1).opacity).toBe(0);
      expect(puffAt(puff, puff.at + puff.life * 0.2).opacity).toBe(1);
      expect(puffAt(puff, puff.at + puff.life * 0.2, true).opacity).toBe(0);
      // all gone before the rocket leaves
      expect(puff.at + puff.life).toBeLessThanOrEqual(S.liftMs + 600);
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  CREW,
  barRoof,
  boardingPlan,
  HOP,
  crewAirTarget,
  crewLift,
  hopMode,
  stepAir,
  crewFacing,
  crewMode,
  crewMove,
  crewPoint,
  onRoof,
  remapOnTrack,
  roofSpot,
  roofStands,
  stepSoundDue,
  stepsCrossed,
  trackEnd,
  trackPath,
  trackSpans,
  travelMs,
  type CrewTrack,
} from './padCrew';

const track: CrewTrack = { hatchX: 250, ladderX: 340, deckY: 100, ladderTop: 24, standA: 30, standB: 5 };

describe('the crew', () => {
  it('walks the deck from the hatch, then climbs the ladder', () => {
    const { deck, up } = trackSpans(track);
    expect(deck).toBe(90);
    expect(up).toBe(76);
    expect(trackEnd(track)).toBe(166);
    expect(crewPoint(0, track)).toEqual({ x: 250, y: 100, onLadder: false });
    expect(crewPoint(90, track)).toEqual({ x: 340, y: 100, onLadder: false });
    expect(crewPoint(120, track)).toEqual({ x: 340, y: 70, onLadder: true });
    expect(crewPoint(999, track).y).toBe(24);
    expect(crewPoint(-5, track).x).toBe(250);
  });

  it('moves at walking speed on the deck and climbing speed on the ladder, never past its target', () => {
    expect(crewMove(0, 50, 500, track)).toBeCloseTo((CREW.walk * 500) / 1000, 6);
    expect(crewMove(90, 160, 500, track)).toBeCloseTo(90 + (CREW.climb * 500) / 1000, 6);
    expect(crewMove(80, 200, 10_000, track)).toBe(200);
    expect(crewMove(30, 10, 10_000, track)).toBe(10);
    // across the foot of the ladder: the rest of the deck, then the climb, in one frame
    const s = crewMove(85, 200, 1000, track);
    const walked = 5 / CREW.walk;
    expect(s).toBeCloseTo(90 + (1 - walked) * CREW.climb, 6);
    // a frame never jumps: at most the faster speed times the time
    for (let from = 0; from < 166; from += 11) expect(Math.abs(crewMove(from, 0, 16, track) - from)).toBeLessThanOrEqual((CREW.walk * 16) / 1000 + 1e-9);
  });

  it('knows how it looks', () => {
    expect(crewMode(30, 30, track)).toBe('stand');
    expect(crewMode(30, 80, track)).toBe('walk');
    expect(crewMode(90, 120, track)).toBe('climb');
    expect(crewMode(120, 0, track)).toBe('climb');
    expect(crewMode(120, 120, track)).toBe('climb');
  });

  it('counts footsteps and rungs', () => {
    expect(stepsCrossed(0, 7, 8)).toBe(0);
    expect(stepsCrossed(7, 9, 8)).toBe(1);
    expect(stepsCrossed(40, 0, 8)).toBe(5);
    expect(stepsCrossed(0, 10, 0)).toBe(0);
  });

  it('boards at the usual pace, hurrying when far so the launch never waits long', () => {
    const near = boardingPlan(track.standA, track.standB, track, 1000);
    expect(near.hurry).toBe(1);
    expect(near.walkMs).toBeCloseTo(travelMs(track.standA, 0, track), 0);
    const far = boardingPlan(150, 130, track, 420);
    expect(far.walkMs).toBe(420);
    expect(far.hurry).toBeGreaterThan(1);
    expect(travelMs(0, 166, track)).toBeCloseTo((90 / CREW.walk + 76 / CREW.climb) * 1000, 6);
  });
});

describe('the crew, quicker (owner, 26-11-2026)', () => {
  it('walks and climbs about 1.8 times as fast as before (46 and 32 px/s)', () => {
    expect(CREW.walk).toBe(85);
    expect(CREW.climb).toBe(58);
    expect(CREW.walk / 46).toBeGreaterThan(1.7);
    expect(CREW.climb / 32).toBeGreaterThan(1.7);
  });

  it('plays one step sound per stride, but never two closer than the gap (no rattle)', () => {
    expect(stepSoundDue(1, 1000, 900)).toBe(false);
    expect(stepSoundDue(1, 1000, 1000 - CREW.soundGapMs)).toBe(true);
    expect(stepSoundDue(0, 5000, 0)).toBe(false);
    // walking flat out for a second: at most 1000 / gap sounds
    let last = -Infinity;
    let s = 0;
    let sounds = 0;
    for (let now = 0; now <= 1000; now += 16) {
      const next = s + (CREW.walk * 16) / 1000;
      if (stepSoundDue(stepsCrossed(s, next, CREW.stride), now, last)) {
        sounds += 1;
        last = now;
      }
      s = next;
    }
    expect(sounds).toBeLessThanOrEqual(Math.ceil(1000 / CREW.soundGapMs));
    expect(sounds).toBeGreaterThanOrEqual(5);
  });
});

describe('the crew on the text bar (field focused)', () => {
  // the bar's top 60 px above the base, its nose's base at x 300
  const roof = barRoof(2, -80, { bodyTop: 20, stroke: 2, noseX: 300 }, track.ladderTop, 25);
  const up: CrewTrack = { ...track, roof };

  it('puts the roof on the bar rocket\'s hull top, only when it is above the tower', () => {
    expect(roof).not.toBeNull();
    expect(roof!.deckY).toBe(-61);
    expect(roof!.x0).toBeCloseTo(2 + 300 - 30, 6);
    expect(barRoof(2, 40, { bodyTop: 20, stroke: 2, noseX: 300 }, track.ladderTop, 25)).toBeNull();
  });

  it('climbs the whole ladder to the bar\'s top, then walks left along it', () => {
    const { deck, up: towerUp, ladder, roof: r } = trackSpans(up);
    expect(towerUp).toBe(76);
    expect(ladder).toBe(161);
    expect(r).toBeCloseTo(340 - roof!.x0, 6);
    expect(crewPoint(deck + ladder, up)).toEqual({ x: 340, y: -61, onLadder: true });
    const end = crewPoint(trackEnd(up), up);
    expect(end.x).toBeCloseTo(roof!.x0, 6);
    expect(end.y).toBe(-61);
    expect(onRoof(trackEnd(up), up)).toBe(true);
    expect(onRoof(deck + ladder, up)).toBe(false);
    expect(crewPoint(deck + towerUp, up).onLadder).toBe(true);
    // waiting: the leader at the far end, the other one gap behind
    const stands = roofStands(up, 25)!;
    expect(stands.a).toBeCloseTo(trackEnd(up), 6);
    expect(stands.a - stands.b).toBeCloseTo(25, 6);
    expect(roofStands(track, 25)).toBeNull();
  });

  it('never jumps: walking on the roof, climbing on the ladder, whatever the frame', () => {
    const { deck, ladder } = trackSpans(up);
    const top = deck + ladder;
    expect(crewMove(top, top + 40, 200, up)).toBeCloseTo(top + (CREW.walk * 200) / 1000, 6);
    expect(crewMove(top - 10, trackEnd(up), 500, up)).toBeCloseTo(top + (0.5 - 10 / CREW.climb) * CREW.walk, 6);
    expect(crewMode(top + 5, top + 20, up)).toBe('walk');
    expect(crewMode(top - 5, top + 20, up)).toBe('climb');
    expect(crewMode(top + 20, top + 20, up)).toBe('stand');
    let s = track.standA;
    let p = crewPoint(s, up);
    const end = trackEnd(up);
    for (let i = 0; i < 400 && s < end; i++) {
      s = crewMove(s, end, 16, up);
      const q = crewPoint(s, up);
      expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThanOrEqual((CREW.walk * 16) / 1000 + 1e-6);
      p = q;
    }
    expect(s).toBe(end);
  });

  it('faces where it goes: right along the deck, left along the roof, unchanged on the ladder', () => {
    const { deck, ladder } = trackSpans(up);
    expect(crewFacing(10, 20, up, -1)).toBe(1);
    expect(crewFacing(deck + 10, deck + 20, up, -1)).toBe(-1);
    expect(crewFacing(deck + ladder + 5, deck + ladder + 15, up, 1)).toBe(-1);
  });

  it('walks a path that follows the track, corners included, timed by its speeds', () => {
    const { deck, ladder } = trackSpans(up);
    const path = trackPath(track.standA, roofSpot(320, up), up);
    expect(path.map((p) => [p.x, p.y])).toEqual([
      [280, 100],
      [340, 100],
      [340, -61],
      [320, -61],
    ]);
    expect(path[0].offset).toBe(0);
    expect(path[3].offset).toBe(1);
    expect(path[1].offset).toBeCloseTo(travelMs(track.standA, deck, up) / travelMs(track.standA, roofSpot(320, up), up), 6);
    // and back down
    const down = trackPath(deck + ladder + 30, 0, up);
    expect(down.map((p) => [p.x, p.y])).toEqual([
      [310, -61],
      [340, -61],
      [340, 100],
      [250, 100],
    ]);
  });

  it('keeps them where they stand when the bar grows a line', () => {
    const taller: CrewTrack = { ...track, roof: { ...roof!, deckY: roof!.deckY - 24 } };
    const { deck, ladder } = trackSpans(up);
    const onTop = deck + ladder + 12;
    const moved = crewPoint(remapOnTrack(onTop, up, taller), taller);
    expect(moved.x).toBeCloseTo(crewPoint(onTop, up).x, 6);
    expect(moved.y).toBe(-85);
    const climbing = deck + 50;
    expect(crewPoint(remapOnTrack(climbing, up, taller), taller)).toEqual(crewPoint(climbing, up));
    expect(remapOnTrack(20, up, taller)).toBe(20);
  });

  it('boards through the bar\'s window: at the usual pace from the roof, hurrying from the base', () => {
    const win = roofSpot(317, up);
    const stands = roofStands(up, 25)!;
    const near = boardingPlan(stands.a, stands.b, up, 600, win);
    expect(near.hurry).toBe(1);
    expect(near.walkMs).toBeLessThan(600);
    const far = boardingPlan(track.standA, track.standB, up, 600, win);
    expect(far.walkMs).toBe(600);
    expect(far.hurry).toBeGreaterThan(1);
  });
});

describe('the crew while the wheel turns', () => {
  const T = 40;

  it('hops from rocket to rocket: down on each one as it is centred, up in between', () => {
    expect(crewLift({ pos: 3, air: 0, t: 0, remainingMs: null, T })).toBeCloseTo(0, 6);
    expect(crewLift({ pos: 3.5, air: 0, t: 0, remainingMs: null, T })).toBeCloseTo(HOP.height * T, 6);
    expect(crewLift({ pos: -2.5, air: 0, t: 0, remainingMs: null, T })).toBeCloseTo(HOP.height * T, 6);
    // the second one a little later
    expect(crewLift({ pos: 3 + HOP.lag, lag: HOP.lag, air: 0, t: 0, remainingMs: null, T })).toBeCloseTo(0, 6);
    for (let p = 0; p < 2; p += 0.05) expect(crewLift({ pos: p, air: 0, t: 0, remainingMs: null, T })).toBeGreaterThanOrEqual(0);
  });

  it('stays up in the air when the wheel turns fast or long, and comes back to hopping when it slows', () => {
    expect(crewAirTarget(0.5, 100)).toBe(0);
    expect(crewAirTarget(2, 300)).toBe(0);
    expect(crewAirTarget(HOP.airFull, 0)).toBe(1);
    expect(crewAirTarget(-HOP.airFull * 2, 0)).toBe(1);
    expect(crewAirTarget((HOP.airFrom + HOP.airFull) / 2, 0)).toBeCloseTo(0.5, 6);
    // long: up while it still turns at a fair pace, not when it crawls
    expect(crewAirTarget(2, HOP.longMs + 1)).toBe(1);
    expect(crewAirTarget(1, HOP.longMs + 1)).toBe(0);
    // floating: up, bobbing a little, never on the rocket
    for (let t = 0; t < 2000; t += 50) {
      const lift = crewLift({ pos: 4, air: 1, t, remainingMs: null, T });
      expect(lift).toBeGreaterThan((HOP.float - HOP.bob) * T - 1e-6);
      expect(lift).toBeLessThan((HOP.float + HOP.bob) * T + 1e-6);
    }
    // the air level changes smoothly, toward its target, never past it
    let air = 0;
    for (let i = 0; i < 30; i++) {
      const next = stepAir(air, 1, 16);
      expect(next).toBeGreaterThan(air);
      expect(next).toBeLessThan(1);
      expect(next - air).toBeLessThan(0.15);
      air = next;
    }
    expect(stepAir(0.6, 0, 16)).toBeLessThan(0.6);
    expect(stepAir(0.6, 0, 16)).toBeGreaterThan(0);
  });

  it('drops onto the chosen rocket exactly as the wheel stops', () => {
    const at = (remainingMs: number | null, air = 1) => crewLift({ pos: 7.3, air, t: 300, remainingMs, T });
    expect(at(0)).toBe(0);
    expect(at(HOP.dropMs)).toBeCloseTo(at(null), 6);
    expect(at(HOP.dropMs * 3)).toBeCloseTo(at(null), 6);
    // coming down all the way, faster near the end
    let prev = at(HOP.dropMs);
    let prevStep = 0;
    for (let r = HOP.dropMs - 20; r >= 0; r -= 20) {
      const lift = at(r);
      expect(lift).toBeLessThanOrEqual(prev + 1e-9);
      expect(prev - lift).toBeGreaterThanOrEqual(prevStep - 1e-9);
      prevStep = prev - lift;
      prev = lift;
    }
    expect(hopMode(0, 1, T)).toBe('stand');
    expect(hopMode(10, 0.2, T)).toBe('hop');
    expect(hopMode(30, 0.9, T)).toBe('float');
  });
});

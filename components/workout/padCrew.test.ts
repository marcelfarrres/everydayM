import { describe, expect, it } from 'vitest';
import { CREW, boardingPlan, climbTarget, crewMode, crewMove, crewPoint, stepsCrossed, trackEnd, trackSpans, travelMs, type CrewTrack } from './padCrew';

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

  it('climbs up and down while the drum turns, and knows how it looks', () => {
    expect(climbTarget(true, track)).toBe(166);
    expect(climbTarget(false, track)).toBeCloseTo(90 + 76 * CREW.climbLow, 6);
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

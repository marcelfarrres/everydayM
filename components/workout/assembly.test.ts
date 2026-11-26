import { describe, expect, it } from 'vitest';
import {
  FINALE,
  PIECES,
  QUICK,
  TAKEOFF,
  TRUCK,
  assemblyLayout,
  finaleSentence,
  fitMs,
  fittedTarget,
  igniteAt,
  joinNames,
  liftFor,
  padHull,
  pieceBottom,
  pieceModes,
  shownMinutes,
  skyInk,
  skyStep,
  truckTimeline,
  zoomLines,
} from '@/components/workout/assembly';
import { LAUNCH } from '@/components/workout/launchDrum';

const ALL = ['minutes', 'rounds', 'intensity'];

describe('which pieces go on', () => {
  it('starts with the nose only when all three are asked, and fits them top down as they are answered', () => {
    expect(fittedTarget(ALL, 0)).toBe(1);
    expect(fittedTarget(ALL, 1)).toBe(2);
    expect(fittedTarget(ALL, 2)).toBe(3);
    expect(fittedTarget(ALL, 3)).toBe(4);
  });

  it('fits a piece known from the sentence in its turn, right after the one above it', () => {
    // the sentence said the intensity: the engine goes on as soon as the blocks are on
    const q = ['minutes', 'rounds'];
    expect(fittedTarget(q, 0)).toBe(1);
    expect(fittedTarget(q, 1)).toBe(2);
    expect(fittedTarget(q, 2)).toBe(4);
    // it said the shape: the blocks go on with the minutes
    const s = ['minutes', 'intensity'];
    expect(fittedTarget(s, 0)).toBe(1);
    expect(fittedTarget(s, 1)).toBe(3);
    expect(fittedTarget(s, 2)).toBe(4);
  });

  it('only the minutes asked: the nose alone at first, everything after the answer', () => {
    expect(fittedTarget(['minutes'], 0)).toBe(1);
    expect(fittedTarget(['minutes'], 1)).toBe(4);
  });

  it('«Saltar, decide tú» brings every remaining piece', () => {
    expect(fittedTarget(ALL, 0, true)).toBe(4);
    expect(fittedTarget(ALL, 1, true)).toBe(4);
  });

  it('brings answered pieces by truck, known or skipped ones quickly', () => {
    expect(pieceModes(ALL, 0)).toEqual({ nose: 'quick', minutes: 'quick', blocks: 'quick', engine: 'quick' });
    expect(pieceModes(ALL, 2)).toEqual({ nose: 'quick', minutes: 'truck', blocks: 'truck', engine: 'quick' });
    expect(pieceModes(['minutes', 'rounds'], 2)).toEqual({ nose: 'quick', minutes: 'truck', blocks: 'truck', engine: 'quick' });
  });

  it('keeps the pieces in their order, top down', () => {
    expect(PIECES).toEqual(['nose', 'minutes', 'blocks', 'engine']);
  });
});

describe('the sky', () => {
  it('climbs a step per piece, from dawn to full day', () => {
    expect([1, 2, 3, 4].map(skyStep)).toEqual([0, 1, 2, 3]);
    expect(skyStep(0)).toBe(0);
    expect(skyStep(9)).toBe(3);
  });

  it('writes in light text while the top of the sky is dark, in ink once it is light', () => {
    expect([0, 1, 2, 3].map(skyInk)).toEqual([false, false, true, true]);
  });
});

describe('the layout', () => {
  const at = (w: number, h: number) => assemblyLayout(w, h, padHull(w, h), 0, 0);

  it('stands the rocket on the bar rocket’s hull from today’s launch (never bigger)', () => {
    expect(padHull(390, 844)).toBeGreaterThan(30);
    expect(padHull(390, 844)).toBeLessThan(42);
    expect(padHull(320, 568)).toBeLessThanOrEqual(padHull(390, 844));
  });

  it('stacks the pieces without gaps, the nozzle on the pad', () => {
    for (const [w, h] of [
      [390, 844],
      [320, 568],
      [320, 700],
    ]) {
      const L = at(w, h);
      expect(pieceBottom(L, 'nose')).toBeCloseTo(L.pieces.minutes.top, 0);
      expect(pieceBottom(L, 'minutes')).toBeCloseTo(L.pieces.blocks.top, 0);
      expect(pieceBottom(L, 'blocks')).toBeCloseTo(L.pieces.engine.top, 0);
      expect(pieceBottom(L, 'engine')).toBeCloseTo(L.padTop, 0);
    }
  });

  it('keeps the crane above the rocket, the porthole between the header and the crane', () => {
    for (const [w, h] of [
      [390, 844],
      [320, 568],
    ]) {
      const L = at(w, h);
      expect(L.jib.y + L.jib.h).toBeLessThan(L.rocketTop);
      expect(L.porthole.y + L.porthole.r + L.rim).toBeLessThanOrEqual(L.jib.y);
      expect(L.porthole.y - L.porthole.r - L.rim).toBeGreaterThanOrEqual(64);
      expect(L.porthole.x + L.porthole.r + L.rim).toBeLessThanOrEqual(w);
    }
  });

  it('keeps the questions clear of the rocket and the title clear of the porthole', () => {
    for (const [w, h] of [
      [390, 844],
      [320, 568],
    ]) {
      const L = at(w, h);
      expect(L.column.right).toBeLessThanOrEqual(L.cx - L.box / 2);
      expect(L.column.left + L.column.titleWidth).toBeLessThanOrEqual(L.porthole.x - L.porthole.r - L.rim);
      expect(L.cx + L.box / 2).toBeLessThan(L.tower.x + 1);
    }
  });

  it('puts the window on the nose, under the crane', () => {
    const L = at(390, 844);
    expect(L.window.y).toBeGreaterThan(L.pieces.nose.top);
    expect(L.window.y).toBeLessThan(L.pieces.nose.top + L.pieces.nose.len - L.pieces.nose.hull);
  });

  it('lifts each piece from the truck up to its place, less for the lower ones', () => {
    const L = at(390, 844);
    expect(liftFor(L, 'minutes')).toBeGreaterThan(liftFor(L, 'blocks'));
    expect(liftFor(L, 'blocks')).toBeGreaterThan(liftFor(L, 'engine'));
    expect(liftFor(L, 'engine')).toBeGreaterThanOrEqual(0);
  });

  it('suns climb and the skyline slides with every step', () => {
    const L = at(390, 844);
    for (let i = 1; i < 4; i++) {
      expect(L.suns[i].y).toBeLessThan(L.suns[i - 1].y);
      expect(L.skylineShift[i]).toBeLessThan(L.skylineShift[i - 1]);
    }
  });

  it('draws the zoom lines from the porthole’s rim to the window', () => {
    const big = { x: 300, y: 150, r: 70 };
    const small = { x: 305, y: 330, r: 7 };
    const lines = zoomLines(big, small);
    expect(lines).toHaveLength(2);
    for (const [x1, y1, x2, y2] of lines) {
      expect(Math.hypot(x1 - big.x, y1 - big.y)).toBeCloseTo(big.r, 0);
      expect(Math.hypot(x2 - small.x, y2 - small.y)).toBeCloseTo(small.r, 0);
    }
    expect(zoomLines(big, { x: 300, y: 150, r: 5 })).toEqual([]);
  });
});

describe('the timelines', () => {
  it('runs a truck in order: drive in, lift, dock, two bolts, on, lower, drive off', () => {
    const t = truckTimeline();
    expect(t.driveIn[1]).toBe(TRUCK.driveInMs);
    expect(t.lift[0]).toBe(t.driveIn[1]);
    expect(t.dockAt).toBe(t.lift[1]);
    expect(t.bolts[0]).toBeGreaterThan(t.dockAt);
    expect(t.bolts[1]).toBeGreaterThan(t.bolts[0]);
    expect(t.placedAt).toBeGreaterThan(t.bolts[1]);
    expect(t.lower[0]).toBe(t.placedAt);
    expect(t.driveOut[0]).toBe(t.lower[1]);
    expect(t.endAt).toBe(t.driveOut[1]);
  });

  it('fits a known piece much quicker than a truck brings one', () => {
    expect(fitMs('quick')).toBe(QUICK.riseMs + QUICK.boltMs + QUICK.gapMs);
    expect(fitMs('quick') * 4).toBeLessThan(fitMs('truck'));
  });

  it('takes off in order: porthole home, cable up, jib in, ignition, lift-off', () => {
    expect(TAKEOFF.cableAt).toBeLessThan(TAKEOFF.portholeMs);
    expect(TAKEOFF.jibAt).toBeGreaterThanOrEqual(TAKEOFF.cableAt + TAKEOFF.cableMs - 50);
    expect(TAKEOFF.igniteAt).toBeGreaterThanOrEqual(TAKEOFF.jibAt + TAKEOFF.jibMs);
    expect(TAKEOFF.liftAt).toBeGreaterThan(TAKEOFF.igniteAt);
  });

  it('lifts the held launch off once the sentence has been read', () => {
    const shown = 10_000;
    expect(igniteAt(shown, LAUNCH.igniteMs) + LAUNCH.igniteMs).toBe(shown + FINALE.readMs);
    expect(igniteAt(shown, 5000, 3500)).toBe(shown);
  });
});

describe('the minutes shown', () => {
  it('shows the length chosen, not the real length of the routine', () => {
    expect(shownMinutes(30, 28)).toBe(30);
  });

  it('shows the real length when none was chosen', () => {
    expect(shownMinutes(null, 28)).toBe(28);
    expect(shownMinutes(undefined, 28)).toBe(28);
  });

  it('keeps a chosen length within what a routine may last', () => {
    expect(shownMinutes(55, 40)).toBe(40);
    expect(shownMinutes(10, 20)).toBe(20);
  });
});

describe('the sentence', () => {
  it('joins names the Spanish way', () => {
    expect(joinNames([])).toBe('');
    expect(joinNames(['hombros'])).toBe('hombros');
    expect(joinNames(['pierna', 'glúteo'])).toBe('pierna y glúteo');
    expect(joinNames(['pecho', 'espalda', 'brazos'])).toBe('pecho, espalda y brazos');
  });

  it('says focus, minutes and intensity', () => {
    expect(finaleSentence('pierna y glúteo', 30, 'media')).toBe('Hoy, pierna y glúteo. 30 min, intensidad media.');
  });
});

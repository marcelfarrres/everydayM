import { describe, expect, it } from 'vitest';
import {
  CREST,
  boxesMeet,
  levelMarks,
  HINT_MS,
  SLOSH,
  STILL,
  TANK,
  dragMinutes,
  fuelPath,
  hintOffset,
  isStill,
  isMark,
  keyMinutes,
  levelY,
  magnet,
  pxPerMinute,
  sloshStep,
  snapMinutes,
  surfaceY,
} from './tankLevel';

describe('the minutes tank', () => {
  it('puts 20 at the bottom and 40 at the top, the marks evenly apart', () => {
    const top = 100;
    const bottom = 500;
    expect(levelY(20, top, bottom)).toBe(bottom - TANK.padBottom);
    expect(levelY(40, top, bottom)).toBe(top + TANK.padTop);
    expect(levelY(30, top, bottom)).toBe((top + TANK.padTop + bottom - TANK.padBottom) / 2);
    expect(levelY(99, top, bottom)).toBe(top + TANK.padTop);
    expect(pxPerMinute(top, bottom)).toBe((400 - TANK.padTop - TANK.padBottom) / 20);
    // the value written above the level at 40 still fits in the tank, over the chevron and any crest
    expect(TANK.padTop + levelMarks(40).number.y0).toBeGreaterThanOrEqual(2);
  });

  it('moves the level half of what the finger travels, up for more', () => {
    const ppm = 10;
    expect(dragMinutes(30, -40, ppm)).toBe(32); // 40 px up: 20 px of level: 2 minutes
    expect(snapMinutes(dragMinutes(30, -60, ppm))).toBe(33); // any whole minute
    expect(dragMinutes(30, 40, ppm)).toBe(28);
    expect(dragMinutes(30, -1000, ppm)).toBe(TANK.max);
    expect(dragMinutes(30, 1000, ppm)).toBe(TANK.min);
    // the level's own travel is half the finger's
    const ppmReal = pxPerMinute(100, 500);
    expect((dragMinutes(30, -100, ppmReal) - 30) * ppmReal).toBeCloseTo(50, 6);
  });

  it('settles on every whole minute (the marks click harder), drawn onto a minute when near one', () => {
    expect(snapMinutes(31.4)).toBe(31);
    expect(snapMinutes(32.6)).toBe(33);
    expect(snapMinutes(12)).toBe(20);
    expect(snapMinutes(47)).toBe(40);
    for (let m = 20; m <= 40; m++) expect(snapMinutes(m)).toBe(m);
    expect([20, 25, 30, 35, 40].every(isMark)).toBe(true);
    expect([21, 23, 33, 39].some(isMark)).toBe(false);
    expect(magnet(30)).toBe(30);
    expect(Math.abs(magnet(30.2) - 30)).toBeLessThan(0.2);
    expect(magnet(32.5)).toBe(32.5);
    // never jumps: it follows the finger smoothly across the zones' edges, and never goes backwards
    let prev = magnet(25);
    for (let m = 25; m <= 35; m += 0.05) {
      const g = magnet(m);
      expect(g).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(g - prev).toBeLessThan(0.2);
      prev = g;
    }
  });

  it('steps a minute at a time with the arrows, a mark with Page Up and Down', () => {
    expect(keyMinutes(30, 'ArrowUp')).toBe(31);
    expect(keyMinutes(30, 'ArrowRight')).toBe(31);
    expect(keyMinutes(30, 'ArrowDown')).toBe(29);
    expect(keyMinutes(32, 'PageUp')).toBe(37);
    expect(keyMinutes(22, 'PageDown')).toBe(20);
    expect(keyMinutes(40, 'ArrowUp')).toBe(40);
    expect(keyMinutes(20, 'ArrowLeft')).toBe(20);
    expect(keyMinutes(33, 'Home')).toBe(20);
    expect(keyMinutes(33, 'End')).toBe(40);
    expect(keyMinutes(30, 'a')).toBeNull();
  });

  it('shows it slides by itself: up and back twice, then rests', () => {
    expect(hintOffset(0)).toBeCloseTo(0, 6);
    expect(hintOffset(450)).toBeLessThan(-10);
    expect(hintOffset(900)).toBeCloseTo(0, 6);
    expect(hintOffset(1050 + 450)).toBeLessThan(-10);
    expect(hintOffset(HINT_MS + 10)).toBe(0);
    expect(HINT_MS).toBeLessThanOrEqual(2200);
  });
});

describe('the fuel, a liquid', () => {
  it('sloshes with the speed of the level, leaning against the way it moves', () => {
    let slow = STILL;
    let fast = STILL;
    for (let i = 0; i < 20; i++) {
      slow = sloshStep(slow, 0.1, 16);
      fast = sloshStep(fast, 0.5, 16);
    }
    expect(slow.amp).toBeGreaterThan(0);
    expect(fast.amp).toBeGreaterThan(slow.amp);
    expect(fast.amp).toBeLessThanOrEqual(SLOSH.maxAmp + 1e-9);
    // moving down (v > 0): it leans one way; up, the other
    expect(fast.lean).toBeLessThan(0);
    let up = STILL;
    for (let i = 0; i < 20; i++) up = sloshStep(up, -0.5, 16);
    expect(up.lean).toBeGreaterThan(0);
  });

  it('dies down smoothly once the level stops, to a flat, still surface in about 1 to 1.5 s', () => {
    let s = STILL;
    for (let i = 0; i < 30; i++) s = sloshStep(s, 0.6, 16);
    const peak = s.amp;
    let t = 0;
    let prev = s.amp;
    while (!isStill(s) && t < 5000) {
      s = sloshStep(s, 0, 16);
      t += 16;
      expect(s.amp).toBeLessThanOrEqual(prev + 1e-9);
      prev = s.amp;
    }
    expect(peak).toBeGreaterThan(2);
    expect(t).toBeGreaterThan(800);
    expect(t).toBeLessThan(1600);
    expect(s).toEqual(STILL);
    // at rest: flat
    expect(surfaceY(30, 0, 80, 200, STILL)).toBe(200);
    expect(fuelPath(0, 80, 200, 300, STILL)).toBe('M0.0 200.0L80.0 200.0L80.0 300.0L0.0 300.0Z');
  });

  it('never reaches the value written above it', () => {
    let s = STILL;
    for (let i = 0; i < 200; i++) {
      s = sloshStep(s, i % 50 < 25 ? 3 : -3, 16);
      for (let x = 0; x <= 80; x += 4) expect(200 - surfaceY(x, 0, 80, 200, s)).toBeLessThanOrEqual(CREST + 1e-6);
    }
  });
});

describe('the value and the chevrons on the level', () => {
  it('never overlap, at any value and on a narrow tank', () => {
    for (const w of [62, 72, 84]) {
      const cx = 30 + w * 0.42;
      const m = levelMarks(cx);
      for (const text of [m.number, m.unit]) {
        expect(boxesMeet(text, m.up)).toBe(false);
        expect(boxesMeet(text, m.down)).toBe(false);
      }
      // the text stays inside the tank (its sides) and over any crest of the liquid
      expect(m.number.x0).toBeGreaterThan(30);
      expect(m.unit.x1).toBeLessThan(30 + w);
      expect(-m.number.y1).toBeGreaterThan(CREST);
      for (let minutes = 20; minutes <= 40; minutes += 5) {
        const y = levelY(minutes, 8, 400);
        expect(y + m.number.y0).toBeGreaterThanOrEqual(8);
      }
    }
  });
});

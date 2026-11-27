import { describe, expect, it } from 'vitest';
import {
  CREST,
  HINT_MS,
  SLOSH,
  STILL,
  TANK,
  dragMinutes,
  fuelPath,
  hintOffset,
  isStill,
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
    // the value written above the level at 40 still fits in the tank, over any crest
    expect(TANK.padTop - CREST - SLOSH.textClear).toBeGreaterThanOrEqual(26);
  });

  it('moves the level half of what the finger travels, up for more', () => {
    const ppm = 10;
    expect(dragMinutes(30, -40, ppm)).toBe(32); // 40 px up: 20 px of level: 2 minutes
    expect(dragMinutes(30, 40, ppm)).toBe(28);
    expect(dragMinutes(30, -1000, ppm)).toBe(TANK.max);
    expect(dragMinutes(30, 1000, ppm)).toBe(TANK.min);
    // the level's own travel is half the finger's
    const ppmReal = pxPerMinute(100, 500);
    expect((dragMinutes(30, -100, ppmReal) - 30) * ppmReal).toBeCloseTo(50, 6);
  });

  it('settles on the marks: snaps to the nearest, and is drawn onto a mark when near one', () => {
    expect(snapMinutes(27.4)).toBe(25);
    expect(snapMinutes(27.6)).toBe(30);
    expect(snapMinutes(12)).toBe(20);
    expect(snapMinutes(47)).toBe(40);
    expect(magnet(30)).toBe(30);
    expect(Math.abs(magnet(30.6) - 30)).toBeLessThan(0.6);
    expect(magnet(32.5)).toBe(32.5);
    // never jumps: it follows the finger smoothly across the zone's edge, and never goes backwards
    let prev = magnet(25);
    for (let m = 25; m <= 35; m += 0.05) {
      const g = magnet(m);
      expect(g).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(g - prev).toBeLessThan(0.2);
      prev = g;
    }
  });

  it('steps a mark at a time with the keys', () => {
    expect(keyMinutes(30, 'ArrowUp')).toBe(35);
    expect(keyMinutes(30, 'ArrowRight')).toBe(35);
    expect(keyMinutes(30, 'ArrowDown')).toBe(25);
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

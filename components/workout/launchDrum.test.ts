import { describe, expect, it } from 'vitest';
import {
  BAR_LAUNCH,
  DRUM,
  LAUNCH,
  barLaunchTimeline,
  barOnPad,
  baseLayout,
  centreIndex,
  drumSlot,
  launchTimeline,
  nearestPos,
  rocketBoxHeight,
  rouletteEase,
  rouletteMs,
  rouletteSteps,
  snapTarget,
  ticksBetween,
  wrapOffset,
} from './launchDrum';

describe('the drum', () => {
  it('wraps offsets around the wheel', () => {
    for (let i = 0; i < 9; i++) {
      for (const pos of [-12.3, -1, 0, 0.5, 4.2, 17]) {
        const d = wrapOffset(i, pos, 9);
        expect(d).toBeGreaterThanOrEqual(-4.5);
        expect(d).toBeLessThan(4.5);
        const rest = (((i - pos - d) % 9) + 9) % 9;
        expect(Math.min(rest, 9 - rest)).toBeCloseTo(0, 6);
      }
    }
    expect(centreIndex(-1, 9)).toBe(8);
    expect(centreIndex(19.4, 9)).toBe(1);
    expect(nearestPos(17, 0, 9)).toBe(18);
    expect(nearestPos(17, 7, 9)).toBe(16);
  });

  it('shows the centred rocket whole, its neighbours smaller and fainter, the rest hidden', () => {
    const centre = drumSlot(0, 100);
    expect(centre).toMatchObject({ y: 0, scale: 1, opacity: 1, visible: true });
    const next = drumSlot(1, 100);
    expect(next.scale).toBeLessThan(1);
    expect(next.opacity).toBeLessThan(1);
    expect(next.y).toBeGreaterThan(0);
    expect(drumSlot(-1, 100).y).toBeCloseTo(-next.y, 6);
    expect(next.z).toBeLessThan(centre.z);
    expect(drumSlot(2, 100).visible).toBe(false);
    expect(drumSlot(3, 100).visible).toBe(false);
  });

  it('snaps to a rocket, a flick going a little further', () => {
    expect(snapTarget(3.4, 0)).toBe(3);
    expect(snapTarget(3.6, 0)).toBe(4);
    expect(snapTarget(3.4, 0.01)).toBe(5);
    expect(snapTarget(3.4, -1)).toBe(1); // at most two more
    expect(snapTarget(2, Number.NaN)).toBe(2);
  });

  it('spins the roulette more than a full turn and lands on another suggestion', () => {
    for (let r = 0; r < 1; r += 0.01) {
      const steps = rouletteSteps(9, () => r);
      expect(steps).toBeGreaterThan(9);
      expect(steps % 9).not.toBe(0);
      expect(rouletteMs(steps)).toBeLessThanOrEqual(2600);
    }
    let prev = 0;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const e = rouletteEase(p);
      expect(e).toBeGreaterThanOrEqual(prev);
      prev = e;
    }
    expect(rouletteEase(1)).toBe(1);
    // it decelerates: most of the way is done in the first half
    expect(rouletteEase(0.5)).toBeGreaterThan(0.85);
  });

  it('clicks once per rocket passing the centre', () => {
    expect(ticksBetween(0, 0.4)).toBe(0);
    expect(ticksBetween(0, 0.6)).toBe(1);
    expect(ticksBetween(0, 11)).toBe(11);
    expect(ticksBetween(3.2, 1.7)).toBe(1);
  });
});

describe('the base layout', () => {
  const screens: [number, number, number][] = [
    [320, 236, 0],
    [360, 292, 0],
    [375, 325, 34],
    [390, 338, 34],
    [430, 372, 34],
    [600, 380, 20],
  ];

  it('keeps "Random" whole, above the home bar and clear of the rounded corners', () => {
    for (const [w, h, safe] of screens) {
      const { random } = baseLayout(w, h, safe);
      expect(random.x).toBeGreaterThan(0);
      expect(random.x + random.w).toBeLessThanOrEqual(w - 40);
      expect(random.y).toBeGreaterThan(0);
      expect(random.y + random.h).toBeLessThanOrEqual(h - Math.max(8, safe + 6) + 0.5);
    }
  });

  it('keeps the centred rocket and its neighbours inside the base and off the button', () => {
    for (const [w, h, safe] of screens) {
      const L = baseLayout(w, h, safe);
      const n1 = drumSlot(1, L.radius);
      const half = (rocketBoxHeight(L.rocket.body) * n1.scale) / 2;
      expect(L.centreY - n1.y - half).toBeGreaterThanOrEqual(0);
      expect(L.centreY + n1.y + half).toBeLessThanOrEqual(L.random.y);
      // the centred one and its neighbours barely touch (fins only)
      expect(n1.y).toBeGreaterThan(L.rocket.height * 0.8);
      // the rockets lie between the towers
      expect(L.rocket.left).toBeGreaterThan(L.tower.leftX + L.tower.w);
      expect(L.rocket.left + L.rocket.length).toBeLessThan(L.tower.rightX);
      expect(L.padY).toBeLessThan(h);
      expect(DRUM.step).toBeGreaterThan(0);
    }
  });
});

describe('the launch', () => {
  it('runs one thing at a time, from the tap to lift-off in about three seconds', () => {
    for (const walk of [0, 150, 420, 3000]) {
      const t = launchTimeline(walk);
      const order = [t.doorOpenAt, t.hopAt[0], t.hopAt[1], t.doorCloseAt, t.fadeAt, t.turnAt, t.towerAt, t.dockAt, t.igniteAt, t.liftAt, t.endAt];
      for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
      // the second astronaut is in before the door closes
      expect(t.hopAt[1] + LAUNCH.hopMs).toBeLessThanOrEqual(t.doorCloseAt);
      expect(t.endAt).toBeLessThanOrEqual(3500);
    }
    const usual = launchTimeline(150);
    expect(usual.liftAt).toBeGreaterThan(2000);
    expect(usual.endAt).toBeGreaterThan(2700);
    expect(usual.endAt).toBeLessThan(3300);
  });

  it("launches the typed sentence the same way, the bar's rocket first coming down to the pad, in at most 3.8 s", () => {
    for (const walk of [0, 300, 600, 3000]) {
      const t = barLaunchTimeline(walk);
      const order = [t.doorOpenAt, t.hopAt[0], t.hopAt[1], t.doorCloseAt, t.fadeAt, t.turnAt, t.towerAt, t.dockAt, t.igniteAt, t.liftAt, t.endAt];
      for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
      expect(t.descendAt).toBe(t.fadeAt);
      expect(t.turnAt - t.descendAt).toBe(BAR_LAUNCH.descendMs);
      // the round window: open, both in, closed, well under a second
      expect(t.doorCloseAt + LAUNCH.doorMs - t.doorOpenAt).toBeLessThan(1000);
      expect(t.endAt).toBeLessThanOrEqual(3800);
      // from the pad on, exactly the drum's launch
      const drum = launchTimeline(0);
      expect(t.endAt - t.turnAt).toBe(drum.endAt - drum.turnAt);
    }
    expect(barLaunchTimeline(3000).endAt).toBe(barLaunchTimeline(BAR_LAUNCH.maxWalkMs).endAt);
    // the drum's own launch is unchanged
    expect(launchTimeline(150).descendAt).toBe(launchTimeline(150).fadeAt);
    expect(launchTimeline(150).turnAt - launchTimeline(150).fadeAt).toBe(LAUNCH.fadeMs);
  });

  it("brings the bar's rocket to the pad at a drum rocket's length", () => {
    const L = baseLayout(390, 338, 34);
    const pad = barOnPad(L, 386, 46);
    expect(pad.scale * 386).toBeCloseTo(L.rocket.length, 6);
    expect(pad.body).toBeCloseTo(46 * pad.scale, 6);
  });
});

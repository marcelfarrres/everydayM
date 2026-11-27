import { describe, expect, it } from 'vitest';
import {
  BAR_LAUNCH,
  LAUNCH,
  SCENE,
  WHEEL,
  animSpeed,
  barLaunchTimeline,
  barOnPad,
  baseLayout,
  baseScene,
  centreIndex,
  clampsOpen,
  entrySpin,
  glide,
  glideEase,
  launchTimeline,
  nearestPos,
  rocketBoxHeight,
  rouletteEase,
  rouletteMs,
  rouletteSteps,
  ticksBetween,
  wheelMetrics,
  wheelSlot,
  wrapOffset,
} from './launchDrum';

const screens: [number, number, number][] = [
  [320, 236, 0],
  [320, 227, 0],
  [360, 292, 0],
  [375, 325, 34],
  [390, 337.6, 0],
  [390, 338, 34],
  [430, 372, 34],
  [600, 380, 20],
];

describe('the wheel', () => {
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

  it('shows five: the centred one whole and crisp, its neighbours smaller and fainter, the outer ones smaller still, fainter and blurred', () => {
    const m = wheelMetrics(78, 234);
    const at = [0, 1, 2].map((d) => wheelSlot(d, m));
    expect(at[0]).toMatchObject({ y: 0, scale: 1, opacity: 1, blur: 0, visible: true });
    expect(at[1].scale).toBeLessThan(0.75);
    expect(at[1].opacity).toBeLessThan(1);
    expect(at[1].blur).toBe(0);
    expect(at[2].scale).toBeLessThan(at[1].scale);
    expect(at[2].opacity).toBeLessThan(at[1].opacity);
    expect(at[2].blur).toBeGreaterThan(0);
    expect(at[2].visible).toBe(true);
    for (const d of [1, 2]) {
      expect(wheelSlot(-d, m).y).toBeCloseTo(-wheelSlot(d, m).y, 6);
      expect(wheelSlot(-d, m).scale).toBeCloseTo(wheelSlot(d, m).scale, 6);
      expect(wheelSlot(d, m).z).toBeLessThan(wheelSlot(d - 1, m).z);
    }
    // the rest: gone (not seen, not tappable)
    expect(wheelSlot(3, m).opacity).toBe(0);
    expect(wheelSlot(3, m).visible).toBe(false);
    expect(wheelSlot(-4.4, m).visible).toBe(false);
    // in between two places, in between (it moves smoothly)
    let prev = wheelSlot(0, m);
    for (let d = 0.05; d < 3; d += 0.05) {
      const s = wheelSlot(d, m);
      expect(s.y).toBeGreaterThan(prev.y);
      expect(s.scale).toBeLessThanOrEqual(prev.scale + 1e-9);
      expect(s.opacity).toBeLessThanOrEqual(prev.opacity + 1e-9);
      prev = s;
    }
  });

  it('never lets two rockets overlap, keeps the neighbours whole in the panel and cuts the outer ones on its edge', () => {
    for (const [w, h, safe] of screens) {
      const L = baseLayout(w, h, safe);
      const H0 = L.rocket.height;
      const m = L.wheel;
      const half = L.panel.h / 2;
      const box = (d: number) => {
        const s = wheelSlot(d, m);
        return { top: s.y - (H0 * s.scale) / 2, bottom: s.y + (H0 * s.scale) / 2 };
      };
      for (const d of [0, 1, 2]) expect(box(d + 1).top).toBeGreaterThanOrEqual(box(d).bottom - 1e-6);
      // the neighbours whole inside; the centre band holds the centred one and no neighbour
      expect(box(1).bottom).toBeLessThanOrEqual(half);
      expect(m.band).toBeGreaterThanOrEqual(H0 / 2);
      expect(box(1).top).toBeGreaterThanOrEqual(m.band);
      // the outer ones: partly in, partly cut ("there is more")
      expect(box(2).top).toBeLessThan(half);
      expect(box(2).bottom).toBeGreaterThan(half);
      // and the panel stays inside the base
      expect(L.panel.y + L.panel.h).toBeLessThanOrEqual(L.height - Math.max(8, safe + 6) + 0.5);
      expect(L.panel.y).toBeGreaterThanOrEqual(L.head.y + L.head.h);
      expect(Math.abs(L.centreY - (L.panel.y + L.panel.h / 2))).toBeLessThanOrEqual(0.5);
    }
  });

  it("keeps the rockets, as ever, between the towers' places, and the band between their inner edges", () => {
    for (const [w, h, safe] of screens) {
      const L = baseLayout(w, h, safe);
      expect(L.rocket.left - L.rocket.body / 2).toBeGreaterThan(L.tower.leftX + L.tower.w);
      expect(L.rocket.left + L.rocket.length).toBeLessThan(L.tower.rightX);
      expect(L.band.x0).toBe(L.tower.leftX + L.tower.w);
      expect(L.band.x1).toBe(L.tower.rightX);
      expect(L.panel.x).toBeLessThan(L.band.x0);
      expect(L.panel.x + L.panel.w).toBeGreaterThan(L.band.x1);
      expect(L.padY).toBeLessThan(h);
      expect(L.rocket.height).toBe(rocketBoxHeight(L.rocket.body));
    }
  });

  it('glides on after a flick, slowing down, and settles exactly on a rocket', () => {
    // a slow release: the nearest one
    expect(glide(3.4, 0)).toEqual({ to: 3, dur: WHEEL.snapMs });
    expect(glide(3.6, 0.0001)).toEqual({ to: 4, dur: WHEEL.snapMs });
    expect(glide(2, Number.NaN).to).toBe(2);
    // a flick: further the harder, always on a whole rocket, in its direction
    const soft = glide(3.2, 0.005);
    const hard = glide(3.2, 0.03);
    expect(Number.isInteger(soft.to) && Number.isInteger(hard.to)).toBe(true);
    expect(soft.to).toBeGreaterThan(3.2);
    expect(hard.to - 3.2).toBeGreaterThan(soft.to - 3.2);
    expect(hard.to).toBe(Math.round(3.2 + 0.03 * WHEEL.glideTau));
    expect(glide(3.2, -0.03).to).toBe(Math.round(3.2 - 0.03 * WHEEL.glideTau));
    // it starts at the finger's speed (steps per ms) and slows down to nothing
    const v0 = (WHEEL.glideK * (hard.to - 3.2)) / hard.dur;
    expect(v0).toBeCloseTo(0.03, 3);
    expect(glideEase(0)).toBe(0);
    expect(glideEase(1)).toBe(1);
    expect(animSpeed(3.2, hard.to, hard.dur, 0.999, glideEase)).toBeLessThan(0.1);
    // within bounds, however hard
    const wild = glide(0, 5);
    expect(wild.to).toBeLessThanOrEqual(WHEEL.maxGlideSteps);
    expect(wild.dur).toBeGreaterThanOrEqual(WHEEL.minGlideMs);
    expect(glide(0, 0.002).dur).toBeLessThanOrEqual(WHEEL.maxGlideMs);
    // around and around: any end is a rocket of the wheel
    for (const pos of [-40.3, -3.7, 0.2, 55.5]) {
      for (const v of [-0.05, -0.01, 0, 0.01, 0.05]) {
        const { to } = glide(pos, v);
        expect(Number.isInteger(to)).toBe(true);
        expect(centreIndex(to, 9)).toBeGreaterThanOrEqual(0);
        expect(centreIndex(to, 9)).toBeLessThan(9);
      }
    }
  });

  it('spins by itself on entering, more than a full turn, and stops on the rocket it had', () => {
    for (const index of [0, 4, 8]) {
      const spin = entrySpin(index, 9);
      expect(spin.to).toBe(index);
      expect(spin.to - spin.from).toBeGreaterThan(9);
      expect(spin.dur).toBeGreaterThanOrEqual(1200);
      expect(spin.dur).toBeLessThanOrEqual(1600);
      // fast at first, slow at the end
      expect(animSpeed(spin.from, spin.to, spin.dur, 0.02, rouletteEase)).toBeGreaterThan(15);
      expect(animSpeed(spin.from, spin.to, spin.dur, 0.98, rouletteEase)).toBeLessThan(0.5);
    }
    expect(entrySpin(0, 1).dur).toBe(0);
  });

  it('opens the clamps while the wheel moves and shuts them once it settles', () => {
    expect(clampsOpen(true)).toBe(true);
    expect(clampsOpen(false)).toBe(false);
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

describe('the dawn scene ("Amanecer")', () => {
  it('keeps the ground and its road under the horizon, inside the base', () => {
    for (const [w, h, safe] of screens) {
      const L = baseLayout(w, h, safe);
      const s = baseScene(L);
      expect(s.horizon).toBeLessThanOrEqual(L.height - SCENE.minGround);
      expect(s.skylineTop).toBeLessThan(s.horizon);
      expect(s.road.top).toBeGreaterThan(s.horizon);
      expect(s.road.top + s.road.h).toBeLessThanOrEqual(L.height);
    }
  });
});

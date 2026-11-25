import { describe, expect, it } from 'vitest';
import { widgetLayout } from '@/components/workout/rocketShape';
import { MINI, growKeyframes, handoffTimes, miniMast, miniMastX, miniPose, miniRect, swollenRect } from './miniHandoff';

describe('the next exercise, from its window to the whole screen', () => {
  const vw = 390;
  const vh = 844;
  const L = widgetLayout(vw - 12);
  const rect = miniRect(vw, vh, L);

  it('stands over the left end of the banner, 15 % bigger than the old preview, clear of it', () => {
    expect(MINI.W).toBe(Math.round(60 * 1.15));
    expect(MINI.H).toBe(Math.round(106 * 1.15));
    const bannerTop = vh - MINI.BOTTOM - L.box + L.banner.top;
    expect(rect.top + rect.height).toBeLessThanOrEqual(bannerTop - 4);
    expect(rect.left).toBeGreaterThanOrEqual((vw - L.B) / 2 + L.banner.left);
    expect(rect.top).toBeGreaterThan(vh / 2);
  });

  it('starts as the window and ends as the screen, never stretching the video', () => {
    const keys = growKeyframes(rect, vw, vh);
    expect(keys).toHaveLength(MINI.STEPS + 1);
    expect(keys[0].offset).toBe(0);
    expect(keys.at(-1)).toMatchObject({ offset: 1, outer: 'translate(0px, 0px) scale(1, 1)', inner: 'scale(1, 1)' });
    expect(keys[0].outer).toBe(`translate(${rect.left}px, ${rect.top}px) scale(${(rect.width / vw).toFixed(4).replace(/0+$/, '')}, ${(rect.height / vh).toFixed(4).replace(/0+$/, '')})`);
    for (let i = 0; i <= 20; i++) {
      const { net } = miniPose(rect, vw, vh, i / 20);
      expect(net.x).toBeCloseTo(net.y, 6);
    }
    // the video covers the window at the start
    const start = miniPose(rect, vw, vh, 0).net.x;
    expect(start * vw).toBeGreaterThanOrEqual(rect.width - 0.01);
    expect(start * vh).toBeGreaterThanOrEqual(rect.height - 0.01);
  });

  it('fades the talk to black first (shorter after "Saltar"), then fills the screen in about 0.4 s', () => {
    expect(MINI.GROW_MS).toBeGreaterThanOrEqual(350);
    expect(MINI.GROW_MS).toBeLessThanOrEqual(450);
    expect(handoffTimes(true).fade).toBeGreaterThanOrEqual(350);
    expect(handoffTimes(true).fade).toBeLessThanOrEqual(450);
    expect(handoffTimes(false).fade).toBeLessThan(handoffTimes(true).fade);
    expect(handoffTimes(true).total).toBe(handoffTimes(true).fade + MINI.GROW_MS);
  });

  it('swells a little in the last seconds of the talk, on its mast, then grows from there without overshooting', () => {
    const big = swollenRect(rect);
    expect(big.width / rect.width).toBeCloseTo(MINI.SWELL, 6);
    expect(MINI.SWELL).toBeGreaterThan(1.1);
    expect(MINI.SWELL).toBeLessThanOrEqual(1.3);
    expect(big.top + big.height).toBeCloseTo(rect.top + rect.height, 6);
    expect(big.left + big.width / 2).toBeCloseTo(rect.left + rect.width / 2, 6);
    expect(MINI.SWELL_MS).toBeLessThanOrEqual(MINI.SWELL_S * 1000);
    const keys = growKeyframes(big, vw, vh);
    expect(keys[0].outer).toBe(miniPose(big, vw, vh, 0).outer);
    expect(keys.at(-1)?.outer).toBe('translate(0px, 0px) scale(1, 1)');
    // never past the screen on the way
    for (const k of keys) {
      const [sx, sy] = k.outer.match(/scale\(([^,]+), ([^)]+)\)/)!.slice(1).map(Number);
      expect(sx).toBeLessThanOrEqual(1);
      expect(sy).toBeLessThanOrEqual(1);
    }
  });

  it('stands on its own mast, out of the body of the rocket, whatever is left of it', () => {
    for (const stack of [undefined, { blocks: 3, first: 3, boosters: false }, { blocks: 2, first: 1, boosters: true }]) {
      const S = widgetLayout(vw - 12, stack);
      const x = miniMastX(vw, S);
      const ship = (vw - S.B) / 2 + S.ship.left + S.ship.shift;
      expect(x).toBeGreaterThan(ship + S.g.x0);
      expect(x).toBeLessThan(ship + S.g.xs);
      const mast = miniMast(vw, vh, S);
      const w = miniRect(vw, vh, S);
      expect(mast.x).toBe(w.left + w.width / 2);
      expect(mast.top).toBe(w.top + w.height);
      expect(mast.bottom).toBeGreaterThan(vh - MINI.BOTTOM - S.box + S.ship.top);
    }
  });

});

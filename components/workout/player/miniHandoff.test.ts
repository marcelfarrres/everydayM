import { describe, expect, it } from 'vitest';
import { widgetLayout } from '@/components/workout/rocketShape';
import { MAST_HOIST_KEYFRAMES, MINI, growKeyframes, hoistGrowth, hoistLift, miniMast, miniMastX, miniPose, miniRect } from './miniHandoff';

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

  it('takes about half a second', () => {
    expect(MINI.GROW_MS).toBeGreaterThanOrEqual(400);
    expect(MINI.GROW_MS).toBeLessThanOrEqual(650);
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

  it('is hoisted on an arc, grows a touch past the screen and settles on it', () => {
    expect(hoistGrowth(0)).toBe(0);
    expect(hoistGrowth(1)).toBeCloseTo(1, 10);
    const peak = Math.max(...Array.from({ length: 41 }, (_, i) => hoistGrowth(i / 40)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThan(1 + 2 * MINI.OVERSHOOT);
    expect(hoistLift(0)).toBe(0);
    expect(hoistLift(0.35)).toBeCloseTo(MINI.HOIST_PX, 6);
    expect(hoistLift(1)).toBe(0);
    // the mast stretches with it, then goes back in before the picture covers the screen
    expect(MAST_HOIST_KEYFRAMES[1].transform).toBe('scaleY(1.3)');
    expect(MAST_HOIST_KEYFRAMES.at(-1)).toMatchObject({ transform: 'scaleY(0)', opacity: 0 });
  });
});

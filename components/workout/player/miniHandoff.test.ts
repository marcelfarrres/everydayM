import { describe, expect, it } from 'vitest';
import { widgetLayout } from '@/components/workout/rocketShape';
import { MINI, growKeyframes, miniPose, miniRect } from './miniHandoff';

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
});

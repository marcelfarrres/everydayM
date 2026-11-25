import { describe, expect, it } from 'vitest';
import { panelLayout, widgetLayout } from '@/components/workout/rocketShape';
import { MINI, growKeyframes, handoffTimes, miniClipY, miniOutKeyframes, miniPose, miniRect, swollenRect } from './miniHandoff';

describe('the next exercise, from its window to the whole screen', () => {
  const vw = 390;
  const vh = 844;
  const L = widgetLayout(vw - 12);
  const rect = miniRect(vw, vh, L);

  it('stands over the left end of the first panel, 15 % bigger than the old preview, clear of it', () => {
    expect(MINI.W).toBe(Math.round(60 * 1.15));
    expect(MINI.H).toBe(Math.round(106 * 1.15));
    const P = panelLayout(L);
    const panelTop = vh - MINI.BOTTOM - L.box + P.top;
    expect(rect.top + rect.height).toBeLessThanOrEqual(panelTop - 4);
    expect(rect.left).toBeGreaterThanOrEqual((vw - L.B) / 2 + P.left);
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

  it('slides up out of the rocket from behind its first panel (no mast), and never crosses the panel', () => {
    for (const [w, h] of [
      [390, 844],
      [360, 740],
      [320, 568],
    ]) {
      for (const stack of [undefined, { blocks: 3, first: 3, boosters: false }]) {
        const S = widgetLayout(w - 12, stack);
        const P = panelLayout(S);
        const panelTop = h - MINI.BOTTOM - S.box + P.top;
        const r = miniRect(w, h, S);
        // over the panel's left end, inside the hull's straight part, whatever is left of the rocket
        expect(r.left).toBe(Math.round((w - S.B) / 2 + P.left + MINI.INSET));
        expect(r.left + r.width).toBeLessThan((w - S.B) / 2 + P.right);
        // clear of the panel, and of the panel's top even swollen (it grows upward)
        expect(miniClipY(w, h, S)).toBe(Math.round(panelTop));
        expect(r.top + r.height).toBeLessThanOrEqual(miniClipY(w, h, S) - MINI.GAP + 0.5);
        const big = swollenRect(r);
        expect(big.top + big.height).toBeCloseTo(r.top + r.height, 6);
        // it starts wholly under the panel's top (hidden), and ends in its place
        const keys = miniOutKeyframes(w, h, S);
        const down = Number(/translateY\(([-\d.]+)px\)/.exec(String(keys[0].transform))?.[1]);
        expect(r.top + down).toBeGreaterThanOrEqual(miniClipY(w, h, S));
        expect(keys.at(-1)?.transform).toBe('translateY(0px)');
        expect(r.top).toBeGreaterThan(h / 3);
      }
    }
  });

});

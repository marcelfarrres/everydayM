import { describe, expect, it } from 'vitest';
import { panelLayout, widgetLayout } from '@/components/workout/rocketShape';
import { LONG_REST_READY_SECONDS } from '@/lib/routine/duration';
import { HANDOFF, MINI, growKeyframes, miniClipY, miniOutKeyframes, miniPose, miniRect } from './miniHandoff';

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

  it('"Saltar": fades the rest to black first, then fills the screen in about 0.4 s', () => {
    expect(MINI.GROW_MS).toBeGreaterThanOrEqual(350);
    expect(MINI.GROW_MS).toBeLessThanOrEqual(450);
    expect(HANDOFF.fade).toBeLessThan(400);
    expect(HANDOFF.total).toBe(HANDOFF.fade + MINI.GROW_MS);
  });

  it('the last seconds: grows to the screen well within them, behind a light veil, with ~0.5 s crossfades', () => {
    expect(MINI.READY_GROW_MS).toBeLessThan(LONG_REST_READY_SECONDS * 1000 - 2000);
    expect(MINI.VEIL).toBeGreaterThan(0.3);
    expect(MINI.VEIL).toBeLessThan(0.6);
    expect(MINI.CROSSFADE_MS).toBeGreaterThanOrEqual(400);
    expect(MINI.CROSSFADE_MS).toBeLessThanOrEqual(600);
    // it waits on its first frame only in the last second
    expect(MINI.HOLD_S).toBeLessThan(LONG_REST_READY_SECONDS);
    const keys = growKeyframes(rect, vw, vh);
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
        // clear of the panel's top
        expect(miniClipY(w, h, S)).toBe(Math.round(panelTop));
        expect(r.top + r.height).toBeLessThanOrEqual(miniClipY(w, h, S) - MINI.GAP + 0.5);
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

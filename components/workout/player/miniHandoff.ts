import type { WidgetLayout } from '@/components/workout/rocketShape';

/*
 * Phone, a long rest with talks: the next exercise plays in a small window above the rocket's
 * banner. When the rest ends, that same video grows from the window to the whole screen while the
 * talk fades under it (pure geometry and keyframes; Stage plays them).
 *
 * The window is the full-screen picture mapped onto a small rectangle with two transforms: the
 * outer layer scales the screen onto the window (each axis on its own) and clips it; the inner one
 * scales back so the video itself is scaled the same both ways (no stretching), as a cover.
 */

export const MINI = {
  /** the window, px (the old preview's 60 × 106, 15 % bigger) */
  W: 69,
  H: 122,
  /** its corners, px on screen */
  RADIUS: 12,
  /** between the window and the banner, and from the banner's left end */
  GAP: 8,
  INSET: 10,
  /** the widget's gap above the bottom of the screen (RocketWidget) */
  BOTTOM: 6,
  /** how long it takes to fill the screen */
  GROW_MS: 520,
  /** keyframes sampled along the way (so the video is never stretched in between) */
  STEPS: 12,
} as const;

export interface MiniRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Where the window stands on a `vw` × `vh` screen, over the left end of the widget's banner. */
export function miniRect(vw: number, vh: number, L: Pick<WidgetLayout, 'B' | 'box' | 'banner'>): MiniRect {
  const boxLeft = (vw - L.B) / 2;
  return {
    left: Math.round(boxLeft + L.banner.left + MINI.INSET),
    top: Math.round(vh - MINI.BOTTOM - L.box - MINI.GAP - MINI.H),
    width: MINI.W,
    height: MINI.H,
  };
}

const r = (n: number, d = 4) => Number(n.toFixed(d));

/** The two layers' transforms (and the outer's corners) at a point `e` (0: the window, 1: the whole screen). */
export function miniPose(rect: MiniRect, vw: number, vh: number, e: number) {
  const sx = rect.width / vw;
  const sy = rect.height / vh;
  const cover = Math.max(sx, sy);
  const osx = sx + (1 - sx) * e;
  const osy = sy + (1 - sy) * e;
  const u = cover + (1 - cover) * e; // the video's own scale, the same both ways
  const radius = MINI.RADIUS * (1 - e);
  return {
    outer: `translate(${r(rect.left * (1 - e), 2)}px, ${r(rect.top * (1 - e), 2)}px) scale(${r(osx)}, ${r(osy)})`,
    inner: `scale(${r(u / osx)}, ${r(u / osy)})`,
    radius: `${r(radius / osx, 2)}px / ${r(radius / osy, 2)}px`,
    /** the video's scale on screen, each way (tests) */
    net: { x: (u / osx) * osx, y: (u / osy) * osy },
  };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Window → whole screen, sampled (play them linearly: the curve is in the samples). */
export function growKeyframes(rect: MiniRect, vw: number, vh: number) {
  return Array.from({ length: MINI.STEPS + 1 }, (_, i) => {
    const t = i / MINI.STEPS;
    const p = miniPose(rect, vw, vh, ease(t));
    return { offset: r(t), outer: p.outer, inner: p.inner, radius: p.radius };
  });
}

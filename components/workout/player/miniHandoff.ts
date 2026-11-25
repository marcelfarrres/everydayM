import { BANNER, SHIP, type WidgetLayout } from '@/components/workout/rocketShape';

/*
 * Phone, a long rest with talks: the next exercise plays in a small window above the rocket's
 * banner, on its own mast that comes out of the rocket's body (like the banner's). In the talk's
 * last seconds the window swells a little, calmly, and waits. When the talk ends it fades to black
 * (the picture only), and then that same video simply grows to the whole screen and the exercise
 * starts ("Saltar": a shorter fade, no swell). Pure geometry and keyframes; Stage plays them.
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
  /** the swell of the last seconds: this much bigger, over this long, from this many seconds left */
  SWELL: 1.25,
  SWELL_MS: 1800,
  SWELL_S: 2,
  /** the talk fades to black (after a swell; after "Saltar"), then the window fills the screen */
  FADE_MS: 400,
  FADE_SKIP_MS: 250,
  GROW_MS: 400,
  /** keyframes sampled along the way (so the video is never stretched in between) */
  STEPS: 12,
  /** seconds before the rest ends when the window stops on its first frame (so growing doesn't jump) */
  HOLD_S: 1,
} as const;

export interface MiniRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

type Layout = Pick<WidgetLayout, 'B' | 'box' | 'banner' | 'g' | 'ship'>;

/**
 * Where the window's mast stands (screen x): under the window's middle, over the left end of the
 * banner, but always over the rocket's body (a short rocket stands centred), so it comes out of it.
 */
export function miniMastX(vw: number, L: Layout): number {
  const boxLeft = (vw - L.B) / 2;
  const want = boxLeft + L.banner.left + MINI.INSET + MINI.W / 2;
  const ship = boxLeft + L.ship.left + L.ship.shift;
  const lo = ship + L.g.x0 + BANNER.MAST_W + 4;
  const hi = ship + L.g.xs - BANNER.MAST_W - 4;
  return Math.round(Math.min(hi, Math.max(lo, want)));
}

/** Where the window stands on a `vw` × `vh` screen: over the left end of the banner, on its mast. */
export function miniRect(vw: number, vh: number, L: Layout): MiniRect {
  return {
    left: Math.round(miniMastX(vw, L) - MINI.W / 2),
    top: Math.round(vh - MINI.BOTTOM - L.box - MINI.GAP - MINI.H),
    width: MINI.W,
    height: MINI.H,
  };
}

/** The window's mast (screen px): from the window's bottom down into the rocket's body. */
export function miniMast(vw: number, vh: number, L: Layout) {
  const rect = miniRect(vw, vh, L);
  const bodyTop = vh - MINI.BOTTOM - L.box + L.ship.top + SHIP.F;
  return { x: rect.left + MINI.W / 2, top: rect.top + rect.height, bottom: Math.round(bodyTop + 6) };
}

const r = (n: number, d = 4) => Number(n.toFixed(d));

/** The window swollen (`MINI.SWELL`), about the middle of its bottom edge (it stays on its mast). */
export function swollenRect(rect: MiniRect, k: number = MINI.SWELL): MiniRect {
  const width = rect.width * k;
  const height = rect.height * k;
  return { left: rect.left + (rect.width - width) / 2, top: rect.top + rect.height - height, width, height };
}

/** The two layers' transforms (and the outer's corners) at a point `e` (0: the window, 1: the whole screen). */
export function miniPose(rect: MiniRect, vw: number, vh: number, e: number) {
  const sx = rect.width / vw;
  const sy = rect.height / vh;
  const cover = Math.max(sx, sy);
  const osx = sx + (1 - sx) * e;
  const osy = sy + (1 - sy) * e;
  const u = cover + (1 - cover) * e; // the video's own scale, the same both ways
  const radius = MINI.RADIUS * (1 - e);
  const x = rect.left * (1 - e);
  const y = rect.top * (1 - e);
  return {
    outer: `translate(${r(x, 2)}px, ${r(y, 2)}px) scale(${r(osx)}, ${r(osy)})`,
    inner: `scale(${r(u / osx)}, ${r(u / osy)})`,
    radius: `${r(radius / osx, 2)}px / ${r(radius / osy, 2)}px`,
    /** the video's scale on screen, each way (tests) */
    net: { x: (u / osx) * osx, y: (u / osy) * osy },
  };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Window (`from`: as it stands, swollen or not) → whole screen, sampled (play them linearly: the curve is in the samples). */
export function growKeyframes(from: MiniRect, vw: number, vh: number) {
  return Array.from({ length: MINI.STEPS + 1 }, (_, i) => {
    const t = i / MINI.STEPS;
    const p = miniPose(from, vw, vh, ease(t));
    return { offset: r(t), outer: p.outer, inner: p.inner, radius: p.radius };
  });
}

/** The talk's end, to the exercise: how long the fade to black lasts, then the growth. */
export const handoffTimes = (swollen: boolean) => {
  const fade = swollen ? MINI.FADE_MS : MINI.FADE_SKIP_MS;
  return { fade, grow: MINI.GROW_MS, total: fade + MINI.GROW_MS };
};

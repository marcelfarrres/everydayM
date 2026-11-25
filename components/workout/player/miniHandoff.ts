import { BANNER, SHIP, type WidgetLayout } from '@/components/workout/rocketShape';

/*
 * Phone, a long rest with talks: the next exercise plays in a small window above the rocket's
 * banner, on its own mast that comes out of the rocket's body (like the banner's). When the rest
 * ends the mast stretches and hoists it: that same video rises on an arc and grows to the whole
 * screen (a touch past it, and back) while the talk fades under it, and the mast goes back into
 * the rocket (pure geometry and keyframes; Stage plays them).
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
  GROW_MS: 550,
  /** how high the arc of the hoist goes (px), and how far past the screen it grows (fraction) */
  HOIST_PX: 46,
  OVERSHOOT: 0.035,
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

/**
 * The two layers' transforms (and the outer's corners) at a point `e` (0: the window, 1: the whole
 * screen, a little more past it), `lift` px higher (the arc of the hoist).
 */
export function miniPose(rect: MiniRect, vw: number, vh: number, e: number, lift = 0) {
  const sx = rect.width / vw;
  const sy = rect.height / vh;
  const cover = Math.max(sx, sy);
  const osx = sx + (1 - sx) * e;
  const osy = sy + (1 - sy) * e;
  const u = cover + (1 - cover) * e; // the video's own scale, the same both ways
  const radius = MINI.RADIUS * Math.max(0, 1 - e);
  // (past the screen it grows from its middle, so it overshoots evenly all round)
  const over = Math.max(0, e - 1);
  const x = rect.left * Math.max(0, 1 - e) - (over * vw) / 2;
  const y = rect.top * Math.max(0, 1 - e) - (over * vh) / 2 - lift;
  return {
    outer: `translate(${r(x, 2)}px, ${r(y, 2)}px) scale(${r(osx)}, ${r(osy)})`,
    inner: `scale(${r(u / osx)}, ${r(u / osy)})`,
    radius: `${r(radius / osx, 2)}px / ${r(radius / osy, 2)}px`,
    /** the video's scale on screen, each way (tests) */
    net: { x: (u / osx) * osx, y: (u / osy) * osy },
  };
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/** How far it has grown at `t` (0..1 of the time): eased, a touch past the screen near the end, and back. */
export const hoistGrowth = (t: number) => ease(t) + MINI.OVERSHOOT * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.55) / 0.45)));
/** How high the arc has it at `t`: up first (the mast pushing it), and down onto the screen. */
export const hoistLift = (t: number) => MINI.HOIST_PX * Math.sin(Math.PI * Math.min(1, t / 0.7)) * (t < 0.7 ? 1 : 0);

/** Window → whole screen, sampled (play them linearly: the curve is in the samples). */
export function growKeyframes(rect: MiniRect, vw: number, vh: number) {
  return Array.from({ length: MINI.STEPS + 1 }, (_, i) => {
    const t = i / MINI.STEPS;
    const p = miniPose(rect, vw, vh, hoistGrowth(t), hoistLift(t));
    return { offset: r(t), outer: p.outer, inner: p.inner, radius: p.radius };
  });
}

/** The mast as it hoists: it stretches with the window's rise, then goes back into the rocket. */
export const MAST_HOIST_KEYFRAMES: Keyframe[] = [
  { offset: 0, transform: 'scaleY(1)', opacity: 1, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
  { offset: 0.22, transform: 'scaleY(1.3)', opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.8, 0.5)' },
  { offset: 0.5, transform: 'scaleY(0)', opacity: 1 },
  { offset: 0.51, transform: 'scaleY(0)', opacity: 0 },
  { offset: 1, transform: 'scaleY(0)', opacity: 0 },
];

import { panelLayout, type WidgetLayout } from '@/components/workout/rocketShape';

/*
 * Phone, a long rest (its talk, or the rest video): the next exercise plays in a small window over the rocket's first
 * panel; it slides up out of the rocket just after the panels (from behind the first one). In the
 * rest's last seconds (LONG_REST_READY_SECONDS) that same video grows to the whole screen and goes
 * on looping behind a light veil while the countdown ends; then the veil lifts and the exercise
 * starts from its first frame. ("Saltar" before then: the rest fades to black, and the window grows
 * at once.) Pure geometry and keyframes; Stage plays them.
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
  /** between the window and the first panel, and from the panel's left end */
  GAP: 4,
  INSET: 10,
  /** the widget's gap above the bottom of the screen (RocketWidget) */
  BOTTOM: 6,
  /** "Saltar": the rest fades to black, then the window fills the screen */
  FADE_MS: 250,
  GROW_MS: 400,
  /** the last seconds: the window grows to the whole screen over this long, behind a veil this dark */
  READY_GROW_MS: 600,
  VEIL: 0.45,
  /** every change of picture in a long rest: talk → rest video → the next exercise (and the voice with it) */
  CROSSFADE_MS: 500,
  /** the window moves when the panel under it changes height: this slowly */
  GLIDE_MS: 600,
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

type Layout = Pick<WidgetLayout, 'B' | 'box' | 'frame' | 'ship'>;

/** The rocket's first panel on a `vw` × `vh` screen (no boosters in a rest; `rise`: taller, see panelRise): its left end and its top. */
function firstPanel(vw: number, vh: number, L: Layout, rise = 0) {
  const P = panelLayout(L, false, rise);
  return { left: (vw - L.B) / 2 + P.left, top: vh - MINI.BOTTOM - L.box + P.top };
}

/** Where the window stands on a `vw` × `vh` screen: over the left end of the rocket's first panel. */
export function miniRect(vw: number, vh: number, L: Layout, rise = 0): MiniRect {
  const p = firstPanel(vw, vh, L, rise);
  return {
    left: Math.round(p.left + MINI.INSET),
    top: Math.round(p.top - MINI.GAP - MINI.H),
    width: MINI.W,
    height: MINI.H,
  };
}

/**
 * Where the window comes out of the rocket (screen y): the top of its first panel. It slides up
 * from behind the panel (the rocket is drawn over the stage), and nothing of it shows below this
 * line, so it never crosses the panel.
 */
export function miniClipY(vw: number, vh: number, L: Layout, rise = 0): number {
  return Math.round(firstPanel(vw, vh, L, rise).top);
}

/** Its way out: from wholly under that line up to its place (transforms of its outer layer, px). */
export function miniOutKeyframes(vw: number, vh: number, L: Layout, rise = 0): Keyframe[] {
  const rect = miniRect(vw, vh, L, rise);
  const down = miniClipY(vw, vh, L, rise) - rect.top;
  return [
    { offset: 0, transform: `translateY(${down}px)`, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
    { offset: 1, transform: 'translateY(0px)' },
  ];
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

/** Window (`from`) → whole screen, sampled (play them linearly: the curve is in the samples). */
export function growKeyframes(from: MiniRect, vw: number, vh: number) {
  return Array.from({ length: MINI.STEPS + 1 }, (_, i) => {
    const t = i / MINI.STEPS;
    const p = miniPose(from, vw, vh, ease(t));
    return { offset: r(t), outer: p.outer, inner: p.inner, radius: p.radius };
  });
}

/** "Saltar" from the window to the exercise: how long the fade to black lasts, then the growth. */
export const HANDOFF = { fade: MINI.FADE_MS, grow: MINI.GROW_MS, total: MINI.FADE_MS + MINI.GROW_MS } as const;

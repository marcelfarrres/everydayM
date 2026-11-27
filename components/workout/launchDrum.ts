/*
 * The rocket base of the first screen (phone), as pure numbers: the selection wheel of suggestion
 * rockets (five in sight: the chosen one in the centre band at full size, its two neighbours
 * smaller and fainter, the two outer ones smaller still, faint, a little blurred and cut by the
 * panel's edge), its inertia and settling, its roulette, where everything sits in the base, and the
 * launch's timeline. LaunchBase.tsx moves the elements with these, frame by frame, through refs.
 *
 * Positions on the wheel are a float `pos`: rocket i is centred when pos ≡ i (mod n). It wraps
 * around endlessly.
 */

export const WHEEL = {
  /** the neighbours' size (of the centred one's), at most */
  near: 0.66,
  /** the outer rockets' size, as a share of the neighbours' */
  farShare: 0.7,
  /** their opacity: centre, neighbours, outer ones, gone */
  opacity: [1, 0.62, 0.3, 0] as readonly number[],
  /** the outer ones' blur, px (the centre and its neighbours stay crisp) */
  farBlur: 1.2,
  /** px between the centred rocket's box and a neighbour's (the band's edge is in the middle) */
  gap: 6,
  /** px between a neighbour's box and an outer one's */
  farGap: 2,
  /** from this far off the centre (in steps) a rocket can't be tapped */
  hideAt: 2.7,
  /** from this far it can't be seen at all: its sentence may change then (Random) */
  unseenAt: 3,
  /** a drag counts once it goes this far, px (a shorter one is a tap) */
  dragSlop: 6,
  /** a plain snap to the nearest rocket, ms */
  snapMs: 320,
  /** the glide after a flick: it would travel velocity × this (an exponential slow-down), ms */
  glideTau: 380,
  /** the glide's curve: 1 - (1 - p)^glideK (its speed at the start is glideK × distance / time) */
  glideK: 3,
  minGlideMs: 240,
  maxGlideMs: 2400,
  /** a flick never throws further than this, steps */
  maxGlideSteps: 30,
  /** slower than this, steps per ms, the release is a plain snap */
  flickMin: 0.0015,
  /** the spin each time the start screen loads, ms */
  entryMs: 1400,
} as const;

/** Rocket i's offset from the centre, in steps, wrapped to [-n/2, n/2). */
export function wrapOffset(i: number, pos: number, n: number): number {
  if (n <= 0) return 0;
  let d = (((i - pos) % n) + n) % n;
  if (d >= n / 2) d -= n;
  return d;
}

/** The centred rocket's index for a wheel at `pos`. */
export function centreIndex(pos: number, n: number): number {
  if (n <= 0) return 0;
  return ((Math.round(pos) % n) + n) % n;
}

/** The wheel position (an integer) that centres rocket `index` with the shortest turn from `pos`. */
export function nearestPos(pos: number, index: number, n: number): number {
  return Math.round(pos + wrapOffset(index, pos, n));
}

/**
 * The wheel's places for a centred rocket box `h` px tall in a panel `panelH` px tall: each slot's
 * distance from the centre (px) and size, for 0 (centre), 1 (neighbour), 2 (outer) and 3 (gone).
 * The neighbours fit whole inside the panel; the outer ones sit on its edge.
 */
export interface WheelMetrics {
  y: readonly [number, number, number, number];
  scale: readonly [number, number, number, number];
  /** the selection band's half height, px */
  band: number;
}

export function wheelMetrics(h: number, panelH: number): WheelMetrics {
  const half = panelH / 2;
  const s1 = Math.max(0.42, Math.min(WHEEL.near, (half - 3 - h / 2 - WHEEL.gap) / h));
  const s2 = s1 * WHEEL.farShare;
  const s3 = s2 * 0.8;
  const y1 = h / 2 + WHEEL.gap + (s1 * h) / 2;
  // (on the panel's edge, a little more in than out, even when there is room for it whole)
  const y2 = Math.max(y1 + (s1 * h) / 2 + WHEEL.farGap + (s2 * h) / 2, half - 0.1 * s2 * h);
  const y3 = y2 + (s2 * h) / 2 + WHEEL.farGap + (s3 * h) / 2;
  return { y: [0, y1, y2, y3], scale: [1, s1, s2, s3], band: h / 2 + WHEEL.gap / 2 };
}

export interface WheelSlot {
  y: number;
  scale: number;
  opacity: number;
  /** px (0: crisp) */
  blur: number;
  z: number;
  /** can be tapped */
  visible: boolean;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const BLUR_AT = [0, 0, WHEEL.farBlur, WHEEL.farBlur * 1.4] as const;

/** Where a rocket `d` steps from the centre sits on the wheel (in between two slots: in between). */
export function wheelSlot(d: number, m: WheelMetrics): WheelSlot {
  const a = Math.abs(d);
  const sign = d < 0 ? -1 : 1;
  let y: number;
  let scale: number;
  let opacity: number;
  let blur: number;
  if (a >= 3) {
    // (the ones out of sight wait in the last slot: never laid out further away)
    y = m.y[3];
    scale = m.scale[3];
    opacity = 0;
    blur = BLUR_AT[3];
  } else {
    const i = Math.floor(a);
    const t = a - i;
    y = lerp(m.y[i], m.y[i + 1], t);
    scale = lerp(m.scale[i], m.scale[i + 1], t);
    opacity = lerp(WHEEL.opacity[i], WHEEL.opacity[i + 1], t);
    blur = lerp(BLUR_AT[i], BLUR_AT[i + 1], t);
  }
  return {
    y: sign * y,
    scale,
    opacity: Math.max(0, Math.min(1, opacity)),
    blur: Math.round(blur * 10) / 10,
    z: Math.max(0, Math.round(100 - a * 25)),
    visible: a < WHEEL.hideAt,
  };
}

/**
 * Where a drag let go at `pos`, moving `velocity` steps per ms, comes to rest and how long it
 * takes: a flick glides on (about velocity × glideTau further), slowing down smoothly, and settles
 * exactly on a rocket; it starts at the finger's speed (unless the time is capped). A slow release
 * is a plain snap to the nearest one.
 */
export function glide(pos: number, velocity: number): { to: number; dur: number } {
  const v = Number.isFinite(velocity) ? velocity : 0;
  const near = Math.round(pos);
  if (Math.abs(v) < WHEEL.flickMin) return { to: near, dur: WHEEL.snapMs };
  const throwBy = Math.max(-WHEEL.maxGlideSteps, Math.min(WHEEL.maxGlideSteps, v * WHEEL.glideTau));
  const to = Math.round(pos + throwBy);
  // (rounded back against the throw: a plain snap)
  if ((to - pos) * v <= 0) return { to: near, dur: WHEEL.snapMs };
  const dur = (WHEEL.glideK * Math.abs(to - pos)) / Math.abs(v);
  return { to, dur: Math.max(WHEEL.minGlideMs, Math.min(WHEEL.maxGlideMs, dur)) };
}

/** The glide's slow-down (see WHEEL.glideK). */
export function glideEase(p: number): number {
  const t = Math.max(0, Math.min(1, p));
  return 1 - (1 - t) ** WHEEL.glideK;
}

/**
 * The spin each time the start screen loads: from more than a full turn back, fast at first and
 * slowing down (the roulette's curve) until it stops on `index`.
 */
export function entrySpin(index: number, n: number): { from: number; to: number; dur: number } {
  if (n < 2) return { from: index, to: index, dur: 0 };
  return { from: index - (n + 3), to: index, dur: WHEEL.entryMs };
}

/** The wheel's speed at `p` (0..1) of a turn from `from` to `to` over `dur` ms with `ease`, steps per s. */
export function animSpeed(from: number, to: number, dur: number, p: number, ease: (p: number) => number): number {
  if (dur <= 0) return 0;
  const h = 0.004;
  const a = Math.max(0, Math.min(1, p) - h);
  const b = Math.min(1, Math.max(0, p) + h);
  if (b <= a) return 0;
  return (Math.abs(to - from) * Math.abs(ease(b) - ease(a))) / (((b - a) * dur) / 1000);
}

/** The clamps either side of the band: open while the wheel moves, shut on the rocket once it settles. */
export function clampsOpen(moving: boolean): boolean {
  return moving;
}

/** How many steps the roulette turns: more than one full turn, landing on another suggestion. */
export function rouletteSteps(n: number, random: () => number = Math.random): number {
  if (n <= 1) return n;
  const k = 1 + Math.min(n - 2, Math.floor(random() * (n - 1)));
  return n + k;
}

/** How long the roulette spins for `steps` steps, ms. */
export function rouletteMs(steps: number): number {
  return Math.min(2600, 1700 + steps * 40);
}

/** The roulette's deceleration: fast at first, a long slow end (like a wheel losing speed). */
export function rouletteEase(p: number): number {
  const t = Math.max(0, Math.min(1, p));
  return 1 - (1 - t) ** 3.2;
}

/** A snap's ease-out. */
export function snapEase(p: number): number {
  const t = Math.max(0, Math.min(1, p));
  return 1 - (1 - t) ** 3;
}

/** Ratchet clicks owed between two wheel positions: one per rocket passing the centre. */
export function ticksBetween(prev: number, next: number): number {
  return Math.abs(Math.round(next) - Math.round(prev));
}

// ---------------------------------------------------------------------------------------------
// Where everything sits in the base

export interface BaseLayout {
  width: number;
  height: number;
  /** the lattice towers, left and right (out of sight at rest: they come for a launch, or the ladder) */
  tower: { w: number; leftX: number; rightX: number; top: number; bottom: number };
  /** the rockets of the wheel: their box's left edge, length and body thickness */
  rocket: { left: number; length: number; body: number; height: number; cx: number };
  /** the heading row («O elige una rutina hecha» and Random) */
  head: { y: number; h: number };
  /** the wheel's translucent panel; its selection band runs between the towers' inner edges */
  panel: { x: number; y: number; w: number; h: number; r: number };
  band: { x0: number; x1: number };
  centreY: number;
  wheel: WheelMetrics;
  /** the horizon (the ground starts there) */
  horizon: number;
  /** the launch pad's deck (top) for the launch */
  padY: number;
}

/** The rocket's box height for a body of `T` (fins included: padRocketGeometry's H). */
export const rocketBoxHeight = (T: number) => Math.round((T + 2 * 0.43 * T) * 10) / 10;

export const SCENE = {
  /** the sketch's width, px: everything in it scales by width / this */
  sketchW: 320,
  /** the far skyline's tallest piece (the water tower) above the horizon, sketch px */
  skylineH: 26,
  /** the ground's share of the base's height (sketch: 43 of 278) */
  groundShare: 0.155,
  /** the least ground: the road must fit, px */
  minGround: 24,
  /** the heading row's height, and the gap under it, px */
  headH: 40,
  headGap: 6,
  /** the panel ends this far above the horizon (unless it needs the room) */
  panelLift: 4,
  /** the panel is at least this many centred rockets tall (on a short screen it reaches over the ground) */
  panelMin: 2.9,
  /** room under the launch pad for the lit flame, in hull thicknesses */
  flameRoom: 1.15,
  /** on a short base the centred rocket is at most the panel's room / this tall, and never thinner than minBody px */
  bodyFit: 2.4,
  minBody: 24,
} as const;

/**
 * The base `width` × `height` px, with `safeBottom` px of the screen's bottom inset (home bar):
 * the heading row on top, the wheel's panel under it down to the horizon (further, over the
 * ground, on a short screen, so the five fit), the rocket as ever between the towers' places
 * (the launch needs them there).
 */
export function baseLayout(width: number, height: number, safeBottom = 0): BaseLayout {
  const W = Math.max(280, width);
  const Hb = Math.max(160, height);
  const tw = Math.round(Math.min(22, Math.max(14, W * 0.05)));
  const edge = 6;
  const tower = { w: tw, leftX: edge, rightX: W - edge - tw, top: 8, bottom: Hb - 4 };
  const inner = edge + tw + 6;
  // (on a short base the rockets get thinner, so the five still show on the wheel)
  const room = Hb - SCENE.headH - SCENE.headGap - 8;
  const body = Math.round(Math.min(42, Math.max(30, (W - 2 * inner) * 0.13), Math.max(SCENE.minBody, room / (rocketBoxHeight(1) * SCENE.bodyFit))));
  // room on the left for the centred rocket's flame (lit at half: half a hull long), clear of the tower
  const left = inner + Math.round(body * 0.5);
  const length = W - inner - left;
  const rocketH = rocketBoxHeight(body);

  const ground = Math.max(SCENE.minGround, Math.round(Hb * SCENE.groundShare));
  const horizon = Hb - ground;
  const head = { y: 0, h: SCENE.headH };
  const top = head.y + head.h + SCENE.headGap;
  const floor = Hb - Math.max(8, safeBottom + 6);
  const bottom = Math.min(floor, Math.max(horizon - SCENE.panelLift, top + rocketH * SCENE.panelMin));
  const px = tower.leftX + tw - 10;
  const panel = { x: px, y: top, w: W - 2 * px, h: Math.round(bottom - top), r: 18 };
  const centreY = Math.round(panel.y + panel.h / 2);
  // (the pad stands high enough for the lit flame under it to show whole above the screen's bottom)
  const padY = Math.round(Hb - Math.max(8, safeBottom + 4) - Math.round(body * SCENE.flameRoom));
  return {
    width: W,
    height: Hb,
    tower,
    rocket: { left, length, body, height: rocketH, cx: left + length / 2 },
    head,
    panel,
    band: { x0: tower.leftX + tw, x1: tower.rightX },
    centreY,
    wheel: wheelMetrics(rocketH, panel.h),
    horizon,
    padY,
  };
}

// ---------------------------------------------------------------------------------------------
// The scene behind the wheel ("Amanecer", approved 26-11-2026: fondos-base.html, variant A): a
// dawn sky from the page's own dark down to a warm horizon, a far skyline, the ground with its
// road. The sketch is drawn 320 px wide; its pieces scale with the base's width (`k`).

export interface BaseScene {
  k: number;
  /** y of the horizon (the ground starts there) and the top of the skyline */
  horizon: number;
  skylineTop: number;
  /** the road on the ground */
  road: { top: number; h: number };
}

/** The scene for a base `L`: the horizon as low as the sketch has it, with room for the road. */
export function baseScene(L: BaseLayout): BaseScene {
  const k = L.width / SCENE.sketchW;
  const horizon = L.horizon;
  const below = L.height - horizon;
  const road = { top: horizon + Math.round(below * 0.21), h: Math.max(12, Math.round(below * 0.46)) };
  return { k, horizon, skylineTop: horizon - SCENE.skylineH * k, road };
}

// ---------------------------------------------------------------------------------------------
// The launch, from the tap on the centred rocket to lift-off

export const LAUNCH = {
  /** the crew walks to the hatch in at most this long (faster if they are far) */
  maxWalkMs: 420,
  doorMs: 150,
  hopMs: 280,
  hopGapMs: 210,
  fadeMs: 220,
  turnMs: 380,
  towerMs: 380,
  dockMs: 150,
  igniteMs: 360,
  liftMs: 600,
  /** reduced motion: the whole thing is a short fade */
  reducedMs: 260,
} as const;

export interface LaunchTimeline {
  doorOpenAt: number;
  hopAt: [number, number];
  doorCloseAt: number;
  fadeAt: number;
  turnAt: number;
  towerAt: number;
  dockAt: number;
  igniteAt: number;
  liftAt: number;
  /** out of sight: the next view comes */
  endAt: number;
}

/** One thing at a time: the crew boards, the drum goes, the rocket stands up, the tower docks, ignition, lift-off. */
export function launchTimeline(walkMs: number): LaunchTimeline {
  const walk = Math.max(0, Math.min(LAUNCH.maxWalkMs, walkMs));
  const doorOpenAt = walk;
  const b = doorOpenAt + LAUNCH.doorMs;
  const a = b + LAUNCH.hopGapMs;
  const doorCloseAt = a + LAUNCH.hopMs;
  const fadeAt = doorCloseAt + LAUNCH.doorMs;
  const turnAt = fadeAt + LAUNCH.fadeMs;
  const towerAt = turnAt + LAUNCH.turnMs;
  const dockAt = towerAt + LAUNCH.towerMs;
  const igniteAt = dockAt + LAUNCH.dockMs;
  const liftAt = igniteAt + LAUNCH.igniteMs;
  return { doorOpenAt, hopAt: [b, a], doorCloseAt, fadeAt, turnAt, towerAt, dockAt, igniteAt, liftAt, endAt: liftAt + LAUNCH.liftMs };
}

/**
 * A text bar's rocket brought to the pad at a wheel rocket's length: at this scale of its own size,
 * and its body's thickness there, px. (The bar no longer flies from the pad; the questions' rocket
 * still takes its hull from this: assembly.ts padHull.)
 */
export function barOnPad(L: BaseLayout, barLength: number, barBody: number): { scale: number; body: number } {
  const scale = barLength > 0 ? L.rocket.length / barLength : 1;
  return { scale, body: barBody * scale };
}

/**
 * Where a rocket's round window is once it stands on the pad, in the base (px): the rocket's box
 * `box` (W × H, lying, nose right) with its window `win` (in the box), its box centred at
 * (`cx`, `cy`), turned upright about that centre and shrunk by `scale` and moved down `standY`
 * (the launch's `translate(0, standY) rotate(-90deg) scale(scale)`). Also the top of the rocket
 * (the antenna's light).
 */
export function standingWindow(
  box: { W: number; H: number },
  win: { cx: number; cy: number; r: number },
  at: { cx: number; cy: number; standY: number; scale: number },
): { x: number; y: number; r: number; top: number } {
  const s = at.scale;
  return {
    x: at.cx + s * (win.cy - box.H / 2),
    y: at.cy + at.standY - s * (win.cx - box.W / 2),
    r: win.r * s,
    top: at.cy + at.standY - (s * box.W) / 2,
  };
}

/**
 * When, during a roulette from `from` turning `steps`, the rocket `index` is out of sight
 * (WHEEL.unseenAt steps or more from the centre), as a share of the spin (0..1): its sentence can be changed then
 * without anyone seeing it. 0 when it already is; the fastest moment when it never is.
 */
export function rouletteSwapAt(from: number, steps: number, n: number, index: number): number {
  for (let i = 0; i <= 200; i++) {
    const p = i / 200;
    if (Math.abs(wrapOffset(index, from + steps * rouletteEase(p), n)) >= WHEEL.unseenAt) return p;
  }
  return 0;
}

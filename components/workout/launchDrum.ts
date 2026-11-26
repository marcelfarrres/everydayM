/*
 * The rocket base of the first screen (phone), as pure numbers: the drum of suggestion rockets
 * (a wheel seen from above: the centred one full size, its neighbours smaller and fainter), its
 * snapping and its roulette, where everything sits in the base, and the launch's timeline.
 * LaunchBase.tsx moves the elements with these, frame by frame, through refs.
 *
 * Positions on the drum are a float `pos`: rocket i is centred when pos ≡ i (mod n).
 */

export const DRUM = {
  /** radians between two rockets on the wheel */
  step: 0.62,
  /** past this angle a rocket is hidden (and not tappable) */
  hideAt: 1.2,
  /** a drag of this many px (times the radius share) moves the drum one step */
  flickMs: 140,
  snapMs: 320,
  /** the drum counts as moved once a drag goes this far, px (a shorter one is a tap) */
  dragSlop: 6,
} as const;

/** Rocket i's offset from the centre, in steps, wrapped to [-n/2, n/2). */
export function wrapOffset(i: number, pos: number, n: number): number {
  if (n <= 0) return 0;
  let d = (((i - pos) % n) + n) % n;
  if (d >= n / 2) d -= n;
  return d;
}

export interface DrumSlot {
  y: number;
  scale: number;
  opacity: number;
  z: number;
  visible: boolean;
}

/** Where a rocket `d` steps from the centre sits on a wheel of radius `radius` px. */
export function drumSlot(d: number, radius: number): DrumSlot {
  const a = d * DRUM.step;
  if (Math.abs(a) > DRUM.hideAt) return { y: Math.sign(a) * radius, scale: 0.4, opacity: 0, z: 0, visible: false };
  const c = Math.cos(a);
  return {
    y: Math.sin(a) * radius,
    scale: 0.4 + 0.6 * c * c,
    opacity: Math.max(0, Math.min(1, c * c * c)),
    z: Math.round(c * 100),
    visible: true,
  };
}

/** The centred rocket's index for a drum at `pos`. */
export function centreIndex(pos: number, n: number): number {
  if (n <= 0) return 0;
  return ((Math.round(pos) % n) + n) % n;
}

/** The drum position (an integer) that centres rocket `index` with the shortest turn from `pos`. */
export function nearestPos(pos: number, index: number, n: number): number {
  return Math.round(pos + wrapOffset(index, pos, n));
}

/** Where a drag let go at `pos`, moving `velocity` steps per ms, comes to rest (a flick goes further). */
export function snapTarget(pos: number, velocity: number): number {
  const throwBy = Math.max(-2, Math.min(2, velocity * DRUM.flickMs));
  return Math.round(pos + (Number.isFinite(throwBy) ? throwBy : 0));
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

/** Ratchet clicks owed between two drum positions: one per rocket passing the centre. */
export function ticksBetween(prev: number, next: number): number {
  return Math.abs(Math.round(next) - Math.round(prev));
}

// ---------------------------------------------------------------------------------------------
// Where everything sits in the base

export interface BaseLayout {
  width: number;
  height: number;
  /** the lattice towers, left and right */
  tower: { w: number; leftX: number; rightX: number; top: number; bottom: number };
  /** the rockets of the drum: their box's left edge, length and body thickness */
  rocket: { left: number; length: number; body: number; height: number; cx: number };
  centreY: number;
  radius: number;
  /** the red button, its box (fully inside the base, above the safe area and the screen's corners) */
  random: { x: number; y: number; w: number; h: number };
  /** the launch pad's deck (top) for the launch */
  padY: number;
}

/** The rocket's box height for a body of `T` (fins included: padRocketGeometry's H). */
export const rocketBoxHeight = (T: number) => Math.round((T + 2 * 0.43 * T) * 10) / 10;

/**
 * The base `width` × `height` px, with `safeBottom` px of the screen's bottom inset (home bar).
 * The centred rocket and its two neighbours never reach the red button, nor out of the base.
 */
export function baseLayout(width: number, height: number, safeBottom = 0): BaseLayout {
  const W = Math.max(280, width);
  const Hb = Math.max(200, height);
  const tw = Math.round(Math.min(22, Math.max(14, W * 0.05)));
  const edge = 6;
  const tower = { w: tw, leftX: edge, rightX: W - edge - tw, top: 8, bottom: Hb - 4 };
  const inner = edge + tw + 6;
  const body = Math.round(Math.min(42, Math.max(30, (W - 2 * inner) * 0.13)));
  // room on the left for the centred rocket's flame (lit at half: half a hull long), clear of the tower
  const left = inner + Math.round(body * 0.5);
  const length = W - inner - left;
  const rocketH = rocketBoxHeight(body);

  const small = Hb < 270;
  const rw = small ? 56 : 64;
  const rh = Math.round(rw * 1.12);
  // never in the screen's rounded corner: well in from the right edge, above the home bar
  const rightIn = Math.max(40, Math.round(W * 0.11));
  const random = { x: W - rightIn - rw, y: Math.round(Hb - Math.max(8, safeBottom + 6) - rh), w: rw, h: rh };

  // the wheel: the neighbours (at step 0.62, scale ~0.8) just clear the centred one
  const neighbour = drumSlot(1, 1);
  const radius = Math.round((rocketH * (1 + neighbour.scale) * 0.5 * 0.92) / neighbour.y);
  const reach = neighbour.y * radius + (rocketH * neighbour.scale) / 2;
  const lowest = random.y - 4; // the lower neighbour stays above the button
  const highest = 8;
  let centreY = Math.round((highest + reach + (lowest - reach)) / 2);
  centreY = Math.max(Math.round(highest + reach), Math.min(Math.round(lowest - reach), centreY));
  const padY = Math.round(Hb - Math.max(8, safeBottom + 4) - 14);
  return { width: W, height: Hb, tower, rocket: { left, length, body, height: rocketH, cx: left + length / 2 }, centreY, radius, random, padY };
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

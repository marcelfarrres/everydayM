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
// The scene behind the drum ("Amanecer", approved 26-11-2026: fondos-base.html, variant A): a dawn
// sky from the page's own dark down to a warm horizon, a far skyline, the ground with its road,
// steel towers, and the Random button on a console bolted to the right tower. The sketch is drawn
// 320 px wide; its pieces scale with the base's width (`k`).

export const SCENE = {
  /** the sketch's width, px: everything in it scales by width / this */
  sketchW: 320,
  /** the far skyline's tallest piece (the water tower) above the horizon, sketch px */
  skylineH: 26,
  /** the ground's share of the base's height (sketch: 43 of 278) */
  groundShare: 0.155,
  /** the least ground: the road must fit, px */
  minGround: 24,
  /** the rail's light marks, px apart (they run while the drum turns) */
  railPitch: 24,
} as const;

export interface BaseScene {
  k: number;
  /** y of the horizon (the ground starts there) and the top of the skyline */
  horizon: number;
  skylineTop: number;
  /** the road on the ground */
  road: { top: number; h: number };
  /** the console of the Random button: its two brackets to the right tower (y, from x0 to x1) and two legs to the ground (x, from y0 down) */
  console: { brackets: [number, number]; x0: number; x1: number; legs: [number, number]; legTop: number };
}

/** The bottom of the lowest drum rocket that can be seen (the neighbour under the centred one), px. */
export function lowestRocketBottom(L: BaseLayout): number {
  const n1 = drumSlot(1, L.radius);
  return L.centreY + n1.y + (L.rocket.height * n1.scale) / 2;
}

/**
 * The scene for a base `L`: the horizon as low as the sketch has it, but always under the lowest
 * rocket with the whole skyline too (nothing of it behind a label), and with room for the road.
 */
export function baseScene(L: BaseLayout): BaseScene {
  const k = L.width / SCENE.sketchW;
  const ground = Math.max(SCENE.minGround, Math.round(L.height * SCENE.groundShare));
  const clearOfRockets = lowestRocketBottom(L) + 2 + SCENE.skylineH * k;
  const horizon = Math.round(Math.min(L.height - SCENE.minGround, Math.max(clearOfRockets, L.height - ground)));
  const below = L.height - horizon;
  const road = { top: horizon + Math.round(below * 0.21), h: Math.max(12, Math.round(below * 0.46)) };
  const r = L.random;
  const u = r.w / 64; // the button's drawing is 64 × 72
  return {
    k,
    horizon,
    skylineTop: horizon - SCENE.skylineH * k,
    road,
    console: {
      brackets: [Math.round(r.y + r.h * 0.17), Math.round(r.y + r.h * 0.7)],
      x0: r.x + r.w - 2,
      x1: L.tower.rightX + 2,
      legs: [Math.round(r.x + 8 * u), Math.round(r.x + r.w - 11 * u)],
      legTop: r.y + r.h - 3,
    },
  };
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

/**
 * The typed sentence's launch (phone): the same launch with the text bar's rocket. The crew may
 * have further to go (up the ladder to the bar's top) so they get a little longer, the door is the
 * round window at the nose, and the rocket first comes down from the bar to the pad while the drum
 * clears away. From the tap to out of sight: at most `maxWalkMs` + 3.08 s = 3.6 s (from their
 * place on the bar's top they walk ~0.53 s; from further they hurry).
 */
export const BAR_LAUNCH = {
  maxWalkMs: 520,
  descendMs: 420,
} as const;

export interface LaunchTimeline {
  doorOpenAt: number;
  hopAt: [number, number];
  doorCloseAt: number;
  fadeAt: number;
  /** the bar's rocket starts down to the pad (with the fade); the drum's launch has nothing here */
  descendAt: number;
  turnAt: number;
  towerAt: number;
  dockAt: number;
  igniteAt: number;
  liftAt: number;
  /** out of sight: the next view comes */
  endAt: number;
}

/**
 * One thing at a time: the crew boards, the drum goes, the rocket stands up, the tower docks,
 * ignition, lift-off. `descendMs`: the text bar's rocket comes down to the pad meanwhile the drum
 * goes (the bar's launch; it stands up once there).
 */
export function launchTimeline(walkMs: number, { maxWalkMs = LAUNCH.maxWalkMs, descendMs = 0 }: { maxWalkMs?: number; descendMs?: number } = {}): LaunchTimeline {
  const walk = Math.max(0, Math.min(maxWalkMs, walkMs));
  const doorOpenAt = walk;
  const b = doorOpenAt + LAUNCH.doorMs;
  const a = b + LAUNCH.hopGapMs;
  const doorCloseAt = a + LAUNCH.hopMs;
  const fadeAt = doorCloseAt + LAUNCH.doorMs;
  const descendAt = fadeAt;
  const turnAt = fadeAt + Math.max(LAUNCH.fadeMs, descendMs);
  const towerAt = turnAt + LAUNCH.turnMs;
  const dockAt = towerAt + LAUNCH.towerMs;
  const igniteAt = dockAt + LAUNCH.dockMs;
  const liftAt = igniteAt + LAUNCH.igniteMs;
  return { doorOpenAt, hopAt: [b, a], doorCloseAt, fadeAt, descendAt, turnAt, towerAt, dockAt, igniteAt, liftAt, endAt: liftAt + LAUNCH.liftMs };
}

/** The typed sentence's launch timeline (see BAR_LAUNCH). */
export function barLaunchTimeline(walkMs: number): LaunchTimeline {
  return launchTimeline(walkMs, { maxWalkMs: BAR_LAUNCH.maxWalkMs, descendMs: BAR_LAUNCH.descendMs });
}

/**
 * The text bar's rocket on the pad: the same length as a drum rocket (so the launch tower, its
 * arms and the lift-off fit as they are), at this scale of its own size, and its body's
 * thickness there, px (the tower's arms reach that hull).
 */
export function barOnPad(L: BaseLayout, barLength: number, barBody: number): { scale: number; body: number } {
  const scale = barLength > 0 ? L.rocket.length / barLength : 1;
  return { scale, body: barBody * scale };
}

/**
 * When, during a roulette from `from` turning `steps`, the rocket `index` is out of sight (two
 * steps or more from the centre), as a share of the spin (0..1): its sentence can be changed then
 * without anyone seeing it. 0 when it already is; the fastest moment when it never is.
 */
export function rouletteSwapAt(from: number, steps: number, n: number, index: number): number {
  for (let i = 0; i <= 200; i++) {
    const p = i / 200;
    if (Math.abs(wrapOffset(index, from + steps * rouletteEase(p), n)) >= 2) return p;
  }
  return 0;
}

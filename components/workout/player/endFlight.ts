/*
 * The end's rocket in flight (pure): its way in, and once the routine is celebrated its slow loop
 * round the screen, for as long as the screen stays. Poses are in screen pixels: where the
 * rocket's middle is, its angle (degrees, nose right = 0, positive turns clockwise), whether it is
 * mirrored (flying left, nose left, still upright), its size, and its bank (a squash across it as
 * it turns, as if it rolled into the turn).
 *
 * The loop: first it takes off from where it is parked, speeding up straight off the right edge
 * at its own height (above the title) and growing smaller; then, one after another and again from
 * the first, three passes across the screen, each from beyond one edge to beyond the other, with a
 * moment out of sight between them. The passes keep the whole rocket, turned and with its flame,
 * inside `band` (the room between the praise line and the buttons, measured on the screen): its
 * middle sweeps that band, and where a climb near the band's edge would make it poke out, it is
 * drawn a little flatter.
 *   A  from the left, low, climbing to the right
 *   B  from the right, swooping down and up again to the left (mirrored)
 *   C  from the left, dipping low and out to the right
 */

export interface FlightBox {
  vw: number;
  vh: number;
  /** where the rocket's middle stands parked */
  park: { x: number; y: number };
  /** the rocket's length and height (its frame, px at scale 1) */
  len: number;
  H: number;
  /** the passes keep the whole rocket between these (px from the top of the screen) */
  band: { top: number; bottom: number };
}

export interface Pose {
  x: number;
  y: number;
  angle: number;
  flip: 1 | -1;
  scale: number;
  bank: number;
}

export const REST_FLIGHT = {
  takeoffMs: 1700,
  passMs: 5200,
  gapMs: 900,
  /** its size while it flies round */
  scale: 0.6,
  /** how much it squashes across at its sharpest turn */
  bankMax: 0.35,
  /** how far its flame reaches out of its frame, behind it (px at scale 1) */
  flameOut: 56,
} as const;

type P = readonly [number, number];
interface Pass {
  /** control points: x as a share of the width (the ends are pushed out of sight), y as a share of the band */
  pts: readonly [P, P, P, P];
  flip: 1 | -1;
}

const PASSES: readonly Pass[] = [
  { pts: [[0, 0.79], [0.3, 1], [0.62, 0.08], [1, 0.21]], flip: 1 },
  { pts: [[1, 0.13], [0.66, 0.96], [0.34, 0.92], [0, 0.29]], flip: -1 },
  { pts: [[0, 0.17], [0.36, 0.04], [0.6, 1], [1, 0.54]], flip: 1 },
];

export const restPeriodMs = () => PASSES.length * (REST_FLIGHT.passMs + REST_FLIGHT.gapMs);

const bez = (a: number, b: number, c: number, d: number, u: number) => {
  const m = 1 - u;
  return m * m * m * a + 3 * m * m * u * b + 3 * m * u * u * c + u * u * u * d;
};
const dbez = (a: number, b: number, c: number, d: number, u: number) => {
  const m = 1 - u;
  return 3 * m * m * (b - a) + 6 * m * u * (c - b) + 3 * u * u * (d - c);
};

/** Half the rocket's length with its flame (px at `scale`): how far it reaches from its middle. */
const reach = (box: Pick<FlightBox, 'len'>, scale: number) => (box.len / 2 + REST_FLIGHT.flameOut) * scale;

/** How far beyond an edge a pass starts and ends, so the whole rocket and its flame are out of sight. */
export const offEdge = (box: FlightBox) => reach(box, REST_FLIGHT.scale) + 12;

/** Half the height the rocket takes on screen, turned `angle` degrees (its flame included), at `scale` and `bank`. */
export function halfHeight(box: Pick<FlightBox, 'len' | 'H'>, angle: number, scale: number, bank = 1): number {
  const a = (Math.abs(angle) * Math.PI) / 180;
  return reach(box, scale) * Math.sin(a) + (box.H / 2) * scale * bank * Math.cos(a);
}

/** Where the rocket's middle may go on a pass: the band less half the rocket lying level. */
function centreBand(box: FlightBox): { top: number; bottom: number } {
  const half = halfHeight(box, 0, REST_FLIGHT.scale) + 2;
  const top = box.band.top + half;
  const bottom = box.band.bottom - half;
  if (bottom >= top) return { top, bottom };
  const mid = (box.band.top + box.band.bottom) / 2;
  return { top: mid, bottom: mid };
}

function passPoints(pass: Pass, box: FlightBox): [P, P, P, P] {
  const m = offEdge(box);
  const c = centreBand(box);
  const X = (u: number) => (u <= 0 ? -m : u >= 1 ? box.vw + m : u * box.vw);
  return pass.pts.map(([u, v]) => [X(u), c.top + v * (c.bottom - c.top)] as const) as unknown as [P, P, P, P];
}

/** heading (radians) of a path at u, and how sharply it turns there (radians per unit of u) */
function headingAt(pts: readonly [P, P, P, P], u: number) {
  const h = (s: number) => {
    const v = Math.min(1, Math.max(0, s));
    return Math.atan2(dbez(pts[0][1], pts[1][1], pts[2][1], pts[3][1], v), dbez(pts[0][0], pts[1][0], pts[2][0], pts[3][0], v));
  };
  const d = 0.01;
  let turn = h(u + d) - h(u - d);
  if (turn > Math.PI) turn -= 2 * Math.PI;
  if (turn < -Math.PI) turn += 2 * Math.PI;
  return { heading: h(u), turn: Math.abs(turn) / (2 * d) };
}

const deg = (rad: number) => (rad * 180) / Math.PI;

function poseOn(pts: readonly [P, P, P, P], u: number, flip: 1 | -1, scale: number, box?: FlightBox): Pose {
  const x = bez(pts[0][0], pts[1][0], pts[2][0], pts[3][0], u);
  const y = bez(pts[0][1], pts[1][1], pts[2][1], pts[3][1], u);
  const { heading, turn } = headingAt(pts, u);
  // mirrored, the nose points left: its angle is measured from the left
  let angle = flip === 1 ? deg(heading) : deg(Math.atan2(-Math.sin(heading), -Math.cos(heading)));
  const bank = 1 - Math.min(REST_FLIGHT.bankMax, turn * 0.12);
  if (box) {
    // never out of its band: a little flatter where a climb would poke out of it
    const room = Math.min(y - box.band.top, box.band.bottom - y);
    while (Math.abs(angle) > 0.05 && halfHeight(box, angle, scale, bank) > room) angle *= 0.9;
  }
  return { x, y, angle, flip, scale, bank };
}

const easeIn = (p: number) => p * p * (1.4 - 0.4 * p);
const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);

/** The rocket `t` ms after the flight began (t ≤ 0: parked). */
export function restPose(t: number, box: FlightBox): Pose {
  const { park } = box;
  if (!(t > 0)) return { x: park.x, y: park.y, angle: 0, flip: 1, scale: 1, bank: 1 };
  if (t < REST_FLIGHT.takeoffMs) {
    // from its place straight off the right edge, at its own height (above the title): speeding up, growing smaller
    const p = t / REST_FLIGHT.takeoffMs;
    const pts: [P, P, P, P] = [
      [park.x, park.y],
      [park.x + box.vw * 0.25, park.y],
      [box.vw * 0.9, park.y],
      [box.vw + offEdge(box), park.y],
    ];
    return poseOn(pts, easeIn(p), 1, 1 + (REST_FLIGHT.scale - 1) * easeInOut(p));
  }
  const cycle = REST_FLIGHT.passMs + REST_FLIGHT.gapMs;
  const since = (t - REST_FLIGHT.takeoffMs) % (cycle * PASSES.length);
  const pass = PASSES[Math.floor(since / cycle)];
  const pts = passPoints(pass, box);
  // a moment out of sight first, then across (a steady pace, a touch slower in the middle)
  const inPass = since % cycle - REST_FLIGHT.gapMs;
  if (inPass < 0) return poseOn(pts, 0, pass.flip, REST_FLIGHT.scale, box);
  const p = inPass / REST_FLIGHT.passMs;
  const u = 0.85 * p + 0.15 * easeInOut(p);
  return poseOn(pts, u, pass.flip, REST_FLIGHT.scale, box);
}

/** The pose as a CSS transform, about the rocket's middle, from where it is parked. */
export function poseTransform(pose: Pose, park: { x: number; y: number }): string {
  const f = (n: number) => (Math.round(n * 100) / 100).toString();
  return `translate(${f(pose.x - park.x)}px, ${f(pose.y - park.y)}px) rotate(${f(pose.angle)}deg) scale(${f(pose.scale * pose.flip)}, ${f(pose.scale * pose.bank)})`;
}

/**
 * Its way in: from beyond the top left (where the bar's rocket left the screen, going up, it
 * comes back down) it dives across and levels out into its place with a small overshoot.
 * Translations relative to its place; WAAPI keyframes.
 */
export function flyInKeyframes(box: FlightBox): Keyframe[] {
  const dx = -(box.park.x + box.len / 2 + 30);
  const dy = -(box.park.y + 90);
  const t = (x: number, y: number, a: number) => `translate(${Math.round(x)}px, ${Math.round(y)}px) rotate(${a}deg)`;
  return [
    { offset: 0, transform: t(dx, dy, 34), easing: 'cubic-bezier(0.3, 0.1, 0.4, 1)' },
    { offset: 0.55, transform: t(dx * 0.22, dy * 0.08, 10), easing: 'cubic-bezier(0.3, 0, 0.3, 1)' },
    { offset: 0.82, transform: t(8, 2, -3), easing: 'ease-in-out' },
    { offset: 1, transform: t(0, 0, 0) },
  ];
}

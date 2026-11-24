/*
 * The rocket of Rocket.tsx lying on its side (nose to the right), as the phone's widget. Same
 * parts and the same line (body, bands, side fins, nozzle, edge-on fin, flame) and the same short,
 * blunt, rounded nose as Rocket's `blunt` drawing, measured in screen pixels: the body is as thick
 * as the text inside it needs and as long as the screen is wide. Pure: numbers and SVG path strings.
 *
 * Along the rocket, from the left: room for the flame, nozzle, body (tail with the edge-on fin and
 * the double band, then the content: the hilo and the name), the seam of the nose section, and the
 * nose section (a short stretch of body and the rounded dome) with the time inside it.
 * The side fins stick out above and below the tail, outside the body. Under the belly hangs the
 * control pod (anterior, pausa, siguiente; "Saltar" in a rest), clear of the bottom fin.
 * Nothing touches the text: tests check every box's clearance from every part.
 */

export const ROCKET = {
  /** body thickness (outer stroke to outer stroke) */
  T: 76,
  /** how far the side fins stick out above and below the body */
  F: 22,
  STROKE: 2,
  /** room left of the nozzle, so the flame of the ignition can be seen (less on the narrowest phones) */
  FLAME_ROOM: 24,
  FLAME_ROOM_NARROW: 16,
  NOZZLE: 16,
  /** the double band at the tail (Rocket's interstage), from the body's start */
  BAND_AT: 19,
  BAND_GAP: 5,
  /** the rounded dome at the front: as long as 0.6 of the body's thickness (Rocket's blunt nose too) */
  DOME: 46,
  /** clear space between any line of the rocket and the content */
  TEXT_GAP: 8,
  /** the time in the nose: its box's height, and its clear space from the outline */
  TIME_H: 30,
  TIME_GAP: 4,
  /** the flame at full size */
  FLAME_LENGTH: 118,
} as const;

/** The control pod under the belly. */
export const POD = {
  /** between the belly and the pod's top: the neck shows here (more than the rest's sink) */
  GAP: 12,
  /** the pod's height, outline included */
  H: 52,
  /** each button's target */
  BTN: 44,
  /** the neck goes this far up behind the body (more than the warm-up's hop) */
  NECK_HIDDEN: 8,
  NECK_W: 16,
  /** the pod for "Saltar" */
  SKIP_W: 132,
} as const;

const { T, F, STROKE, FLAME_ROOM, FLAME_ROOM_NARROW, NOZZLE, BAND_AT, BAND_GAP, DOME, TEXT_GAP, TIME_H, TIME_GAP, FLAME_LENGTH } = ROCKET;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The nose section (seam to tip): long enough for the time, a little longer on wider screens. */
export const noseLength = (width: number) => (width < 340 ? 82 : Math.min(104, Math.max(88, Math.round(width * 0.12 + 46))));
const flameRoom = (width: number) => (width < 340 ? FLAME_ROOM_NARROW : FLAME_ROOM);

// The dome, in units of (along 0..1 from its base to the tip, across -1..1). Rocket.tsx's blunt
// nose uses the same two control points.
export const DOME_CURVE = { c1: [0.59, -1], c2: [1, -0.58] } as const;
// Its side fin, in px from the body's end (u, forward) and from the body's edge (v, outwards).
const FIN: [number, number][] = [
  [84, 0],
  [62, 8],
  [38, 19],
  [0, 24],
  [-16, 24],
  [2, 0],
];
const FIN_KU = 0.85;
const FIN_KV = F / 24;

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface RocketGeometry {
  /** the rocket's box (fins included) and the widget's (the pod under it too) */
  W: number;
  H: number;
  box: number;
  cy: number;
  /** nozzle exit, body start, the seam of the nose section, the dome's base, the tip */
  xe: number;
  x0: number;
  xs: number;
  x1: number;
  tip: number;
  /** body and dome, one outline */
  hull: string;
  nozzle: string;
  nozzleLine: string;
  finTop: string;
  finBottom: string;
  edgeFin: string;
  bands: number[];
  /** the inside of body and nose, for the water (half a stroke in from the outline) */
  inside: string;
  /** where the hilo and the name go: clear of every line */
  content: Box;
  /** where the time goes, in the nose section */
  time: Box;
  /** where the top fin joins the body, towards the nose: anything above the body goes right of it */
  finReach: number;
  pod: {
    cx: number;
    top: number;
    bottom: number;
    controls: Box;
    skip: Box;
    /** how far up it goes to be out of sight, behind the body */
    hidden: number;
    /** the pivot of the rest's tilt: on the belly, over the pod's left end */
    pivot: { x: number; y: number };
  };
  /** the parts the content must not touch, as boxes (tests) */
  parts: Record<string, Box>;
}

const bez = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const m = 1 - t;
  return m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3;
};

function domePath(x1: number, d: number, cy: number, half: number): string {
  const [a1, c1] = DOME_CURVE.c1;
  const [a2, c2] = DOME_CURVE.c2;
  const p = (a: number, c: number) => `${r1(x1 + a * d)} ${r1(cy + c * half)}`;
  return `C${p(a1, c1)} ${p(a2, c2)} ${p(1, 0)} C${p(a2, -c2)} ${p(a1, -c1)} ${p(0, 1)}`;
}

/** Half the hull's thickness at `x` (its outer outline): T/2 along the body, less over the dome. */
export const hullHalfAt = (g: Pick<RocketGeometry, 'x1' | 'tip'>, x: number) => halfAt(g.x1, g.tip, x);

function halfAt(x1: number, tip: number, x: number): number {
  if (x <= x1) return T / 2;
  if (x >= tip) return 0;
  const d = tip - x1;
  // sample the upper curve and take the point nearest to x
  let best = { dx: Infinity, half: 0 };
  for (let i = 0; i <= 400; i++) {
    const t = i / 400;
    const a = bez(0, DOME_CURVE.c1[0], DOME_CURVE.c2[0], 1, t);
    const c = bez(-1, DOME_CURVE.c1[1], DOME_CURVE.c2[1], 0, t);
    const dx = Math.abs(x1 + a * d - x);
    if (dx < best.dx) best = { dx, half: -c * (T / 2) };
  }
  return best.half;
}

export function rocketGeometry(width: number): RocketGeometry {
  const W = Math.max(240, Math.round(width));
  const H = T + 2 * F;
  const cy = F + T / 2;
  const xe = flameRoom(W);
  const x0 = xe + NOZZLE;
  const tip = W - STROKE / 2;
  const x1 = tip - DOME;
  const xs = tip - noseLength(W);

  const fin = (dir: 1 | -1) => {
    const edge = dir === 1 ? F : F + T;
    const pt = ([u, v]: [number, number]) => `${r1(x0 + u * FIN_KU)} ${r1(edge - dir * v * FIN_KV)}`;
    return `M${pt(FIN[0])} C${pt(FIN[1])} ${pt(FIN[2])} ${pt(FIN[3])} L${pt(FIN[4])} L${pt(FIN[5])} Z`;
  };

  // nozzle: narrow where it meets the body, flared at its exit (Rocket: 24 -> 34 for a 38 body)
  const hb = r1(T * 0.3);
  const he = r1(T * 0.4);
  const nozzle = `M${x0} ${cy - hb} L${x0} ${cy + hb} L${xe} ${cy + he} L${xe} ${cy - he} Z`;
  const nozzleMid = r1((x0 + xe) / 2);
  const nozzleLine = `M${nozzleMid} ${r1(cy - (hb + he) / 2 + 1.5)} L${nozzleMid} ${r1(cy + (hb + he) / 2 - 1.5)}`;

  // the front fin seen edge-on, along the middle of the tail (narrow at the front, as in Rocket)
  const ef = { front: x0 + 13, back: x0 - 13 };
  const edgeFin = `M${ef.front} ${cy - 1.7} L${ef.front} ${cy + 1.7} L${ef.back} ${cy + 2.8} L${ef.back} ${cy - 2.8} Z`;

  // the tail's double band, and the seam of the nose section
  const bands = [x0 + BAND_AT, x0 + BAND_AT + BAND_GAP, xs];

  const hull = `M${x0} ${F} L${x1} ${F} ${domePath(x1, DOME, cy, T / 2)} L${x0} ${F + T} Z`;
  const i = STROKE / 2;
  const inside = `M${x0 + i} ${F + i} L${x1} ${F + i} ${domePath(x1, DOME - i, cy, T / 2 - i)} L${x0 + i} ${F + T - i} Z`;

  const content: Box = {
    left: bands[1] + STROKE / 2 + TEXT_GAP,
    right: xs - STROKE / 2 - TEXT_GAP,
    top: F + STROKE / 2,
    bottom: F + T - STROKE / 2,
  };
  const finReach = r1(x0 + FIN[0][0] * FIN_KU);

  // the time: from the seam to where the dome is still thick enough round it
  let timeRight = x1;
  while (timeRight < tip && halfAt(x1, tip, timeRight + 1) - STROKE / 2 >= TIME_H / 2 + TIME_GAP) timeRight += 1;
  const time: Box = { left: xs + STROKE / 2 + 6, right: timeRight, top: cy - TIME_H / 2, bottom: cy + TIME_H / 2 };

  // the pod: centred between the bottom fin and the tip, as wide as three 44 px buttons need
  const podW = Math.min(196, Math.max(156, Math.round(W * 0.42)));
  const podCx = Math.round((finReach + 10 + tip - 12) / 2);
  const podTop = F + T + POD.GAP;
  const podBottom = podTop + POD.H;
  const controls: Box = { left: podCx - podW / 2, right: podCx + podW / 2, top: podTop, bottom: podBottom };
  const skip: Box = { left: podCx - POD.SKIP_W / 2, right: podCx + POD.SKIP_W / 2, top: podTop, bottom: podBottom };

  return {
    W,
    H,
    box: podBottom + STROKE / 2,
    cy,
    xe,
    x0,
    xs,
    x1,
    tip,
    hull,
    nozzle,
    nozzleLine,
    finTop: fin(1),
    finBottom: fin(-1),
    edgeFin,
    bands,
    inside,
    content,
    time,
    finReach,
    pod: {
      cx: podCx,
      top: podTop,
      bottom: podBottom,
      controls,
      skip,
      hidden: POD.GAP + POD.H + 2,
      pivot: { x: controls.left, y: F + T },
    },
    parts: {
      edgeFin: { left: ef.back, right: ef.front, top: cy - 2.8, bottom: cy + 2.8 },
      tailBand: { left: bands[1] - 1, right: bands[1] + 1, top: F, bottom: F + T },
      seam: { left: xs - 1, right: xs + 1, top: F, bottom: F + T },
      finTop: { left: r1(x0 - 16 * FIN_KU), right: finReach, top: F - 24 * FIN_KV, bottom: F },
      finBottom: { left: r1(x0 - 16 * FIN_KU), right: finReach, top: F + T, bottom: F + T + 24 * FIN_KV },
    },
  };
}

/** The flame (Rocket.tsx's, pointing left), in its own box: root at the right edge, middle at `half`. */
export function flamePaths(): { w: number; h: number; outer: string; core: string } {
  const L = FLAME_LENGTH;
  const half = r1(T * 0.36);
  const at = (along: number, across: number) => `${r1(L - along * L)} ${r1(half + across * half)}`;
  const outer = `M${at(0, -1)} C${at(0.283, -1)} ${at(0.585, -0.5625)} ${at(1, 0)} C${at(0.585, 0.5625)} ${at(0.283, 1)} ${at(0, 1)} Z`;
  const core = `M${at(0.01, -0.344)} C${at(0.151, -0.344)} ${at(0.311, -0.1875)} ${at(0.472, 0)} C${at(0.311, 0.1875)} ${at(0.151, 0.344)} ${at(0.01, 0.344)} Z`;
  return { w: L, h: half * 2, outer, core };
}

export const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

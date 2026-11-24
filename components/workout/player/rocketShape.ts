/*
 * The rocket of Rocket.tsx lying on its side (nose to the right), as the phone's widget. Same
 * parts and the same curves (nose cone, body, bands, porthole, side fins, nozzle, edge-on fin,
 * flame), measured in screen pixels: the body is as thick as the text inside it needs and as long
 * as the screen is wide. Pure: everything here is numbers and SVG path strings.
 *
 * Along the rocket, from the left: room for the flame, nozzle, body (tail with the edge-on fin and
 * the double band, then the content, then the band under the fairing), nose cone with the porthole.
 * The side fins stick out above and below the tail, outside the body. The content box touches
 * nothing: tests check its clearance from every part.
 */

export const ROCKET = {
  /** body thickness (outer stroke to outer stroke) */
  T: 68,
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
  /** the band under the fairing, before the nose's base */
  FAIRING_BAND: 7,
  PORT_R: 15,
  /** porthole's distance from the nose's base */
  PORT_GAP: 6,
  /** clear space between any line of the rocket and the content */
  TEXT_GAP: 8,
  /** the flame at full size */
  FLAME_LENGTH: 110,
} as const;

const { T, F, STROKE, FLAME_ROOM, FLAME_ROOM_NARROW, NOZZLE, BAND_AT, BAND_GAP, FAIRING_BAND, PORT_R, PORT_GAP, TEXT_GAP, FLAME_LENGTH } = ROCKET;

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The nose grows a little with the screen (a 320 px phone needs the room for the name). */
export const noseLength = (width: number) => Math.min(72, Math.max(54, Math.round(width * 0.235 - 17)));
const flameRoom = (width: number) => (width < 340 ? FLAME_ROOM_NARROW : FLAME_ROOM);

// Rocket.tsx's nose: base (41..79, 118), tip (60, 8). In units of (along 0..1, across -1..1):
const NOSE = { c1: [0.418, -1], c2: [0.764, -0.526] } as const;
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
  W: number;
  H: number;
  cy: number;
  /** nozzle exit, body start, nose base, tip */
  xe: number;
  x0: number;
  x1: number;
  tip: number;
  nose: string;
  body: { x: number; y: number; w: number; h: number };
  nozzle: string;
  nozzleLine: string;
  finTop: string;
  finBottom: string;
  edgeFin: string;
  bands: number[];
  /** the inside of body and nose, for the water (half a stroke in from the outline) */
  inside: string;
  porthole: { cx: number; cy: number; r: number };
  /** where the content goes: clear of every line */
  content: Box;
  /** where the top fin joins the body, towards the nose: anything above the body goes right of it */
  finReach: number;
  /** the parts the content must not touch, as boxes (tests) */
  parts: Record<string, Box>;
}

function nosePath(x1: number, n: number, cy: number, half: number): string {
  const [a1, c1] = NOSE.c1;
  const [a2, c2] = NOSE.c2;
  const p = (a: number, c: number) => `${r1(x1 + a * n)} ${r1(cy + c * half)}`;
  return `M${p(0, -1)} C${p(a1, c1)} ${p(a2, c2)} ${p(1, 0)} C${p(a2, -c2)} ${p(a1, -c1)} ${p(0, 1)}`;
}

/** Half the nose's thickness at `x` (between its base and its tip), for the tests. */
export function noseHalfAt(g: RocketGeometry, x: number): number {
  const n = g.tip - g.x1;
  // sample the upper curve and take the point nearest to x
  let best = { dx: Infinity, half: 0 };
  for (let i = 0; i <= 400; i++) {
    const t = i / 400;
    const mt = 1 - t;
    const a = 3 * mt * mt * t * NOSE.c1[0] + 3 * mt * t * t * NOSE.c2[0] + t * t * t;
    const c = mt * mt * mt * -1 + 3 * mt * mt * t * NOSE.c1[1] + 3 * mt * t * t * NOSE.c2[1];
    const dx = Math.abs(g.x1 + a * n - x);
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
  const n = noseLength(W);
  const x1 = tip - n;

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

  const bands = [x0 + BAND_AT, x0 + BAND_AT + BAND_GAP, x1 - FAIRING_BAND];

  const i = STROKE / 2;
  const inside =
    `M${x0 + i} ${F + i} L${x1} ${F + i} ` +
    nosePath(x1, n - i, cy, T / 2 - i).replace(/^M[^C]*/, '') +
    ` L${x0 + i} ${F + T - i} Z`;

  const porthole = { cx: x1 + PORT_GAP + PORT_R, cy, r: PORT_R };
  const content: Box = {
    left: bands[1] + STROKE / 2 + TEXT_GAP,
    right: bands[2] - STROKE / 2 - TEXT_GAP,
    top: F + STROKE / 2,
    bottom: F + T - STROKE / 2,
  };
  const finReach = r1(x0 + FIN[0][0] * FIN_KU);

  return {
    W,
    H,
    cy,
    xe,
    x0,
    x1,
    tip,
    nose: `${nosePath(x1, n, cy, T / 2)} Z`,
    body: { x: x0, y: F, w: x1 - x0, h: T },
    nozzle,
    nozzleLine,
    finTop: fin(1),
    finBottom: fin(-1),
    edgeFin,
    bands,
    inside,
    porthole,
    content,
    finReach,
    parts: {
      edgeFin: { left: ef.back, right: ef.front, top: cy - 2.8, bottom: cy + 2.8 },
      tailBand: { left: bands[1] - 1, right: bands[1] + 1, top: F, bottom: F + T },
      fairingBand: { left: bands[2] - 1, right: bands[2] + 1, top: F, bottom: F + T },
      noseBase: { left: x1 - 1, right: x1 + 1, top: F, bottom: F + T },
      porthole: { left: porthole.cx - PORT_R - 1, right: porthole.cx + PORT_R + 1, top: cy - PORT_R - 1, bottom: cy + PORT_R + 1 },
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

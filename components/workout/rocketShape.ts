/*
 * The rocket of the phone, as numbers and SVG path strings (pure): a slim body lying on its side,
 * nose to the right, with Rocket.tsx's long, sharp ogive, its side fins, nozzle, the edge-on fin
 * and the double band at the tail. Drawn in screen pixels at scale 1; the same drawing (RocketShip)
 * is the widget at the bottom of the player and, scaled up and stood on its tail, the big rocket of
 * the clouds. The body carries one thing: the hilo, across nearly all of it.
 *
 * Along the rocket, from the left: room for the flame, nozzle, body (the tail with the edge-on fin
 * and the double band, then the hilo), the seam of the nose, and the nose (2.6 body widths long).
 * The side fins stick out above and below the tail, outside the body.
 *
 * The widget (widgetLayout) puts a banner on a short mast above the rocket: the name, the time
 * and the controls. Nothing touches anything else: tests check the clearances, also while the
 * rocket sinks in a rest, coughs in the warm-up and springs back with its "¡pam!".
 */

export const SHIP = {
  /** body thickness (outer stroke to outer stroke) */
  T: 30,
  /** how far the side fins stick out above and below the body */
  F: 13,
  STROKE: 2,
  /** room left of the nozzle for the flame of the ignition */
  FLAME_ROOM: 18,
  NOZZLE: 8,
  /** the double band at the tail (Rocket's interstage), from the body's start */
  BAND_AT: 9,
  BAND_GAP: 4,
  /** the nose: Rocket.tsx's fairing, as long as 2.6 body widths (Rocket: 110 for a body of 38, 2.9) */
  NOSE: 78,
  /** clear space between any line of the rocket and the hilo */
  CONTENT_GAP: 6,
  /** the flame at full size */
  FLAME_LENGTH: 72,
} as const;

const { T, F, STROKE, FLAME_ROOM, NOZZLE, BAND_AT, BAND_GAP, NOSE, CONTENT_GAP, FLAME_LENGTH } = SHIP;
const T_BASE = T;

const r1 = (n: number) => Math.round(n * 10) / 10;

// The nose, in units of (along 0..1 from its base to the tip, across -1..1): Rocket.tsx's fairing
// ("M41 118 C41 72 50 34 60 8"), so the point is long and fine.
export const NOSE_CURVE = { c1: [0.418, -1], c2: [0.764, -0.526] } as const;
// Its side fin (Rocket's), in units from the body's end (u, forward) and from the body's edge (v, outwards).
const FIN: [number, number][] = [
  [84, 0],
  [62, 8],
  [38, 19],
  [0, 24],
  [-16, 24],
  [2, 0],
];
const FIN_KU = 0.65;
const FIN_KV = F / 24;

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ShipGeometry {
  /** the drawing's box (flame room and fins included) */
  W: number;
  H: number;
  /** its body's thickness (SHIP.T, more for the creator's bar when it holds more lines) and its fins' reach */
  T: number;
  F: number;
  cy: number;
  /** nozzle exit, body start, the seam of the nose, the tip */
  xe: number;
  x0: number;
  xs: number;
  tip: number;
  /** body and nose, one outline */
  hull: string;
  nozzle: string;
  nozzleLine: string;
  finTop: string;
  finBottom: string;
  edgeFin: string;
  /** the tail's double band and the seam of the nose */
  bands: number[];
  /** the inside of body and nose, for the water (half a stroke in from the outline) */
  inside: string;
  /** where the hilo goes: clear of every line */
  content: Box;
  /** where the fins reach along the body (from its start) */
  finReach: number;
  /** the parts the hilo must not touch, as boxes (tests) */
  parts: Record<string, Box>;
}

const bez = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const m = 1 - t;
  return m * m * m * p0 + 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t * p3;
};

function nosePath(xs: number, n: number, cy: number, half: number): string {
  const [a1, c1] = NOSE_CURVE.c1;
  const [a2, c2] = NOSE_CURVE.c2;
  const p = (a: number, c: number) => `${r1(xs + a * n)} ${r1(cy + c * half)}`;
  return `C${p(a1, c1)} ${p(a2, c2)} ${p(1, 0)} C${p(a2, -c2)} ${p(a1, -c1)} ${p(0, 1)}`;
}

/** Half the hull's thickness at `x` (its outer outline): T/2 along the body, less over the nose. */
export function hullHalfAt(g: Pick<ShipGeometry, 'xs' | 'tip'> & { T?: number }, x: number): number {
  const T = g.T ?? T_BASE;
  if (x <= g.xs) return T / 2;
  if (x >= g.tip) return 0;
  const n = g.tip - g.xs;
  let best = { dx: Infinity, half: 0 };
  for (let i = 0; i <= 400; i++) {
    const t = i / 400;
    const a = bez(0, NOSE_CURVE.c1[0], NOSE_CURVE.c2[0], 1, t);
    const c = bez(-1, NOSE_CURVE.c1[1], NOSE_CURVE.c2[1], 0, t);
    const dx = Math.abs(g.xs + a * n - x);
    if (dx < best.dx) best = { dx, half: -c * (T / 2) };
  }
  return best.half;
}

/**
 * The rocket, `width` px long from the flame's room to the tip; `thickness` makes its body thicker
 * than SHIP.T (the creator's bar, one more line of text at a time): the fins, nozzle and the nose's
 * curve follow it, the nose keeps its length.
 */
export function shipGeometry(width: number, thickness: number = T_BASE): ShipGeometry {
  const T = Math.max(T_BASE, thickness);
  const W = Math.max(180, Math.round(width));
  const H = T + 2 * F;
  const cy = F + T / 2;
  const xe = FLAME_ROOM;
  const x0 = xe + NOZZLE;
  const tip = W - STROKE / 2;
  const xs = tip - NOSE;

  const fin = (dir: 1 | -1) => {
    const edge = dir === 1 ? F : F + T;
    const pt = ([u, v]: [number, number]) => `${r1(x0 + u * FIN_KU)} ${r1(edge - dir * v * FIN_KV)}`;
    return `M${pt(FIN[0])} C${pt(FIN[1])} ${pt(FIN[2])} ${pt(FIN[3])} L${pt(FIN[4])} L${pt(FIN[5])} Z`;
  };

  // nozzle: narrow where it meets the body, flared at its exit (Rocket: 24 -> 34 for a 38 body)
  const hb = r1(T * 0.3);
  const he = r1(T * 0.42);
  const nozzle = `M${x0} ${cy - hb} L${x0} ${cy + hb} L${xe} ${cy + he} L${xe} ${cy - he} Z`;
  const nozzleMid = r1((x0 + xe) / 2);
  const nozzleLine = `M${nozzleMid} ${r1(cy - (hb + he) / 2 + 1.5)} L${nozzleMid} ${r1(cy + (hb + he) / 2 - 1.5)}`;

  // the front fin seen edge-on, along the middle of the tail, up to the bands
  const ef = { front: x0 + BAND_AT - 2, back: x0 - 10 };
  const edgeFin = `M${ef.front} ${cy - 1.4} L${ef.front} ${cy + 1.4} L${ef.back} ${cy + 2.2} L${ef.back} ${cy - 2.2} Z`;

  const bands = [x0 + BAND_AT, x0 + BAND_AT + BAND_GAP, xs];
  const hull = `M${x0} ${F} L${xs} ${F} ${nosePath(xs, NOSE, cy, T / 2)} L${x0} ${F + T} Z`;
  const i = STROKE / 2;
  const inside = `M${x0 + i} ${F + i} L${xs} ${F + i} ${nosePath(xs, NOSE - i, cy, T / 2 - i)} L${x0 + i} ${F + T - i} Z`;

  const content: Box = {
    left: bands[1] + STROKE / 2 + CONTENT_GAP,
    right: xs - STROKE / 2 - CONTENT_GAP,
    top: F + STROKE,
    bottom: F + T - STROKE,
  };
  const finReach = r1(x0 + FIN[0][0] * FIN_KU);

  return {
    W,
    H,
    T,
    F,
    cy,
    xe,
    x0,
    xs,
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
    finReach,
    parts: {
      edgeFin: { left: ef.back, right: ef.front, top: cy - 2.2, bottom: cy + 2.2 },
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
  const half = r1(T * 0.38);
  const at = (along: number, across: number) => `${r1(L - along * L)} ${r1(half + across * half)}`;
  const outer = `M${at(0, -1)} C${at(0.283, -1)} ${at(0.585, -0.5625)} ${at(1, 0)} C${at(0.585, 0.5625)} ${at(0.283, 1)} ${at(0, 1)} Z`;
  const core = `M${at(0.01, -0.344)} C${at(0.151, -0.344)} ${at(0.311, -0.1875)} ${at(0.472, 0)} C${at(0.311, 0.1875)} ${at(0.151, 0.344)} ${at(0.01, 0.344)} Z`;
  return { w: L, h: half * 2, outer, core };
}

export const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// ---------------------------------------------------------------------------------------------
// The phone's widget: the rocket low at the bottom, a banner on a short mast above it.

export const BANNER = {
  /** its height, outline included */
  H: 52,
  /** each button's target */
  BTN: 44,
  /** never narrower than this (the name, the time and three buttons) */
  MIN_W: 288,
  MAST_W: 6,
  /** between the top fin's tip and the banner's bottom */
  CLEAR: 8,
} as const;

export const WIDGET = {
  /** the widget's gap above the bottom of the screen (the safe area, if larger: see RocketWidget) */
  BOTTOM: 6,
  /** the rocket's length (flame room included) as a share of the widget's width, and at most */
  SHIP_SHARE: 0.86,
  SHIP_MAX: 460,
} as const;

export interface WidgetLayout {
  /** the widget's width and height (the list goes above it) */
  B: number;
  box: number;
  g: ShipGeometry;
  /** where the rocket's drawing starts in the widget */
  ship: { left: number; top: number };
  banner: Box;
  /** the mast: it hangs from the middle of the banner, behind it, down into the body */
  mast: { x: number; top: number; bottom: number };
  /** the banner folds into this point (the mast's foot, inside the body), in widget pixels */
  fold: { x: number; y: number };
  /** the rest's tilt turns about the mast's foot on the body's top line (rocket pixels) */
  pivot: { x: number; y: number };
  /** the rocket's middle (widget pixels): it turns about it as it takes off */
  center: { x: number; y: number };
  /** the body, for the tap that opens the list (rocket pixels) */
  body: Box;
}

export function widgetLayout(width: number): WidgetLayout {
  const B = Math.max(280, Math.round(width));
  const g = shipGeometry(Math.min(WIDGET.SHIP_MAX, B * WIDGET.SHIP_SHARE));
  const span = g.tip - g.xe;
  const left = Math.round((B - span) / 2 - g.xe);
  const bw = Math.min(B, Math.max(BANNER.MIN_W, Math.round(span)));
  const banner: Box = { left: Math.round((B - bw) / 2), right: Math.round((B - bw) / 2) + bw, top: 0, bottom: BANNER.H };
  const top = BANNER.H + BANNER.CLEAR; // the top fin's tip
  const bodyTop = top + F;
  const mastX = Math.round(B / 2);
  return {
    B,
    box: top + g.H + STROKE / 2,
    g,
    ship: { left, top },
    banner,
    mast: { x: mastX, top: BANNER.H / 2, bottom: bodyTop + Math.round(T * 0.7) },
    fold: { x: mastX, y: bodyTop + T / 2 },
    pivot: { x: mastX - left, y: F },
    center: { x: left + (g.xe + g.tip) / 2, y: top + g.cy },
    body: { left: g.x0, right: g.tip, top: F, bottom: F + T },
  };
}

// ---------------------------------------------------------------------------------------------
// The routine creator's bar: the rocket's body holds the sentence and grows a line at a time.

export const BAR_TEXT = {
  /** px per line of the sentence (18 px text) */
  LINE: 24,
  /** px of the field around its lines (a 44 px target with one line) */
  PAD: 10,
  /** air between the lines and the body's outline, px */
  AIR: 4,
  /** it grows up to this many lines; then it scrolls inside */
  MAX_LINES: 4,
} as const;

/** The bar's body thickness (rocket units) for `lines` lines of text, drawn `k` times its size. */
export function barThickness(lines: number, k: number): number {
  const n = Math.min(BAR_TEXT.MAX_LINES, Math.max(1, Math.round(lines)));
  const inner = n * BAR_TEXT.LINE + 2 * BAR_TEXT.AIR;
  return Math.max(SHIP.T, Math.round((inner / k + SHIP.STROKE) * 10) / 10);
}

/** How many lines a field shows for a content `scrollHeight` (px, padding included). */
export function barLines(scrollHeight: number): number {
  const lines = Math.round((scrollHeight - 2 * BAR_TEXT.PAD) / BAR_TEXT.LINE);
  return Math.min(BAR_TEXT.MAX_LINES, Math.max(1, lines));
}

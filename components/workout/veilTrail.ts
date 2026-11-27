/*
 * The white screen (phone), one layer: the white, its shaded puffs, the faint exhaust trail, the
 * small rocket and the words, all drawn at once and shown through one mask. It ARRIVES as the
 * rocket's smoke spreading up from the pad: a soft, uneven front of puffs rises over the screen and
 * everything on the white is uncovered as the front passes it (arrivalPuffs). It is held 2 s once
 * the words are fully uncovered. It LEAVES like a rocket's trail fading from the launch pad up,
 * following the rocket: it clears from the bottom first and the cleared edge rises; what is left
 * narrows into a trail above it (wide just above the cleared edge, tapering up towards the small
 * rocket) of soft, uneven puffs that drift and thin, and the last of it fades at the top
 * (trailPuffs); whatever is on the cleared part goes with it, the words too. Pure numbers:
 * whiteVeil.ts turns them into the mask.
 */

/** The words are held `holdMs` once fully uncovered; the smoke starts leaving `leaveDelayMs` after the page hands over. */
export const VEIL_WORDS = { holdMs: 2000, leaveDelayMs: 60 } as const;

/** When the page hands over to the player, ms from the white's start: the words fully uncovered at `uncoveredMs`, then held exactly `holdMs`. */
export function veilHandOffMs(uncoveredMs: number): number {
  return uncoveredMs + VEIL_WORDS.holdMs - VEIL_WORDS.leaveDelayMs;
}

/** The trail: rows and columns of puffs, where the cleared edge starts and ends (shares of the height from the top), the last wisps' fade. */
export const TRAIL = { rows: 11, cols: 5, startEdge: 1.15, endEdge: -0.05, fadeFrom: 0.75 } as const;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Slow start, a faster drain, a soft end. */
export const trailEase = (p: number) => {
  const c = clamp01(p);
  return c * c * (3 - 2 * c);
};

export interface TrailShape {
  /** the cleared edge, a share of the height from the top: below it the workout shows; ≤ 0, all clear */
  edge: number;
  /** what is left of the white: its width just above the cleared edge, and at the top (by the rocket), shares of the width */
  width: number;
  top: number;
  /** the smoke's opacity (the last wisps fade) */
  opacity: number;
}

/** The clearing's shape at `p` (0: all white, 1: all clear). */
export function trailShape(p: number): TrailShape {
  const q = trailEase(p);
  const edge = TRAIL.startEdge + (TRAIL.endEdge - TRAIL.startEdge) * q;
  // (mostly it clears from the bottom up) it narrows gently into a trail tapering up to the
  // rocket, then thins away to nothing
  const width = q < 0.5 ? 1 - 0.7 * q : 0.65 * Math.sqrt((1 - q) / 0.5);
  const top = width * (1 - 0.55 * Math.min(1, q / 0.5));
  const opacity = p <= TRAIL.fadeFrom ? 1 : clamp01(1 - (p - TRAIL.fadeFrom) / (1 - TRAIL.fadeFrom));
  return { edge, width, top, opacity };
}

/** The progress at which the rising cleared edge reaches `edge` (a share of the height from the top). */
export function trailProgressAt(edge: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (trailShape(mid).edge > edge) lo = mid;
    else hi = mid;
  }
  return hi;
}

export interface Puff {
  x: number;
  y: number;
  r: number;
}

/** A steady pseudo-random 0..1 for a puff (its size and drift differ, the same every time). */
const hash = (i: number, j: number) => {
  const s = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * What is left of the white at `p` on a `W`×`H` screen, px: soft round puffs (each fully white
 * within 60 % of its radius, fading to nothing at its edge) in rows from the cleared edge up past
 * the top, as wide as the trail there; and a solid band down the middle under them (`core`), from
 * the top to the first row. Together they cover the whole screen at 0 and nothing at 1.
 */
export function trailPuffs(p: number, W: number, H: number): { puffs: Puff[]; core: { x: number; y: number; w: number; h: number } } {
  const s = trailShape(p);
  const q = trailEase(p);
  const E = s.edge * H;
  const span = Math.max(0, E);
  const gap = span / (TRAIL.rows - 1);
  // (at first the outer puffs sit on the screen's edges, then a little in from the trail's)
  const spread = 1 - 0.16 * Math.min(1, q / 0.2);
  const puffs: Puff[] = [];
  let edgeRow = E;
  let topRow = { y: 0, w: 0, r: 0 };
  for (let i = 0; i < TRAIL.rows; i++) {
    const t = i / (TRAIL.rows - 1);
    const w = (s.width + (s.top - s.width) * t) * W;
    const base = Math.min(0.6 * w, Math.max(0.32 * w, 0.62 * gap)) * (1 - 0.3 * q);
    // (the first row's cores end right at the cleared edge; the last row is at the top)
    const y = E - 0.6 * base - (E - 0.6 * base) * t;
    if (i === 0) edgeRow = y;
    if (i === TRAIL.rows - 1) topRow = { y, w, r: base };
    for (let j = 0; j < TRAIL.cols; j++) {
      const r = base * (0.8 + 0.4 * hash(i, j));
      // they drift a little as they go (more as the trail thins)
      const drift = Math.sin(i * 2.1 + j * 1.3 + p * 4) * 0.14 * r * q;
      const x = W / 2 + (j / (TRAIL.cols - 1) - 0.5) * w * spread + drift;
      puffs.push({ x, y: y + Math.cos(i * 1.7 + j * 2.3 + p * 3) * 0.1 * r * q, r });
    }
  }
  // the solid middle: as wide as the trail's top row (its narrowest), from the top down to the
  // edge's row (at first, the whole width)
  const cw = Math.max(0, topRow.w * spread, W * (1 - q / 0.12));
  const y0 = topRow.y - topRow.r;
  return { puffs, core: { x: W / 2 - cw / 2, y: y0, w: cw, h: Math.max(0, edgeRow - y0) } };
}

// ---------------------------------------------------------------------------------------------
// The arrival: the smoke spreading up from the pad

/** The arriving front: a row of puffs across the screen (and a second, staggered, under it), where it starts and ends (shares of the height), how much the sides lag behind the middle (share of a puff's solid core). */
export const ARRIVAL = { cols: 7, startFront: 1.12, endFront: -0.16, lag: 0.45 } as const;

/** Where the arriving front is at `p` (0: nothing yet, 1: all white): a share of the height from the top; below it all is white. */
export function arrivalFront(p: number): number {
  return ARRIVAL.startFront + (ARRIVAL.endFront - ARRIVAL.startFront) * trailEase(p);
}

/**
 * The arriving white at `p` on a `W`×`H` screen, px: a solid part from the front down past the
 * bottom (`core`), and over it the front's soft, uneven edge of puffs (each fully white within 60 %
 * of its radius), the middle (around `originX`, the pad, at first) a little ahead of the sides.
 * Nothing shows at 0, everything at 1; what is covered stays covered.
 */
export function arrivalPuffs(p: number, W: number, H: number, originX = W / 2): { puffs: Puff[]; core: { x: number; y: number; w: number; h: number } } {
  const q = trailEase(p);
  const E = arrivalFront(p) * H;
  const gap = W / (ARRIVAL.cols - 1);
  const r = gap;
  const lag = ARRIVAL.lag * 0.6 * 0.85 * r;
  const cx = originX + (W / 2 - originX) * q;
  const puffs: Puff[] = [];
  let lowest = -Infinity;
  for (let j = 0; j < ARRIVAL.cols; j++) {
    const rj = r * (0.85 + 0.3 * hash(3, j));
    const x = j * gap + Math.sin(j * 1.9 + p * 5) * 0.04 * r;
    const side = Math.min(1, Math.abs(x - cx) / (W / 2));
    // (its solid core starts at the front, the sides a little behind)
    const y = E + 0.6 * rj + lag * side * side;
    lowest = Math.max(lowest, y);
    puffs.push({ x, y, r: rj });
  }
  // a second row, staggered, under the first: no gap between the front and the solid part
  for (let j = 0; j < ARRIVAL.cols - 1; j++) {
    const rj = r * (0.85 + 0.3 * hash(4, j));
    puffs.push({ x: (j + 0.5) * gap, y: lowest, r: rj });
  }
  return { puffs, core: { x: -2, y: lowest, w: W + 4, h: Math.max(0, H + 4 - lowest) } };
}

/** How white the mask (puffs and the solid part) is at a point: 0 to 1. */
export function maskAlpha(shape: { puffs: Puff[]; core: { x: number; y: number; w: number; h: number } }, x: number, y: number): number {
  const { core } = shape;
  if (core.w > 0 && core.h > 0 && x >= core.x && x <= core.x + core.w && y >= core.y && y <= core.y + core.h) return 1;
  let clear = 1;
  for (const pf of shape.puffs) {
    if (pf.r <= 0) continue;
    const d = Math.hypot(x - pf.x, y - pf.y) / pf.r;
    const a = d <= 0.6 ? 1 : d >= 1 ? 0 : 1 - (d - 0.6) / 0.4;
    clear *= 1 - a;
  }
  return 1 - clear;
}

/** Points over a box (its edges and inside), to test it. */
function boxPoints(box: { left: number; top: number; right: number; bottom: number }, n = 6): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) for (let k = 0; k <= n; k++) pts.push([box.left + ((box.right - box.left) * i) / n, box.top + ((box.bottom - box.top) * k) / n]);
  return pts;
}

/** The arrival's progress at which a box (the words) is fully uncovered: the white wholly over it. */
export function arrivalCoveredAt(box: { left: number; top: number; right: number; bottom: number }, W: number, H: number, originX = W / 2): number {
  const pts = boxPoints(box);
  const covered = (p: number) => {
    const shape = arrivalPuffs(p, W, H, originX);
    return pts.every(([x, y]) => maskAlpha(shape, x, y) >= 0.999);
  };
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (covered(mid)) hi = mid;
    else lo = mid;
  }
  return hi;
}

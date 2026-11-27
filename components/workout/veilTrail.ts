/*
 * How the white screen's smoke leaves (phone): like a rocket's trail fading from the launch pad up,
 * following the rocket. The smoke thins and vanishes first at the bottom of the screen and the
 * cleared edge rises; what is left of the white narrows into a trail above it (wide just above the
 * cleared edge, tapering up towards the small rocket near the top) of soft, uneven puffs that drift
 * and thin, and the last of it fades at the top, where the rocket went. Pure numbers: whiteVeil.ts
 * turns them into one mask (soft round puffs) on the smoke layer.
 */

/** The words come in one after another (whiteVeil), then are held `holdMs` before the smoke leaves, ms. */
export const VEIL_WORDS = { delayMs: 80, staggerMs: 180, inMs: 460, holdMs: 2000, leaveDelayMs: 60 } as const;

/** When the last of `lines` lines of words has fully appeared, ms from the white (at once with reduced motion). */
export function veilWordsInMs(lines: number, reduced = false): number {
  return reduced ? 0 : VEIL_WORDS.delayMs + Math.max(0, lines - 1) * VEIL_WORDS.staggerMs + VEIL_WORDS.inMs;
}

/** When the page hands over to the player, ms from the white: the smoke starts leaving `leaveDelayMs` later, the words then held exactly `holdMs`. */
export function veilHandOffMs(lines: number, reduced = false): number {
  return veilWordsInMs(lines, reduced) + VEIL_WORDS.holdMs - VEIL_WORDS.leaveDelayMs;
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

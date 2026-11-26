/*
 * The rocket's parts as SVG path strings (pure): the one drawing language of every rocket of the
 * app, after the approved drawings (cohete-lámina, cohete-reproductor). The first screen's rocket
 * (PadRocket) and the routine's rocket by stages (RocketShip) both draw their nozzle, fins, tail
 * livery, rivets, nose, window, antenna, boosters and flame from here (RocketParts.tsx paints them).
 *
 * Lying down, nose to the right, in px. Most proportions are in units of `Tf`, the thickness the
 * part is drawn for, and `T`, the body's own thickness (the same unless a body grows with its text).
 */

export const f1 = (v: number) => Math.round(v * 10) / 10;

/** The approved nose: an ogive with a rounded ink end, then the antenna and its red light (units of Tf). */
export const NOSE = { len: 1.295, antenna: 0.24, light: 0.04 } as const;

/** The nose from its base at `x1` (the hull's top and bottom there), along `Tf`, across the body's own `T`. */
export function nosePaths(x1: number, top: number, bottom: number, cy: number, T: number, Tf: number) {
  const X = (k: number) => f1(x1 + k * Tf);
  const Y = (k: number) => f1(cy + k * T);
  return {
    outline: `M${x1} ${top}C${X(0.571)} ${Y(-0.464)} ${X(1.036)} ${Y(-0.268)} ${X(1.232)} ${Y(-0.107)}Q${X(1.357)} ${cy} ${X(1.232)} ${Y(0.107)}C${X(1.036)} ${Y(0.268)} ${X(0.571)} ${Y(0.464)} ${x1} ${bottom}Z`,
    belly: `M${x1} ${Y(0.286)}L${X(0.893)} ${Y(0.286)}C${X(0.607)} ${Y(0.393)} ${X(0.286)} ${Y(0.482)} ${x1} ${bottom}Z`,
    tip: `M${X(0.929)} ${Y(-0.259)}C${X(1.071)} ${Y(-0.205)} ${X(1.161)} ${Y(-0.161)} ${X(1.232)} ${Y(-0.107)}Q${X(1.357)} ${cy} ${X(1.232)} ${Y(0.107)}C${X(1.161)} ${Y(0.161)} ${X(1.071)} ${Y(0.205)} ${X(0.929)} ${Y(0.259)}C${X(1)} ${Y(0.089)} ${X(1)} ${Y(-0.089)} ${X(0.929)} ${Y(-0.259)}Z`,
  };
}

const bez = (a: number, b: number, c: number, d: number, t: number) => {
  const m = 1 - t;
  return m * m * m * a + 3 * m * m * t * b + 3 * m * t * t * c + t * t * t * d;
};

/**
 * Half the nose's thickness `dx` px in front of its base (its outer outline), sampled from the
 * same curves as nosePaths; 0 past its rounded end.
 */
export function noseHalfAt(dx: number, T: number, Tf: number): number {
  if (dx <= 0) return T / 2;
  const xs = [0, 0.571 * Tf, 1.036 * Tf, 1.232 * Tf];
  const ys = [T / 2, 0.464 * T, 0.268 * T, 0.107 * T];
  let best = { d: Infinity, half: 0 };
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const d = Math.abs(bez(xs[0], xs[1], xs[2], xs[3], t) - dx);
    if (d < best.d) best = { d, half: bez(ys[0], ys[1], ys[2], ys[3], t) };
  }
  // the rounded end (a quadratic out to 1.294 Tf at its middle)
  if (dx > 1.232 * Tf) {
    const p = Math.min(1, (dx - 1.232 * Tf) / (0.0625 * Tf));
    return p >= 1 ? 0 : 0.107 * T * Math.sqrt(1 - p);
  }
  return best.half;
}

/** The bell nozzle from the hull at `x0` back to its mouth at `xm`, with its two ribs. */
export function nozzlePaths(x0: number, xm: number, cy: number, Tf: number) {
  const N = x0 - xm;
  const at = (k: number) => f1(xm + k * N);
  return {
    bell: `M${x0} ${f1(cy - 0.32 * Tf)}L${xm} ${f1(cy - 0.464 * Tf)}Q${f1(xm - 0.125 * Tf)} ${cy} ${xm} ${f1(cy + 0.464 * Tf)}L${x0} ${f1(cy + 0.32 * Tf)}Z`,
    ribs: `M${at(0.27)} ${f1(cy - 0.41 * Tf)}Q${at(0.05)} ${cy} ${at(0.27)} ${f1(cy + 0.41 * Tf)}M${at(0.64)} ${f1(cy - 0.36 * Tf)}Q${at(0.45)} ${cy} ${at(0.64)} ${f1(cy + 0.36 * Tf)}`,
  };
}

/** The two swept fins at the tail (base from `fx`, `fl` long, `fh` tall), a rib line on the top one. */
export function finPaths(fx: number, fl: number, fh: number, top: number, bottom: number) {
  return {
    top: `M${fx} ${top}L${f1(fx + 0.162 * fl)} ${f1(top - fh)}L${f1(fx + 0.65 * fl)} ${f1(top - fh)}L${f1(fx + fl)} ${top}Z`,
    bottom: `M${fx} ${bottom}L${f1(fx + 0.162 * fl)} ${f1(bottom + fh)}L${f1(fx + 0.65 * fl)} ${f1(bottom + fh)}L${f1(fx + fl)} ${bottom}Z`,
    ribs: `M${f1(fx + 0.297 * fl)} ${f1(top - 0.833 * fh)}L${f1(fx + 0.514 * fl)} ${top}M${f1(fx + 0.486 * fl)} ${f1(top - 0.917 * fh)}L${f1(fx + 0.757 * fl)} ${top}`,
  };
}

/** The tail's livery along `Tf` from the hull's start `x0`: the engine ring, the red band, the checker strip. */
export function tailLivery(x0: number, Tf: number) {
  const ring = { x: x0, w: f1(0.16 * Tf) };
  const band = { x: f1(x0 + 0.25 * Tf), w: f1(0.143 * Tf) };
  const cell = f1(0.107 * Tf);
  const checker = { x: f1(band.x + band.w + 0.036 * Tf), w: f1(2 * cell), cell };
  return { ring, band, checker, end: f1(checker.x + checker.w) };
}

/** A column of rivets from y0 to y1 at x, as one path of small circles. */
export function rivetPath(x: number, y0: number, y1: number, r: number, gap: number): string {
  let d = '';
  for (let y = y0; y <= y1 + 0.01; y += gap) d += `M${f1(x - r)} ${f1(y)}a${r} ${r} 0 1 0 ${f1(2 * r)} 0a${r} ${r} 0 1 0 ${f1(-2 * r)} 0`;
  return d;
}

/** The checker strip: two columns of cells, alternating, clipped to the hull. */
export function checkerPath(x: number, w: number, cell: number, y0: number, y1: number): string {
  let d = '';
  let row = 0;
  for (let y = y0; y < y1 - 0.2; y += cell, row += 1) {
    const h = Math.min(cell, y1 - y);
    const cx = x + (row % 2) * (w / 2);
    d += `M${f1(cx)} ${f1(y)}h${f1(w / 2)}v${f1(h)}h${f1(-w / 2)}z`;
  }
  return d;
}

/** The window's reflection, a short white arc in its upper left. */
export function windowGlint(w: { cx: number; cy: number; r: number }): string {
  return `M${f1(w.cx - 0.375 * w.r)} ${f1(w.cy - 0.19 * w.r)}Q${f1(w.cx - 0.19 * w.r)} ${f1(w.cy - 0.44 * w.r)} ${f1(w.cx + 0.19 * w.r)} ${f1(w.cy - 0.44 * w.r)}`;
}

/**
 * One layer of the flame from its root at `x` (the nozzle's mouth) out to the left: `half` px
 * each side of `cy` at the root, its outer curve's control `reach` px out, its inner (the hollow
 * at the root) `back` px out.
 */
export function flameLayer(x: number, cy: number, half: number, reach: number, back: number): string {
  return `M${x} ${f1(cy - half)}Q${f1(x - reach)} ${cy} ${x} ${f1(cy + half)}Q${f1(x - back)} ${cy} ${x} ${f1(cy - half)}Z`;
}

/**
 * The flame's three layers (red, pink, white): `half` in units across, `reach` and `back` in
 * units along (the outer layer's tip is `reach / 2` units out: one unit).
 */
export const FLAME_LAYERS = [
  { half: 0.386, reach: 2, back: 0.59 },
  { half: 0.27, reach: 1.36, back: 0.45 },
  { half: 0.16, reach: 0.77, back: 0.23 },
] as const;

/**
 * The side boosters of the warm-up (cohete-lámina): two slim cylinders above and below the hull,
 * from `x0` to `x1` (the tip of their cone), each `h` px thick in its band, with its own small
 * nozzle, a red band near its tail and two brackets to the hull. `top`/`bottom`: the hull's lines;
 * `gap`: between a booster and the hull (where the brackets are).
 */
export function boosterShape(x0: number, x1: number, h: number, gap: number, top: number, bottom: number) {
  const cone = f1(Math.min(1.9 * h, 0.45 * (x1 - x0)));
  const xb = f1(x1 - cone);
  const one = (y0: number) => {
    const y1 = y0 + h;
    const mid = (y0 + y1) / 2;
    return `M${f1(x0)} ${f1(y0)}H${xb}C${f1(xb + 0.62 * cone)} ${f1(y0)} ${f1(x1)} ${f1(mid - 0.22 * h)} ${f1(x1)} ${f1(mid)}C${f1(x1)} ${f1(mid + 0.22 * h)} ${f1(xb + 0.62 * cone)} ${f1(y1)} ${xb} ${f1(y1)}H${f1(x0)}Z`;
  };
  const upper = top - gap - h;
  const lower = bottom + gap;
  const nozzle = (y0: number) => {
    const mid = y0 + h / 2;
    return `M${f1(x0)} ${f1(mid - 0.32 * h)}L${f1(x0 - 0.6 * h)} ${f1(mid - 0.5 * h)}L${f1(x0 - 0.6 * h)} ${f1(mid + 0.5 * h)}L${f1(x0)} ${f1(mid + 0.32 * h)}Z`;
  };
  const bandX = f1(x0 + 0.55 * h);
  const bandW = f1(Math.max(1.4, 0.36 * h));
  const bracketW = f1(Math.max(1.6, 0.36 * h));
  const brackets = [f1(x0 + 0.33 * (xb - x0)), f1(x0 + 0.8 * (xb - x0))];
  return {
    upper: { body: one(upper), nozzle: nozzle(upper), y: upper },
    lower: { body: one(lower), nozzle: nozzle(lower), y: lower },
    band: { x: bandX, w: bandW },
    brackets: brackets.map((x) => ({ x, w: bracketW })),
    /** the gaps between the boosters and the hull, where the brackets are */
    gapTop: { y: f1(upper + h), h: f1(gap) },
    gapBottom: { y: f1(bottom), h: f1(gap) },
    h,
  };
}

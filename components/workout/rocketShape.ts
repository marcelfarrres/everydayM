/*
 * The rocket of the phone, as numbers and SVG path strings (pure): lying on its side, nose to the
 * right, drawn in screen pixels at scale 1. A central body made of SEGMENTS, one per block of the
 * routine (block 1 at the tail, the last block against the nose), each with its own bell nozzle
 * (only the tail's shows: when the tail segment goes, the next one's nozzle is the tail); a short
 * rounded nose cap with a small window and a thin probe; and, while the warm-up lasts, two side
 * boosters (above and below the body), shorter than it, each with its cone and its nozzle.
 * Joints between segments (a double fine line and a checkered band), rivets and a scratch here and
 * there; the middle of each segment stays white for the lines of its series (the hilo).
 *
 * The same drawing, as one segment and no boosters, is every other rocket of the app (the creator's
 * bar, its suggestions, options and buttons). RocketShip draws it; RocketWidget flies it.
 *
 * The frame is always the whole rocket's: `width` long, nose tip at its right end. Segments that
 * have gone are simply missing at the left; `shiftFor` says how far to move the drawing so what is
 * left stands centred where the whole rocket stood.
 */

export const SHIP = {
  /** body thickness (outer stroke to outer stroke) */
  T: 30,
  /** the band above and below the body where the boosters go */
  F: 13,
  STROKE: 2,
  /** room left of the nozzle, so the flame can be seen */
  FLAME_ROOM: 18,
  /** the bell nozzle at the tail */
  NOZZLE: 10,
  /** the nose: a short rounded cap (0.9 body thicknesses) and a thin probe */
  CAP: 27,
  PROBE: 7,
  NOSE: 34,
  /** a joint between two segments: its width along the body */
  JOINT: 8,
  /** clear space between a segment's lines and its hilo */
  CONTENT_GAP: 5,
  /** the flame at full size */
  FLAME_LENGTH: 72,
} as const;

const { T, F, STROKE, FLAME_ROOM, NOZZLE, PROBE, JOINT, CONTENT_GAP, FLAME_LENGTH } = SHIP;
const T_BASE = T;

const r1 = (n: number) => Math.round(n * 10) / 10;

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Segment {
  /** the block it carries (1-based) */
  block: number;
  start: number;
  end: number;
  /** where its series' lines go */
  content: Box;
}

export interface ShipGeometry {
  /** the drawing's frame (the whole rocket, flame room included) */
  W: number;
  H: number;
  /** body thickness and the boosters' band */
  T: number;
  F: number;
  cy: number;
  /** the tail's nozzle exit, the tail (body start), the nose's base, the tip */
  xe: number;
  x0: number;
  xs: number;
  tip: number;
  /** how many segments the whole rocket has, and the first one still on */
  blocks: number;
  first: number;
  segments: Segment[];
  /** a joint between segment `back` and the next one, at `x` */
  joints: { x: number; back: number }[];
  /** the inside of the body, all segments (single-segment rockets: their text's room) */
  content: Box;
  nozzle: string;
  cap: string;
  probe: string;
  window: { cx: number; cy: number; r: number };
  /** the two boosters (and their nozzles), while the warm-up lasts */
  boosters: { top: string; bottom: string; nozzles: string; seams: string; x0: number; x1: number } | null;
  /** the inside of body and nose, for the water (half a stroke in from the outline) */
  inside: string;
}

/** Half the hull's thickness at `x` (its outer outline): T/2 along the body, less over the cap, 0 on the probe. */
export function hullHalfAt(g: Pick<ShipGeometry, 'xs' | 'tip' | 'T'>, x: number): number {
  const cap = capLength(g.T);
  if (x <= g.xs) return g.T / 2;
  if (x >= g.xs + cap) return 0;
  // the cap's upper curve, sampled
  let best = { dx: Infinity, half: 0 };
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    const m = 1 - t;
    const a = 3 * m * m * t * 0.6 + 3 * m * t * t + t * t * t; // along: 0, 0.6, 1, 1
    const c = m * m * m + 3 * m * m * t + 3 * m * t * t * 0.16; // across: 1, 1, 0.16, 0
    const dx = Math.abs(g.xs + a * cap - x);
    if (dx < best.dx) best = { dx, half: c * (g.T / 2) };
  }
  return best.half;
}

const capLength = (t: number) => Math.round(t * 0.9);

/**
 * The rocket, `width` long (its frame), `blocks` segments of which `first`..`blocks` are still on,
 * with or without its boosters; `thickness`: a thicker body (the creator's bar, a line of text at
 * a time), whose cap grows with it.
 */
export function stackGeometry({
  width,
  blocks = 1,
  first = 1,
  boosters = false,
  thickness = T_BASE,
  stretch = false,
}: {
  width: number;
  blocks?: number;
  first?: number;
  boosters?: boolean;
  thickness?: number;
  /** the segments still on share the whole body (the phone's bar: the rocket always takes its whole length there) */
  stretch?: boolean;
}): ShipGeometry {
  const t = Math.max(T_BASE, thickness);
  const n = Math.max(1, Math.round(blocks));
  const f1 = Math.min(n, Math.max(1, Math.round(first)));
  const W = Math.max(150, Math.round(width));
  const H = t + 2 * F;
  const cy = F + t / 2;
  const tip = W - STROKE / 2;
  const cap = capLength(t);
  const xs = tip - PROBE - cap;
  const bodyFull = xs - (FLAME_ROOM + NOZZLE);
  const segLen = bodyFull / (stretch ? n - f1 + 1 : n);
  const x0 = r1(xs - (n - f1 + 1) * segLen);
  const xe = r1(x0 - NOZZLE);

  const top = F + STROKE;
  const bottom = F + t - STROKE;
  const segments: Segment[] = [];
  const joints: { x: number; back: number }[] = [];
  for (let b = f1; b <= n; b++) {
    const start = r1(xs - (n - b + 1) * segLen);
    const end = r1(xs - (n - b) * segLen);
    segments.push({
      block: b,
      start,
      end,
      content: {
        left: r1(start + JOINT / 2 + CONTENT_GAP),
        right: r1(end - (b < n ? JOINT / 2 + CONTENT_GAP : STROKE / 2 + CONTENT_GAP)),
        top,
        bottom,
      },
    });
    if (b < n) joints.push({ x: end, back: b });
  }

  // the bell nozzle at the tail: narrow at the body, flared at its exit
  const hb = r1(t * 0.27);
  const he = r1(t * 0.42);
  const nozzle =
    `M${x0} ${r1(cy - hb)} C${r1(x0 - NOZZLE * 0.45)} ${r1(cy - hb)} ${r1(xe + NOZZLE * 0.2)} ${r1(cy - he * 0.8)} ${xe} ${r1(cy - he)} ` +
    `L${xe} ${r1(cy + he)} C${r1(xe + NOZZLE * 0.2)} ${r1(cy + he * 0.8)} ${r1(x0 - NOZZLE * 0.45)} ${r1(cy + hb)} ${x0} ${r1(cy + hb)} Z`;

  // the cap: rounded, from the body's front to the probe
  const capHalf = (half: number, len: number) =>
    `C${r1(xs + 0.6 * len)} ${r1(cy - half)} ${r1(xs + len)} ${r1(cy - half * 0.16)} ${r1(xs + len)} ${r1(cy)} ` +
    `C${r1(xs + len)} ${r1(cy + half * 0.16)} ${r1(xs + 0.6 * len)} ${r1(cy + half)} ${r1(xs)} ${r1(cy + half)}`;
  const capPath = `M${r1(xs)} ${F} ${capHalf(t / 2, cap)} Z`;
  const probe = `M${r1(xs + cap)} ${r1(cy)} L${r1(tip - 1.2)} ${r1(cy)}`;

  // the boosters, above and below the body, along its tail half (only with all segments on)
  let boost: ShipGeometry['boosters'] = null;
  if (boosters && f1 === 1) {
    const bx0 = r1(x0 + 4);
    const bx1 = r1(bx0 + Math.max(40, (xs - x0) * 0.5));
    const cone = r1(F * 1.5);
    const band = (y0: number, y1: number) => {
      const mid = (y0 + y1) / 2;
      const half = (y1 - y0) / 2;
      return (
        `M${bx0} ${r1(y0)} L${bx1} ${r1(y0)} C${r1(bx1 + 0.55 * cone)} ${r1(y0)} ${r1(bx1 + cone)} ${r1(mid - half * 0.25)} ${r1(bx1 + cone)} ${r1(mid)} ` +
        `C${r1(bx1 + cone)} ${r1(mid + half * 0.25)} ${r1(bx1 + 0.55 * cone)} ${r1(y1)} ${bx1} ${r1(y1)} L${bx0} ${r1(y1)} Z`
      );
    };
    const bell = (mid: number, half: number) =>
      `M${bx0} ${r1(mid - half * 0.55)} L${r1(bx0 - 6)} ${r1(mid - half * 0.85)} L${r1(bx0 - 6)} ${r1(mid + half * 0.85)} L${bx0} ${r1(mid + half * 0.55)} Z`;
    const yTop = STROKE / 2;
    const seamX = r1(bx0 + (bx1 - bx0) * 0.38);
    boost = {
      top: band(yTop, F),
      bottom: band(F + t, H - STROKE / 2),
      nozzles: `${bell((yTop + F) / 2, (F - yTop) / 2)} ${bell((F + t + H - STROKE / 2) / 2, (F - yTop) / 2)}`,
      seams: `M${seamX} ${r1(yTop + 1)} L${seamX} ${F} M${seamX} ${F + t} L${seamX} ${r1(H - STROKE / 2 - 1)}`,
      x0: bx0,
      x1: r1(bx1 + cone),
    };
  }

  const i = STROKE / 2;
  const inside = `M${r1(x0 + i)} ${r1(F + i)} L${r1(xs)} ${r1(F + i)} ${capHalf(t / 2 - i, cap - i)} L${r1(x0 + i)} ${r1(F + t - i)} Z`;

  return {
    W,
    H,
    T: t,
    F,
    cy,
    xe,
    x0,
    xs: r1(xs),
    tip,
    blocks: n,
    first: f1,
    segments,
    joints,
    content: { left: segments[0].content.left, right: segments[segments.length - 1].content.right, top, bottom },
    nozzle,
    cap: capPath,
    probe,
    window: { cx: r1(xs + cap * 0.42), cy: r1(cy), r: r1(t * 0.13) },
    boosters: boost,
    inside,
  };
}

/** A rocket of one segment, no boosters: every rocket of the app other than the routine's. */
export function shipGeometry(width: number, thickness: number = T_BASE): ShipGeometry {
  return stackGeometry({ width, thickness });
}

/**
 * How far to move a drawing whose first segments have gone so that what is left stands centred
 * where the whole rocket stood (px, negative: to the left... of half the missing length).
 */
export function shiftFor(g: Pick<ShipGeometry, 'x0'>): number {
  return -r1((g.x0 - (FLAME_ROOM + NOZZLE)) / 2);
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
  /** between the top of the rocket's frame (the boosters' band) and the banner's bottom */
  CLEAR: 8,
} as const;

export const WIDGET = {
  /** the widget's gap above the bottom of the screen (the safe area, if larger: see RocketWidget) */
  BOTTOM: 6,
  /** the rocket's length (flame room included) as a share of the widget's width, and at most */
  SHIP_SHARE: 0.86,
  SHIP_MAX: 460,
  /**
   * On a narrow phone (under ~345 px) the share would leave the first panel too narrow for a name:
   * the rocket grows towards this length, keeping NARROW_SIDE px of the widget clear on each side
   * of its frame (from 360 px wide on, the share alone decides).
   */
  NARROW_MIN: 298,
  NARROW_SIDE: 6,
} as const;

/** The rocket's frame (its whole length, flame room included) in a widget `B` px wide. */
export function widgetFrame(B: number): number {
  const narrow = Math.min(B - 2 * WIDGET.NARROW_SIDE, WIDGET.NARROW_MIN);
  return Math.round(Math.min(WIDGET.SHIP_MAX, Math.max(B * WIDGET.SHIP_SHARE, narrow)));
}

/** Which part of the routine's rocket is on: its segments (blocks), the first still on, the boosters. */
export interface Stack {
  blocks: number;
  first: number;
  boosters: boolean;
}

export const FULL_STACK: Stack = { blocks: 1, first: 1, boosters: false };

export interface WidgetLayout {
  /** the widget's width and height (the list goes above it) */
  B: number;
  box: number;
  /** the rocket as it stands parked (its segments still on) */
  g: ShipGeometry;
  /** the frame's length (the whole rocket's), to draw any stage of it */
  frame: number;
  /** where the rocket's frame starts in the widget, and how far its drawing moves to stand centred */
  ship: { left: number; top: number; shift: number };
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

export function widgetLayout(width: number, stack: Stack = FULL_STACK): WidgetLayout {
  const B = Math.max(280, Math.round(width));
  const frame = widgetFrame(B);
  const whole = stackGeometry({ width: frame, blocks: stack.blocks });
  const g = stackGeometry({ width: frame, ...stack });
  const span = whole.tip - whole.xe;
  // the whole rocket's place; what is left of it moves so it stands centred in the same place
  const left = Math.round((B - span) / 2 - whole.xe);
  const shift = shiftFor(g);
  const bw = Math.min(B, Math.max(BANNER.MIN_W, Math.round(span)));
  const banner: Box = { left: Math.round((B - bw) / 2), right: Math.round((B - bw) / 2) + bw, top: 0, bottom: BANNER.H };
  const top = BANNER.H + BANNER.CLEAR; // the top of the rocket's frame (the boosters' band)
  const bodyTop = top + F;
  const mastX = Math.round(B / 2);
  return {
    B,
    box: top + g.H + STROKE / 2,
    g,
    frame,
    ship: { left, top, shift },
    banner,
    mast: { x: mastX, top: BANNER.H / 2, bottom: bodyTop + Math.round(T * 0.7) },
    fold: { x: mastX, y: bodyTop + T / 2 },
    pivot: { x: r1(mastX - left - shift), y: F },
    // (the middle of what is on, which stands where the whole rocket's middle stood)
    center: { x: r1(left + shift + (g.xe + g.tip) / 2), y: top + g.cy },
    body: { left: g.x0, right: g.tip, top: F, bottom: F + T },
  };
}

// ---------------------------------------------------------------------------------------------
// The player's bar (phone): its panels. Parked in the bar the rocket always takes its whole length
// (its segments stretched over the body); its panels slide up out of the hull, side by side on its
// straight part, flush on its top line (on the boosters while the warm-up lasts), and back into
// it. Each one reaches down into the hull (hidden behind it), so the rocket can squash, hop or sit
// on its stands without a gap opening under them; they are clipped a little inside the hull.

export const PANEL = {
  /** what shows above the hull, outline included */
  H: 52,
  /** how far each one reaches into the hull, behind it (they are clipped there) */
  SINK: 15,
  /** between two panels */
  SEAM: 4,
  /** their top corners */
  RADIUS: 12,
  LINE: 1.5,
  /** the text's room from the panel's left edge (inside its line) */
  PAD: 12,
} as const;

/**
 * The first panel holds two lines, centred in what shows of it: a line of 18 px (the name, or
 * "Descanso · Luego: …") over the time (28 px). Where that time stands in the panel (px from its
 * left edge and its top): the rest's countdown comes to stand there (RestClock). A name that needs
 * two lines makes both panels taller by `panelRise` (upwards: the time stays where it was, so this
 * place, measured from the panel's top, moves down by just as much).
 */
export const PANEL_TIME = {
  left: PANEL.LINE + PANEL.PAD,
  top: PANEL.LINE + (PANEL.H - PANEL.LINE - 18 - 28) / 2 + 18,
} as const;

export interface PanelLayout {
  /** the hull's straight part (widget pixels): the panels, together, never pass it */
  left: number;
  right: number;
  /** the panels' top; the hull's top line; where they are clipped (inside the hull) */
  top: number;
  base: number;
  clip: number;
}

/**
 * The name's line in the first panel: one line of 18 px (at 15 px, or a little smaller), or two
 * lines of `size + 2` px (never under 11 px). Two lines make the panels this much taller.
 */
export const NAME_LINE = { one: 18, min: 11 } as const;
export const nameLineHeight = (size: number, lines: 1 | 2) => (lines === 1 ? NAME_LINE.one : Math.max(NAME_LINE.min, Math.round(size)) + 2);
export const panelRise = (size: number, lines: 1 | 2) => (lines === 1 ? 0 : 2 * nameLineHeight(size, 2) - NAME_LINE.one);

/**
 * Where the panels stand in the widget, over the whole rocket (the bar's), `boosters` on or not,
 * `rise` px taller than PANEL.H (a name on two lines: panelRise).
 */
export function panelLayout(L: Pick<WidgetLayout, 'frame' | 'ship'>, boosters = false, rise = 0): PanelLayout {
  const whole = stackGeometry({ width: L.frame });
  const base = L.ship.top + F;
  return {
    left: r1(L.ship.left + whole.x0),
    right: r1(L.ship.left + whole.xs),
    top: r1(base - (boosters ? F - STROKE / 2 : 0) - PANEL.H - Math.max(0, rise)),
    base,
    clip: base + PANEL.SINK,
  };
}

/**
 * The stretch, as transforms (pure). The bar draws the rocket either at its real length (`real`,
 * standing centred: moved by `shift`) or stretched over the whole body (`full`, not moved), and
 * goes from one to the other through a look `u` (0: real, 1: stretched) that only moves things:
 * a segment's body (its white and its two long lines) and its hilo scale along the rocket, so no
 * line gets thicker; what sits at either end of a segment (its rivets, its joint, the nozzle)
 * moves with that end; whatever hangs behind the tail (flames, puffs) moves with the tail; the
 * nose never moves in the drawing, and the drawing moves by the shift. Every value is linear in
 * `u`, so two keyframes with one easing play the whole of it.
 */
export interface LookPair {
  real: ShipGeometry;
  full: ShipGeometry;
  /** how far the real rocket's drawing moves to stand centred */
  shift: number;
}

export type LookPart =
  | { kind: 'body'; block: number; left: number }
  | { kind: 'start' | 'end'; block: number }
  | { kind: 'tail' }
  | { kind: 'shift' };

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const r2 = (n: number) => String(Math.round(n * 100) / 100);

/** Where segment `block` stands at look `u` (null: it isn't on). */
export function segmentAt(p: LookPair, block: number, u: number): { start: number; end: number } | null {
  const a = p.real.segments.find((s) => s.block === block);
  const b = p.full.segments.find((s) => s.block === block);
  if (!a || !b) return null;
  return { start: lerp(a.start, b.start, u), end: lerp(a.end, b.end, u) };
}

/**
 * The transform that shows a part drawn with the geometry of look `drawn` (0: real, 1: full) as
 * it stands at look `u`. A body part scales from its own left edge (`left`, frame px: its box's,
 * with transform-origin 0 0); the shift is the drawing's whole move (its inline transform).
 */
export function lookTransform(p: LookPair, drawn: 0 | 1, u: number, part: LookPart): string {
  if (part.kind === 'shift') return `translateX(${r2(p.shift * (1 - u))}px)`;
  if (part.kind === 'tail') {
    const x0 = (v: number) => lerp(p.real.x0, p.full.x0, v);
    return `translateX(${r2(x0(u) - x0(drawn))}px)`;
  }
  const at = segmentAt(p, part.block, u);
  const was = segmentAt(p, part.block, drawn);
  if (!at || !was) return 'none';
  if (part.kind !== 'body') return `translateX(${r2(part.kind === 'start' ? at.start - was.start : at.end - was.end)}px)`;
  const k = (at.end - at.start) / (was.end - was.start);
  return `translateX(${r2(at.start + k * (part.left - was.start) - part.left)}px) scaleX(${Math.round(k * 10000) / 10000})`;
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
  /** it grows up to this many lines; then it scrolls inside (more would make it a bullet) */
  MAX_LINES: 3,
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

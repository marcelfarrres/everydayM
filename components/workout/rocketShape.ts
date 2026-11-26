import { NOSE, boosterShape, nosePaths, noseHalfAt, nozzlePaths, tailLivery } from '@/components/workout/rocketPaths';
import { estimateTextWidth, type MeasureText } from '@/components/workout/padRocketShape';

/*
 * The rocket of the phone, as numbers and SVG path strings (pure): lying on its side, nose to the
 * right, drawn in screen pixels at scale 1. The approved drawing (cohete-reproductor, 26-11-2026),
 * the same language as the first screen's rocket (its parts: rocketPaths.ts): a hull made of
 * STAGES, one per block of the routine (block 1 at the tail, the last block against the nose),
 * black interstage rings with white dashes between them, each stage with its block's name and the
 * bars of its series; at the tail the bell nozzle, the engine ring, the red band and the checker
 * strip, and the swept fins; the nose a slender ogive with a rounded ink end, the window at its
 * base and the antenna with its red light; the belly shaded in two tones. While the warm-up lasts,
 * two slim side boosters (above and below the hull, in the fins' band) and no fins: when the
 * boosters come off the fins spring out of the hull, and again on the new tail whenever a stage
 * comes off. Only the tail shows its nozzle and its livery (each stage has its own engine).
 *
 * The same drawing, as one stage and no boosters, is every other rocket of the app (the creator's
 * questions, options and buttons). RocketShip draws it; RocketWidget flies it.
 *
 * The frame is always the whole rocket's: `width` long, the antenna's light at its right end.
 * Stages that have gone are simply missing at the left; `shiftFor` says how far to move the drawing
 * so what is left stands centred where the whole rocket stood.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;

/** The nose along the rocket for a body `t` thick: the ogive, the antenna, its light (and the light's radius). */
function noseLengths(t: number) {
  const len = r1(NOSE.len * t);
  const antenna = r1(NOSE.antenna * t);
  const light = r1(NOSE.light * t);
  const lightR = r1(Math.max(1.6, light));
  return { len, antenna, light, lightR, total: r1(len + antenna + light + lightR) };
}

const T_BASE = 30;

export const SHIP = {
  /** body thickness (outer line to outer line) */
  T: T_BASE,
  /** the band above and below the body: the fins (and, in the warm-up, the boosters) */
  F: 13,
  STROKE: 1.6,
  /** room left of the nozzle, so the flame can be seen */
  FLAME_ROOM: 18,
  /** the bell nozzle at the tail */
  NOZZLE: 11,
  /** the nose: the ogive, the antenna and its light, from the hull to the frame's right end */
  NOSE: noseLengths(T_BASE).total,
  /** an interstage ring: its width along the body */
  JOINT: 6,
  /** clear space between a stage's ends (its ring, its livery) and its name and bars */
  CONTENT_GAP: 3,
  /** the flame at full size */
  FLAME_LENGTH: 72,
} as const;

const { T, F, STROKE, FLAME_ROOM, NOZZLE, JOINT, CONTENT_GAP, FLAME_LENGTH } = SHIP;

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
  /** where its name and its series' bars go (clear of its ring, its livery, the outline) */
  content: Box;
}

export interface Boosters {
  /** their tail (the hull's side of their nozzles) and the tip of their cones */
  x0: number;
  x1: number;
  shape: ReturnType<typeof boosterShape>;
}

export interface ShipGeometry {
  /** the drawing's frame (the whole rocket, flame room included) */
  W: number;
  H: number;
  /** body thickness and the fins' (boosters') band */
  T: number;
  F: number;
  cy: number;
  stroke: number;
  /** the tail's nozzle exit, the tail (body start), the nose's base, the front (the antenna's light) */
  xe: number;
  x0: number;
  xs: number;
  tip: number;
  /** how many stages the whole rocket has, and the first one still on */
  blocks: number;
  first: number;
  segments: Segment[];
  /** an interstage ring between stage `back` and the next one, centred on `x` */
  joints: { x: number; back: number }[];
  /** the inside of the body, all stages (single-stage rockets: their text's room) */
  content: Box;
  /** the tail's nozzle (bell and ribs), from x0 back to xe */
  nozzle: { bell: string; ribs: string };
  /** the tail's livery: engine ring, red band, checker strip (it ends at `end`) */
  livery: ReturnType<typeof tailLivery>;
  /** the fins at the tail, or null while the boosters are on */
  fins: { x0: number; len: number; h: number } | null;
  nose: { outline: string; belly: string; tip: string; end: number };
  window: { cx: number; cy: number; r: number };
  antenna: { x0: number; x1: number; light: number };
  /** the belly's two-tone shading, from these y down to the bottom line */
  belly: { light: number; dark: number };
  /** the two boosters (and their nozzles), while the warm-up lasts */
  boosters: Boosters | null;
}

/** Half the hull's thickness at `x` (its outer outline): T/2 along the body, less over the nose, 0 past its end. */
export function hullHalfAt(g: Pick<ShipGeometry, 'xs' | 'T'>, x: number): number {
  return noseHalfAt(x - g.xs, g.T, g.T);
}

/**
 * The boosters along the tail end of a rocket whose hull runs from `x0` to `xs` (half the body
 * long, at least 48 px, their cone short of the nose's base).
 */
export function boostersAlong(x0: number, xs: number, t: number): Boosters {
  const length = xs - x0;
  const bx0 = r1(x0 + 0.2 * t);
  const reach = Math.max(14, Math.min(Math.max(48, length * 0.5), length - 0.2 * t - 6));
  const bx1 = r1(bx0 + reach);
  const h = r1(Math.min(F - 3.6, 0.28 * t));
  const gap = r1(Math.max(1.6, F - h - 2.2));
  return { x0: bx0, x1: bx1, shape: boosterShape(bx0, bx1, h, gap, F, F + t) };
}

/**
 * The rocket, `width` long (its frame), `blocks` stages of which `first`..`blocks` are still on,
 * with or without its boosters; `thickness`: a thicker body, whose nose grows with it.
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
  /** the stages still on share the whole body (the phone's bar: the rocket always takes its whole length there) */
  stretch?: boolean;
}): ShipGeometry {
  const t = Math.max(T_BASE, thickness);
  const n = Math.max(1, Math.round(blocks));
  const f1 = Math.min(n, Math.max(1, Math.round(first)));
  const W = Math.max(150, Math.round(width));
  const H = t + 2 * F;
  const cy = F + t / 2;
  const nl = noseLengths(t);
  // from the front: the light, the antenna, the nose's rounded end, its base
  const tip = W - 0.5;
  const antennaX1 = r1(tip - nl.lightR - nl.light);
  const noseEnd = r1(antennaX1 - nl.antenna);
  const xs = r1(noseEnd - nl.len);
  const bodyFull = xs - (FLAME_ROOM + NOZZLE);
  const segLen = bodyFull / (stretch ? n - f1 + 1 : n);
  const x0 = r1(xs - (n - f1 + 1) * segLen);
  const xe = r1(x0 - NOZZLE);
  const livery = tailLivery(x0, t);

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
        left: r1((b === f1 ? livery.end : start + JOINT / 2) + CONTENT_GAP),
        right: r1(end - (b < n ? JOINT / 2 : STROKE) - CONTENT_GAP),
        top,
        bottom,
      },
    });
    if (b < n) joints.push({ x: end, back: b });
  }

  const on = boosters && f1 === 1;
  const nose = nosePaths(xs, F, F + t, cy, t, t);
  return {
    W,
    H,
    T: t,
    F,
    cy,
    stroke: STROKE,
    xe,
    x0,
    xs,
    tip,
    blocks: n,
    first: f1,
    segments,
    joints,
    content: { left: segments[0].content.left, right: segments[segments.length - 1].content.right, top, bottom },
    nozzle: nozzlePaths(x0, xe, cy, t),
    livery,
    fins: on ? null : { x0: r1(x0 + 0.286 * t), len: r1(1.32 * t), h: r1(Math.min(F, 0.43 * t)) },
    nose: { ...nose, end: noseEnd },
    window: { cx: r1(xs + 0.321 * t), cy: r1(cy - 0.071 * t), r: r1(0.143 * t) },
    antenna: { x0: noseEnd, x1: antennaX1, light: nl.light },
    belly: { light: r1(F + t - 0.17 * t), dark: r1(F + t - 0.07 * t) },
    boosters: on ? boostersAlong(x0, xs, t) : null,
  };
}

/** A rocket of one stage, no boosters: every rocket of the app other than the routine's. */
export function shipGeometry(width: number, thickness: number = T_BASE): ShipGeometry {
  return stackGeometry({ width, thickness });
}

/** How much of a one-stage rocket of the base thickness is not its text's room: from the frame's left to it, and from it to the frame's right. */
export const SHIP_ENDS = (() => {
  const g = shipGeometry(300);
  return { tail: g.content.left, nose: r1(g.W - g.content.right) };
})();

/**
 * How far to move a drawing whose first stages have gone so that what is left stands centred
 * where the whole rocket stood (px, negative: to the left... of half the missing length).
 */
export function shiftFor(g: Pick<ShipGeometry, 'x0'>): number {
  return -r1((g.x0 - (FLAME_ROOM + NOZZLE)) / 2);
}

/** The flame's box (pointing left, its root at the right edge, its middle at `h / 2`), as RocketShip draws it. */
export function flameBoxSize(): { w: number; h: number } {
  return { w: FLAME_LENGTH, h: r1(2 * 0.42 * T) };
}

export const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

// ---------------------------------------------------------------------------------------------
// What is written in a stage: the block's name over the bars of its series, as big as fits.

export const STAGE_TEXT = {
  /** the series' bars: done and to do, and the one in progress (thicker) */
  BAR: 7,
  BAR_NOW: 10,
  /** the name: never bigger than its room's height allows, never smaller than this (then "N") */
  MIN_PX: 9.5,
  /** a glyph's ink from its ascender to its descender, and its descender, in em (Geist, generous) */
  INK_EM: 0.94,
  DESC_EM: 0.2,
} as const;

/**
 * Where a stage's name and bars go, across the hull (frame px): the bars just above the belly's
 * shading, the name in the room above them; `maxPx`: the biggest name that room holds.
 */
export function stageLayout(g: Pick<ShipGeometry, 'F' | 'T' | 'belly'>) {
  const innerTop = g.F + STROKE;
  const mid = r1(g.belly.light - 0.8 - STAGE_TEXT.BAR / 2);
  const bars = { top: r1(mid - STAGE_TEXT.BAR_NOW / 2), bottom: r1(mid + STAGE_TEXT.BAR_NOW / 2), mid };
  const name = { top: r1(innerTop + 0.6), bottom: r1(mid - STAGE_TEXT.BAR / 2 - 1.2) };
  const maxPx = Math.floor(((name.bottom - name.top) / STAGE_TEXT.INK_EM) * 4) / 4;
  return { bars, name, maxPx };
}

/** The baseline that centres a name of `px` in its room (its ink: an ascender over the baseline, a descender under it). */
export const nameBaseline = (room: { top: number; bottom: number }, px: number) =>
  r1((room.top + room.bottom) / 2 + ((STAGE_TEXT.INK_EM - 2 * STAGE_TEXT.DESC_EM) / 2) * px);

export interface StageLabel {
  block: number;
  text: string;
  px: number;
  /** its middle along the rocket, and its baseline (frame px) */
  x: number;
  y: number;
  /** the room it was fitted in (px along the rocket) */
  room: number;
}

/**
 * The names written in the stages of `g`: "Bloque N", all at the same size, the biggest that
 * fits every stage (up to what the hull's height allows); if that would be under MIN_PX, just the
 * number, again as big as fits. Never wider than its stage's room.
 */
export function stageLabels(g: ShipGeometry, measure: MeasureText = estimateTextWidth): StageLabel[] {
  const { name, maxPx } = stageLayout(g);
  const rooms = g.segments.map((s) => Math.max(0, s.content.right - s.content.left - 2));
  const sizeFor = (text: (b: number) => string) =>
    Math.min(
      maxPx,
      ...g.segments.map((s, i) => {
        const w = measure(text(s.block), maxPx);
        return w <= rooms[i] ? maxPx : Math.floor(((maxPx * rooms[i]) / Math.max(1, w)) * 4) / 4;
      }),
    );
  const long = (b: number) => `Bloque ${b}`;
  const short = (b: number) => `${b}`;
  let text = long;
  let px = sizeFor(long);
  if (px < STAGE_TEXT.MIN_PX) {
    text = short;
    px = sizeFor(short);
  }
  // (the estimate of the width is proportional; a real measurement may not be: step down until it fits)
  while (px > 4 && g.segments.some((s, i) => measure(text(s.block), px) > rooms[i] + 0.01)) px -= 0.25;
  return g.segments.map((s, i) => ({
    block: s.block,
    text: text(s.block),
    px,
    x: r1((s.content.left + s.content.right) / 2),
    y: nameBaseline(name, px),
    room: rooms[i],
  }));
}

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

/** Which part of the routine's rocket is on: its stages (blocks), the first still on, the boosters. */
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
  /** the rocket as it stands parked (its stages still on) */
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
  const top = BANNER.H + BANNER.CLEAR; // the top of the rocket's frame (the fins' band)
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
// (its stages stretched over the body); its panels slide up out of the hull, side by side on its
// straight part, and back into it. They stand on the fins' band (26-11-2026: the fins at the tail
// reach that high, and the boosters before them), so nothing of the rocket covers their text; each
// one reaches down into the hull (hidden behind it), so the rocket can squash, hop or sit on its
// stands without a gap opening under them; they are clipped a little inside the hull.

export const PANEL = {
  /** what shows above the fins' band, outline included */
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
  /**
   * how far past the nose's base they may stand: the ogive leaves the hull almost flat, its line
   * less than a px lower there (the longer nose would otherwise leave a narrow phone's first panel
   * too short for a name)
   */
  OVER_NOSE: Math.round(0.5 * T_BASE),
} as const;

/** How far above the hull's top line the panels stand (the top of the fins and of the boosters). */
export const PANEL_LIFT = F - STROKE / 2;

/**
 * The first panel holds two lines, centred in its top PANEL.H: a line of 18 px (the name, or
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
  /** the hull's straight part and the flat start of the nose (widget pixels): the panels, together, never pass it */
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
 * Where the panels stand in the widget, over the whole rocket (the bar's), `rise` px taller than
 * PANEL.H (a name on two lines: panelRise). Always on the fins' band: the boosters of the warm-up
 * reach just as high, so they don't move when the boosters give way to the fins.
 */
export function panelLayout(L: Pick<WidgetLayout, 'frame' | 'ship'>, rise = 0): PanelLayout {
  const whole = stackGeometry({ width: L.frame });
  const base = L.ship.top + F;
  return {
    left: r1(L.ship.left + whole.x0),
    right: r1(L.ship.left + whole.xs + PANEL.OVER_NOSE),
    top: r1(base - PANEL_LIFT - PANEL.H - Math.max(0, rise)),
    base,
    clip: base + PANEL.SINK,
  };
}

/**
 * The stretch, as transforms (pure). The bar draws the rocket either at its real length (`real`,
 * standing centred: moved by `shift`) or stretched over the whole body (`full`, not moved), and
 * goes from one to the other through a look `u` (0: real, 1: stretched) that only moves things:
 * a stage's body (its white, its two long lines and its belly) and its bars scale along the
 * rocket, so no line gets thicker; what sits at either end of a stage (its rivets, its ring, the
 * nozzle, the livery and the fins) moves with that end; its name moves with its middle and is
 * never stretched (only made smaller, evenly, while the stage is shorter than it was drawn for);
 * whatever hangs behind the tail (flames, puffs) moves with the tail; the nose never moves in the
 * drawing, and the drawing moves by the shift. Every value is linear in `u`, so two keyframes
 * with one easing play the whole of it.
 */
export interface LookPair {
  real: ShipGeometry;
  full: ShipGeometry;
  /** how far the real rocket's drawing moves to stand centred */
  shift: number;
}

export type LookPart =
  | { kind: 'body'; block: number; left: number }
  | { kind: 'start' | 'end' | 'mid'; block: number }
  | { kind: 'tail' }
  | { kind: 'shift' };

const lerp = (a: number, b: number, u: number) => a + (b - a) * u;
const r2 = (n: number) => String(Math.round(n * 100) / 100);

/** Where stage `block` stands at look `u` (null: it isn't on). */
export function segmentAt(p: LookPair, block: number, u: number): { start: number; end: number } | null {
  const a = p.real.segments.find((s) => s.block === block);
  const b = p.full.segments.find((s) => s.block === block);
  if (!a || !b) return null;
  return { start: lerp(a.start, b.start, u), end: lerp(a.end, b.end, u) };
}

/**
 * The transform that shows a part drawn with the geometry of look `drawn` (0: real, 1: full) as
 * it stands at look `u`. A body part scales from its own left edge (`left`, frame px: its box's,
 * with transform-origin 0 0); a name (`mid`, its box centred on its stage, transform-origin at its
 * middle) moves with the stage's middle and shrinks evenly while the stage is shorter than it was
 * drawn for; the shift is the drawing's whole move (its inline transform).
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
  if (part.kind === 'mid') {
    const k = Math.min(1, (at.end - at.start) / (was.end - was.start));
    return `translateX(${r2((at.start + at.end) / 2 - (was.start + was.end) / 2)}px) scale(${Math.round(k * 10000) / 10000})`;
  }
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

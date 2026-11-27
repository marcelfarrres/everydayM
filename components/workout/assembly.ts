/*
 * The creator's assembly (phone), as pure numbers: while the questions are asked the routine's
 * rocket is built standing on a launch pad, from the top down (the nose with its window, then the
 * minutes, the blocks and last the engine with the intensity), a piece per answer; the sky goes
 * from dawn to full day as it fills; then it takes off by itself (the finale). AssemblyScene.tsx
 * draws and moves it with these; RoutineComposer.tsx decides what is known and what is asked.
 *
 * Everything in px, y down, in the scene's own box (the screen).
 */

import { NOSE } from '@/components/workout/rocketPaths';
import { barOnPad, baseLayout, baseScene } from '@/components/workout/launchDrum';
import { estimateTextWidth, padBarLayout } from '@/components/workout/padRocketShape';

// ---------------------------------------------------------------------------------------------
// The pieces, and which go on when

export type PieceId = 'nose' | 'minutes' | 'blocks' | 'engine';
/** Top to bottom: the order they are fitted in. */
export const PIECES: readonly PieceId[] = ['nose', 'minutes', 'blocks', 'engine'];

export type QuestionId = 'minutes' | 'rounds' | 'intensity';
/** The piece each question brings. */
export const PIECE_OF: Record<QuestionId, PieceId> = { minutes: 'minutes', rounds: 'blocks', intensity: 'engine' };

/** How a piece goes on: brought by the truck (an answer), or quickly (known from the sentence). */
export type FitMode = 'truck' | 'quick';

const isQuestion = (id: string): id is QuestionId => id === 'minutes' || id === 'rounds' || id === 'intensity';

/**
 * How many pieces may be on, from the top: the nose, and every piece after it that is known (the
 * sentence said it) or already answered, up to the first one still waiting for its answer.
 * `questions`: the ids asked, in order; `answered`: how many of them have been answered.
 */
export function fittedTarget(questions: readonly string[], answered: number): number {
  const open = new Set(questions.slice(Math.max(0, answered)).filter(isQuestion).map((q) => PIECE_OF[q]));
  let n = 1;
  for (const piece of PIECES.slice(1)) {
    if (open.has(piece)) break;
    n += 1;
  }
  return n;
}

/** How each piece goes on: by truck when its question was answered, quickly otherwise. */
export function pieceModes(questions: readonly string[], answered: number): Record<PieceId, FitMode> {
  const modes: Record<PieceId, FitMode> = { nose: 'quick', minutes: 'quick', blocks: 'quick', engine: 'quick' };
  questions.forEach((q, i) => {
    if (isQuestion(q) && i < answered) modes[PIECE_OF[q]] = 'truck';
  });
  return modes;
}

/** The sky's step for `fitted` pieces on: 0 (dawn, only the nose) to 3 (full day, the whole rocket). */
export function skyStep(fitted: number): 0 | 1 | 2 | 3 {
  return Math.max(0, Math.min(3, Math.round(fitted) - 1)) as 0 | 1 | 2 | 3;
}

/** Text on the sky: light while its top is still dark (steps 0 and 1), ink once it is light. */
export function skyInk(step: number): boolean {
  return step >= 2;
}

// ---------------------------------------------------------------------------------------------
// The sky, step by step (approved sketch creador-opciones.html: dawn, two steps, full day)

export interface SkyStep {
  /** the sky's gradient from the top (0) to the horizon (1) */
  sky: readonly (readonly [number, string])[];
  land: string;
  ground: string;
  road: string;
  fore: string;
  sun: string;
  glow: number;
  /** the street lamps still lit */
  lamps: boolean;
}

export const SKY_STEPS: readonly SkyStep[] = [
  // step 0 is the start screen's own dawn (DAWN.sky)
  { sky: [[0, '#2b2a28'], [0.3, '#4a4156'], [0.6, '#a5606a'], [0.83, '#ec9d78'], [1, '#fbd9ae']], land: '#2a2625', ground: '#2f2b29', road: '#463f3b', fore: '#1f1c1b', sun: '#fff4d8', glow: 0.85, lamps: true },
  { sky: [[0, '#343a55'], [0.32, '#5d5e85'], [0.62, '#b8808e'], [0.85, '#f1b18c'], [1, '#fde2bb']], land: '#3a3540', ground: '#383330', road: '#4e4743', fore: '#25211f', sun: '#fff4d8', glow: 0.72, lamps: true },
  { sky: [[0, '#6c90bf'], [0.36, '#97b2d7'], [0.66, '#dbc3c2'], [0.87, '#f8d5b0'], [1, '#fff1d9']], land: '#6b7286', ground: '#4a4440', road: '#5d5752', fore: '#322e2b', sun: '#fff8e4', glow: 0.6, lamps: false },
  { sky: [[0, '#4d9ae0'], [0.42, '#80b9ea'], [0.78, '#b7d9f3'], [1, '#e9f5fc']], land: '#8b99ad', ground: '#5b5551', road: '#6b6560', fore: '#3d3936', sun: '#fffbea', glow: 0.55, lamps: false },
];

/**
 * The start screen's base at full day (a routine taking off straight from it): the lower part of
 * the day sky, from where the page's own day (PAGE_DAY) leaves off down to the horizon.
 */
export const BASE_DAY: readonly (readonly [number, string])[] = [
  [0, '#80b9ea'],
  [0.55, '#b7d9f3'],
  [1, '#e9f5fc'],
];
/**
 * The page above the base at full day (CSS, over the whole page): from the top down to where the
 * base starts (its height: LaunchBase's), reaching BASE_DAY's first colour exactly there, so the day
 * sky is one gradient with no seam at the base's top edge.
 */
export const PAGE_DAY = 'linear-gradient(180deg, #4d9ae0 0%, #80b9ea calc(100% - clamp(236px, 40dvh, 380px)), #80b9ea 100%)';

// ---------------------------------------------------------------------------------------------
// Sizes

/**
 * The hull's thickness of the standing rocket: the one the text bar's rocket has when it stands on
 * the pad in the start screen's launch (LaunchBase.launchBar), for a screen `width` × `height`.
 */
export function padHull(width: number, height: number, safeBottom = 0): number {
  const formW = Math.min(width, 672); // the form is max-w-2xl
  const baseH = Math.min(380, Math.max(236, height * 0.4));
  const L = baseLayout(formW, baseH, safeBottom);
  const side = width >= 640 ? 32 : 20;
  const bar = padBarLayout(formW - 2 * side + 16, 1, false);
  const { scale } = barOnPad(L, bar.g.W, bar.g.T);
  const k = Math.min(1, (L.padY - 10) / L.rocket.length);
  return Math.round(bar.g.T * scale * k * 10) / 10;
}

/** The pieces' hulls, in hull thicknesses (the engine's nozzle, the nose's cone and antenna on top). */
export const PIECE_UNITS = { nozzle: 0.36, engine: 2.2, blocks: 3.9, minutes: 1.9, nose: 3.4 } as const;
/** The nose cone and its antenna with the light, in hull thicknesses. */
export const NOSE_TIP = NOSE.len + NOSE.antenna + 2 * NOSE.light;

/**
 * A label written along a piece: the creator's option text (15 px semibold), the same on the loose
 * piece and once it is on the rocket; smaller only on a thin hull (share of it) or a short piece.
 */
export const LABEL = { px: 15, share: 0.62, min: 10 } as const;

/** The longest answer each piece carries (the minutes follow the slider: up to «40 min»). */
export const ANSWER_LABELS = { minutes: '40 min', blocks: 'Los que encajen', engine: 'Media' } as const;
/** The nose's hull never gets shorter than this, in hull thicknesses (it gives first on a short screen). */
export const NOSE_MIN = 1.8;

/**
 * The pieces' hulls, px, for a hull `T` px thick: at least their units, and long enough for their
 * longest answer at the options' size (a little generous: the estimate of the text's width).
 */
export function answerHulls(T: number): Record<PieceId, number> {
  const words = (text: string) => estimateTextWidth(text, LABEL.px);
  return {
    nose: PIECE_UNITS.nose * T,
    minutes: Math.max(PIECE_UNITS.minutes * T, words(ANSWER_LABELS.minutes) + 0.44 * T),
    blocks: Math.max(PIECE_UNITS.blocks * T, words(ANSWER_LABELS.blocks) + 0.44 * T),
    // (the engine's words start after its livery: ring, red band, checker)
    engine: Math.max(PIECE_UNITS.engine * T, words(ANSWER_LABELS.engine) + 1.07 * T),
  };
}

/**
 * The question's title beside the porthole: never narrower than `TITLE_MIN` px; the porthole as big
 * as `PORTHOLE_SHARE` of the width when the height allows. A title whose widest word does not fit
 * its width at its size is set a little smaller (`titleSize`, never under `TITLE_PX.min`).
 */
export const TITLE_MIN = 160;
export const PORTHOLE_SHARE = 0.23;
/** The questions' title size on a phone (2.45rem) and the least it may be set at, px. */
export const TITLE_PX = { max: 39.2, min: 30 } as const;

/** The title's size so that its every word fits `width` px (it wraps between words): `max` or less. */
export function titleSize(title: string, width: number, measure: (text: string, px: number) => number, { max, min }: { max: number; min: number } = TITLE_PX): number {
  const widest = Math.max(...title.split(/\s+/).filter(Boolean).map((w) => measure(w, max)), 1);
  if (widest <= width) return max;
  return Math.max(min, Math.floor(((max * width) / widest) * 4) / 4);
}

// ---------------------------------------------------------------------------------------------
// Where everything stands

export interface Circle {
  x: number;
  y: number;
  r: number;
}

export interface PieceBox {
  /** top of its box on the screen, and its length along the rocket (px) */
  top: number;
  len: number;
  /** its hull's length (the nose: without the cone; the engine: without the nozzle) */
  hull: number;
}

export interface AssemblyLayout {
  W: number;
  H: number;
  /** the hull's thickness, the fins' reach out of it, the pieces' box width (fin tip to fin tip) */
  T: number;
  finH: number;
  box: number;
  /** the rocket's centre line */
  cx: number;
  horizon: number;
  road: { top: number; h: number };
  /** the pad's deck: the rocket's nozzle stands on it */
  padTop: number;
  /** the darker strip in front (none now: the ground runs to the bottom, as on the start screen) */
  foreTop: number;
  /**
   * The start screen's dawn, exactly where it was (the questions open over the same scene, no jump):
   * the top of its base (its sky's gradient runs from there to the horizon) and its sun.
   */
  dawn: { top: number; sun: Circle; glow: number };
  pieces: Record<PieceId, PieceBox>;
  /** the top of the antenna's light */
  rocketTop: number;
  /** the rocket's round window (on the nose) */
  window: Circle;
  tower: { x: number; w: number; top: number; bottom: number };
  /** the crane's arm (jib): its y (top chord), left end, the tower side */
  jib: { y: number; h: number; x0: number; x1: number };
  /** the hook's cable: from the trolley down to the antenna */
  cable: { x: number; top: number; bottom: number };
  /** the big porthole at the top right */
  porthole: Circle;
  /** the steel rim around the porthole's glass, px */
  rim: number;
  /** the questions' column on the left, and how wide its title may be (clear of the porthole) */
  column: { left: number; right: number; top: number; titleWidth: number; titleMin: number };
  /** the sun at each sky step, and how far the skyline slides at each */
  suns: Circle[];
  skylineShift: number[];
  /** the truck: its scale, bed, wheels and where it stops (its left edge) */
  truck: { u: number; bedW: number; bedTop: number; wheelY: number; stopLeft: number; width: number };
  /** where the mechanics' platform stands (their feet) for each seam they bolt, and their scale */
  platform: Record<Exclude<PieceId, 'nose'>, number>;
  mechanic: number;
  /** the questions' column ends 44 px under this (above the road) */
  cambiarTop: number;
  /**
   * The crane picking the answers (blocks, intensity): the left end of its arm's extension over the
   * loose pieces, where the truck's lift waits (its centre) while the hook lowers a piece onto it,
   * and how high the hook parks.
   */
  pick: { x0: number; loadX: number; parkY: number };
  /** how much the pieces' hulls were shortened to fit (1: not at all) */
  squeeze: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** The sun rises this share of the horizon's height while the start screen gives way to the questions. */
export const DAWN_RISE = 0.03;
/** The start screen gives way to the questions: its things fade out over the same scene, ms. */
export const OPEN_QUESTIONS_MS = 550;

/**
 * The scene `W` × `H` px with a hull `T` px thick; `safeTop`/`safeBottom`: the screen's insets.
 * From the bottom up: «Cambiar», the road, the pad and the rocket on it, the crane's arm over the
 * rocket, the porthole between the header and the crane. On a short screen the pieces' hulls are
 * shortened (never under 0.6) and the porthole shrinks (never under a 26 px radius).
 */
export function assemblyLayout(W: number, H: number, T: number, safeTop = 0, safeBottom = 0): AssemblyLayout {
  const u = T / 36;
  const finH = r1(0.43 * T);
  const box = r1(T + 2 * finH);
  const header = 64 + safeTop;

  // from the bottom: the start screen's own ground, road and horizon (the same scene goes on),
  // the pad on the road's near edge
  const baseH = Math.min(380, Math.max(236, H * 0.4));
  const dawnTop = Math.round(H - baseH);
  const startBase = baseLayout(Math.min(W, 672), baseH, safeBottom);
  const startScene = baseScene(startBase);
  const road = { top: Math.round(dawnTop + startScene.road.top), h: startScene.road.h };
  const roadH = road.h;
  const padTop = road.top - 2;
  const horizon = Math.round(dawnTop + startScene.horizon);
  const foreTop = H;
  const cambiarTop = road.top - 6 - 44;

  // across: the tower on the right, the rocket just left of it
  const edge = Math.round(W * 0.067);
  const tw = Math.round(Math.max(14, Math.min(20, W * 0.046)));
  const towerX = W - edge - tw;
  const cx = r1(towerX - Math.max(12, 0.5 * T) - T / 2);

  // the rocket's length: the answers' pieces long enough for their words at the options' size
  // (ANSWER_LABELS); if the porthole and the crane would not fit above it, the nose gives first,
  // then the porthole, and only then every piece alike
  const fixed = (PIECE_UNITS.nozzle + NOSE_TIP) * T;
  const RIM = 11;
  const minR = 26;
  const left = W >= 640 ? 32 : 20;
  // the porthole as big as the width allows, never leaving the title less than TITLE_MIN
  const wantR = Math.max(minR, Math.min(Math.round(PORTHOLE_SHARE * W), Math.floor((W - 12 - left - 10 - TITLE_MIN) / 2) - RIM));
  const crane = 6 + 6 + 28 * u; // the gaps round the porthole, the cable and the jib
  const want = answerHulls(T);
  const answers = want.minutes + want.blocks + want.engine;
  const roomFor = (R: number) => padTop - header - crane - 2 * (R + RIM) - fixed;
  let nose = want.nose;
  let fitR = wantR;
  let squeeze = 1;
  if (roomFor(fitR) < answers + nose) nose = Math.max(NOSE_MIN * T, roomFor(fitR) - answers);
  if (roomFor(fitR) < answers + nose) fitR = Math.max(minR, Math.floor((padTop - header - crane - fixed - answers - nose) / 2) - RIM);
  if (roomFor(fitR) < answers + nose) squeeze = Math.max(0.6, roomFor(fitR) / (answers + nose));
  const hull = {
    engine: r1(want.engine * squeeze),
    blocks: r1(want.blocks * squeeze),
    minutes: r1(want.minutes * squeeze),
    nose: r1(nose * squeeze),
  };
  const engineLen = r1(PIECE_UNITS.nozzle * T + hull.engine);
  const noseLen = r1(hull.nose + NOSE_TIP * T);
  const engineTop = r1(padTop - engineLen);
  const blocksTop = r1(engineTop - hull.blocks);
  const minutesTop = r1(blocksTop - hull.minutes);
  const noseTop = r1(minutesTop - noseLen);
  const pieces: Record<PieceId, PieceBox> = {
    nose: { top: noseTop, len: noseLen, hull: hull.nose },
    minutes: { top: minutesTop, len: hull.minutes, hull: hull.minutes },
    blocks: { top: blocksTop, len: hull.blocks, hull: hull.blocks },
    engine: { top: engineTop, len: engineLen, hull: hull.engine },
  };
  // the window, as PadRocket draws it (lying: on the cone, 0.321 T from its base, a little above the centre line)
  const win: Circle = { x: r1(cx - 0.071 * T), y: r1(noseTop + noseLen - hull.nose - 0.321 * T), r: r1(0.143 * T) };

  // the crane: its arm over the rocket's top, the cable down to the antenna's light
  const rocketTop = noseTop;
  const cableLen = Math.round(18 * u);
  const jibH = Math.max(7, Math.round(10 * u));
  const jibY = Math.round(rocketTop - cableLen - jibH);
  const jibX0 = Math.round(Math.max(W * 0.42, cx - 3.2 * T));
  const tower = { x: towerX, w: tw, top: jibY - 2, bottom: foreTop + 2 };

  // the porthole: top right, between the header and the crane
  const space = jibY - 6 - (header + 6);
  const R = Math.max(minR, Math.min(wantR, Math.floor(space / 2) - RIM));
  const porthole: Circle = { x: Math.round(W - 12 - R - RIM), y: Math.round(header + 6 + RIM + R), r: R };

  // the questions' column: left of the rocket (its fins and the left mechanic), the title also left of the porthole
  const right = Math.round(cx - box / 2 - 12);
  const portholeLeft = porthole.x - R - RIM;
  const column = {
    left,
    right,
    top: header + 20,
    titleWidth: Math.max(120, Math.min(right, portholeLeft - 10) - left),
    // (the answers start under the porthole, and under the crane's arm: its hook hangs over them)
    titleMin: Math.max(0, Math.round(porthole.y + R + RIM + 12 - (header + 20)), Math.round(jibY + jibH + 16 - (header + 20))),
  };

  // the sun, climbing: first where the start screen had it (a little higher: it rises as the
  // questions open), then the sketch's positions on its 390 × 844, against the horizon
  const sx = W / 390;
  const k = W / 320;
  const dawnSun: Circle = { x: Math.round(92 * k), y: horizon - 1, r: Math.round(22 * k) };
  const suns: Circle[] = [
    { ...dawnSun, y: Math.round(dawnSun.y - DAWN_RISE * horizon) },
    ...[
      [0.215, 0.15, 24],
      [0.256, 0.264, 25],
      [0.246, 0.405, 26],
    ].map(([x, up, r]) => ({ x: Math.round(W * x), y: Math.round(horizon - horizon * up), r: Math.round(r * sx) })),
  ];
  const skylineShift = [0, 1, 2, 3].map((s) => -Math.round(s * 0.06 * W));

  // the truck: its bed under the rocket, wide enough for the engine's fins
  const bedW = Math.round(Math.max(64 * u, box + 12));
  const wheelY = Math.round(road.top + 0.72 * roadH);
  const bedTop = Math.round(wheelY - 15 * u);
  const truck = { u: r1(u), bedW, bedTop, wheelY, stopLeft: Math.round(cx - bedW / 2), width: Math.round(bedW + 22 * u) };

  // the mechanics: feet a little under the seam, so their hands are at it
  const mechanic = r1(Math.max(0.6, Math.min(0.95, T / 40)));
  const feet = (seam: number) => Math.round(seam + 36 * mechanic * 0.62);
  const platform = { minutes: feet(minutesTop), blocks: feet(blocksTop), engine: feet(engineTop) };

  return {
    W,
    H,
    T,
    finH,
    box,
    cx,
    horizon,
    road,
    padTop,
    foreTop,
    pieces,
    rocketTop,
    window: win,
    tower,
    jib: { y: jibY, h: jibH, x0: jibX0, x1: towerX + tw },
    cable: { x: cx, top: jibY + jibH, bottom: rocketTop },
    porthole,
    rim: RIM,
    column,
    suns,
    skylineShift,
    truck,
    platform,
    mechanic,
    cambiarTop,
    dawn: { top: dawnTop, sun: dawnSun, glow: Math.round(118 * k) },
    pick: {
      x0: Math.round(left + Math.min(engineLen, hull.blocks) - 6),
      loadX: Math.round(cx - box - 12),
      parkY: Math.round(jibY + jibH + 14),
    },
    squeeze: r1(squeeze * 100) / 100,
  };
}

/** The piece's bottom on the screen. */
export const pieceBottom = (L: AssemblyLayout, piece: PieceId) => L.pieces[piece].top + L.pieces[piece].len;

/** How far the truck's lift rises to dock `piece` under the one above it, px (its platform is 4 truck units thick). */
export function liftFor(L: AssemblyLayout, piece: PieceId): number {
  return Math.max(0, Math.round(L.truck.bedTop - 4 * L.truck.u - pieceBottom(L, piece)));
}

/**
 * The two dashed "zoom" lines from the big porthole to the rocket's small window (outer
 * tangents of the two circles), each as [x1, y1, x2, y2]: from the big one's rim to the small one's.
 */
export function zoomLines(big: Circle, small: Circle): [number, number, number, number][] {
  const dx = small.x - big.x;
  const dy = small.y - big.y;
  const d = Math.hypot(dx, dy);
  if (d <= Math.abs(big.r - small.r) + 0.01) return [];
  const th = Math.atan2(dy, dx);
  const al = Math.acos((big.r - small.r) / d);
  return [al, -al].map((a) => [
    r1(big.x + big.r * Math.cos(th + a)),
    r1(big.y + big.r * Math.sin(th + a)),
    r1(small.x + small.r * Math.cos(th + a)),
    r1(small.y + small.r * Math.sin(th + a)),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Timings

/** The sky's step (and the sun, the skyline, the text's colour) after an answer: a slow tween, ms. */
export const SKY_MS = 1200;

/** A piece brought by the truck, ms. */
export const TRUCK = { driveInMs: 950, liftMs: 650, boltGapMs: 90, boltMs: 520, lowerMs: 300, driveOutMs: 750 } as const;

export interface TruckTimeline {
  /** it drives in and stops under the rocket */
  driveIn: [number, number];
  /** its lift raises the piece to dock */
  lift: [number, number];
  dockAt: number;
  /** the two bolts (sparks and a clack each) */
  bolts: [number, number];
  /** the piece is on (the static rocket has it from here) */
  placedAt: number;
  /** the lift comes down and the truck drives off */
  lower: [number, number];
  driveOut: [number, number];
  /** the truck is gone: the next piece may come */
  endAt: number;
}

export function truckTimeline(): TruckTimeline {
  const t = TRUCK;
  const liftEnd = t.driveInMs + t.liftMs;
  const bolt1 = liftEnd + t.boltGapMs;
  const bolt2 = bolt1 + Math.round(t.boltMs / 2);
  const placedAt = liftEnd + t.boltGapMs + t.boltMs;
  return {
    driveIn: [0, t.driveInMs],
    lift: [t.driveInMs, liftEnd],
    dockAt: liftEnd,
    bolts: [bolt1, bolt2],
    placedAt,
    lower: [placedAt, placedAt + t.lowerMs],
    driveOut: [placedAt + t.lowerMs, placedAt + t.lowerMs + t.driveOutMs],
    endAt: placedAt + t.lowerMs + t.driveOutMs,
  };
}

/** A piece that goes on quickly (known from the sentence): it slides up into place, a clack, ms. */
export const QUICK = { riseMs: 360, boltMs: 160, gapMs: 120 } as const;

/**
 * An answer: the very piece tapped in the column goes onto the truck's lift and up into its place,
 * ms from the moment the truck is free. The truck drives in meanwhile; the piece turns upright on
 * its way to the lift; the lift raises it; it docks and is bolted (placed: about 2.7 s); the next
 * question comes a beat later, while the truck lowers its lift and drives off.
 */
export const TAKE = { driveInMs: 850, flyAt: 120, flyMs: 1150, liftAt: 1350, liftMs: 750, boltGapMs: 90, boltMs: 520, beatMs: 280, lowerMs: 300, driveOutMs: 750 } as const;

export interface TakeTimeline {
  driveIn: [number, number];
  /** from the column onto the lift, turning upright */
  fly: [number, number];
  lift: [number, number];
  dockAt: number;
  bolts: [number, number];
  placedAt: number;
  /** the next question */
  nextAt: number;
  lower: [number, number];
  driveOut: [number, number];
  endAt: number;
}

export function takeTimeline(): TakeTimeline {
  const t = TAKE;
  const flyEnd = t.flyAt + t.flyMs;
  const liftAt = Math.max(t.liftAt, flyEnd, t.driveInMs);
  const dockAt = liftAt + t.liftMs;
  const bolt1 = dockAt + t.boltGapMs;
  const bolt2 = bolt1 + Math.round(t.boltMs / 2);
  const placedAt = dockAt + t.boltGapMs + t.boltMs;
  return {
    driveIn: [0, t.driveInMs],
    fly: [t.flyAt, flyEnd],
    lift: [liftAt, dockAt],
    dockAt,
    bolts: [bolt1, bolt2],
    placedAt,
    nextAt: placedAt + t.beatMs,
    lower: [placedAt, placedAt + t.lowerMs],
    driveOut: [placedAt + t.lowerMs, placedAt + t.lowerMs + t.driveOutMs],
    endAt: placedAt + t.lowerMs + t.driveOutMs,
  };
}

/** From the start of a piece's fitting to when the next one may start, ms. */
export function fitMs(mode: FitMode): number {
  return mode === 'truck' ? truckTimeline().endAt : QUICK.riseMs + QUICK.boltMs + QUICK.gapMs;
}

/**
 * The finale: the sentence and «Cambiar» are read for `readMs` (never before the routine is
 * built), then the take-off; the smoke covers the screen in `smokeMs`; «A ponerse como un cohete»
 * on the white for `whiteMs` (its words come in over ~0.7 s, then 2.4 s to read them; the same
 * with reduced motion); the smoke sinks away uncovering the player in `veilFadeMs`. With no
 * questions (the start screen's own launch), the sentence comes `cSentenceMs` after the tap at the
 * soonest and the sky turns to day over `cSkyMs`.
 */
export const FINALE = { readMs: 3500, smokeMs: 1100, whiteMs: 3150, veilFadeMs: 900, cSentenceMs: 1300, cSkyMs: 2600 } as const;

/** The assembly scene's take-off: ignition this long before lift-off, and the climb out of the top, ms (the rest: portholeTimeline). */
export const TAKEOFF = { igniteLeadMs: 500, liftMs: 1500 } as const;

// ---------------------------------------------------------------------------------------------
// The typed sentence's nose, carried by the crane from the first page to the questions

/** The crane lifts the nose (`liftPx` in `liftMs`), then turns it upright and carries it to its place (`carryMs`); a beat (`holdMs`) and the scene's own nose takes over. */
export const NOSE_CARRY = { liftMs: 450, liftPx: 34, carryMs: 950, holdMs: 60 } as const;

/**
 * Where the carried nose ends: the bar's nose drawing (`W` × `H`, lying, nose to the right, its
 * hull `T` thick, its box's top-left at `left`, `top` on the screen) turned upright about its
 * centre and shrunk so its hull is the questions' nose's (`to.T`), its antenna's light at `to.top`
 * on the centre line `to.cx`; and how much of it is cut from its flat end (`clipLeft`, in the
 * drawing's own px) so it is exactly as long as that nose (`to.len`).
 */
export function noseCarryEnd(
  from: { left: number; top: number; W: number; H: number; T: number },
  to: { cx: number; top: number; len: number; T: number },
): { transform: string; scale: number; clipLeft: number } {
  const s = from.T > 0 ? to.T / from.T : 1;
  const c = { x: from.left + from.W / 2, y: from.top + from.H / 2 };
  const tx = to.cx - c.x;
  const ty = to.top + (s * from.W) / 2 - c.y;
  return {
    transform: `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px) rotate(-90deg) scale(${s.toFixed(4)})`,
    scale: s,
    clipLeft: Math.max(0, from.W - to.len / s),
  };
}

// ---------------------------------------------------------------------------------------------
// The crane chooses and hooks (the blocks and the intensity questions)

/**
 * The crane picks the answer's piece (blocks, intensity), ms from the tap: its open hook goes to
 * that piece's end (`go`), grabs it (`grab`: a clang), lifts it so it swings upright hanging from
 * the hook (`swing`), carries it over the truck waiting left of the rocket (`carry`), lowers it
 * onto the truck's lift (`lower`) and lets go; the truck drives under the rocket (`drive`), the
 * lift raises it (`lift`), it docks, two bolts, placed (about 3.1 s), the next question a beat
 * later. While no piece is chosen the hook drifts from one loose piece to the next (`idle*`).
 */
export const PICK = {
  goMs: 280,
  grabMs: 160,
  swingMs: 380,
  carryMs: 500,
  lowerMs: 260,
  hookUpMs: 380,
  truckInMs: 850,
  driveMs: 450,
  liftMs: 500,
  boltGapMs: 90,
  boltMs: 520,
  beatMs: 280,
  lowerLiftMs: 300,
  driveOutMs: 750,
  idleMoveMs: 950,
  idleRestMs: 650,
} as const;

export interface PickTimeline {
  go: [number, number];
  grab: [number, number];
  swing: [number, number];
  carry: [number, number];
  lower: [number, number];
  /** the hook lets go and goes back up */
  hookUp: [number, number];
  /** the truck drives to its loading spot, then under the rocket */
  truckIn: [number, number];
  drive: [number, number];
  lift: [number, number];
  dockAt: number;
  bolts: [number, number];
  placedAt: number;
  nextAt: number;
  lowerLift: [number, number];
  driveOut: [number, number];
  endAt: number;
}

/** A pick's durations, ms (PICK, or a variant of it: TANK_PICK). */
export type PickTiming = { readonly [K in keyof typeof PICK]: number };

export function pickTimeline(p: PickTiming = PICK): PickTimeline {
  const go: [number, number] = [0, p.goMs];
  const grab: [number, number] = [go[1], go[1] + p.grabMs];
  const swing: [number, number] = [grab[1], grab[1] + p.swingMs];
  const carry: [number, number] = [swing[1], swing[1] + p.carryMs];
  const lower: [number, number] = [carry[1], carry[1] + p.lowerMs];
  const truckIn: [number, number] = [0, Math.min(p.truckInMs, lower[0])];
  const drive: [number, number] = [lower[1], lower[1] + p.driveMs];
  const lift: [number, number] = [drive[1], drive[1] + p.liftMs];
  const dockAt = lift[1];
  const bolt1 = dockAt + p.boltGapMs;
  const placedAt = dockAt + p.boltGapMs + p.boltMs;
  return {
    go,
    grab,
    swing,
    carry,
    lower,
    hookUp: [lower[1], lower[1] + p.hookUpMs],
    truckIn,
    drive,
    lift,
    dockAt,
    bolts: [bolt1, bolt1 + Math.round(p.boltMs / 2)],
    placedAt,
    nextAt: placedAt + p.beatMs,
    lowerLift: [placedAt, placedAt + p.lowerLiftMs],
    driveOut: [placedAt + p.lowerLiftMs, placedAt + p.lowerLiftMs + p.driveOutMs],
    endAt: placedAt + p.lowerLiftMs + p.driveOutMs,
  };
}

/** A point of the pick: the piece's centre and turn (deg, CSS: -90 is upright), and the hook's tip. */
export interface PickPose {
  t: number;
  piece: { x: number; y: number; rot: number };
  hook: { x: number; y: number };
}

/**
 * The pick, pose by pose (ms from the tap, scene px): the loose piece lying with its box's top-left
 * at `at` (`len` × `box`), the hook starting at `hook`, the truck's lift centred at `loadX` while it
 * waits, then under the rocket (`cx`); the piece's top on the lift at `dropTop` before the lift
 * raises it by `lift`; the hook parks back up at `parkY`. Between two poses: straight lines (the
 * swing is drawn as an arc of poses about the hook).
 */
export function pickPoses(
  { at, len, box, hook, loadX, cx, dropTop, lift, parkY, raise }: { at: { x: number; y: number }; len: number; box: number; hook: { x: number; y: number }; loadX: number; cx: number; dropTop: number; lift: number; parkY: number; raise: number },
  t: PickTimeline = pickTimeline(),
): PickPose[] {
  const c0 = { x: at.x + len / 2, y: at.y + box / 2 };
  const end = { x: at.x + len, y: c0.y };
  const lying = { ...c0, rot: 0 };
  const poses: PickPose[] = [
    { t: 0, piece: lying, hook },
    { t: t.go[1], piece: lying, hook: end },
    { t: t.grab[1], piece: lying, hook: end },
  ];
  // the swing: it turns about its end (the hook) while the hook rises
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const s = i / steps;
    const th = (-Math.PI / 2) * s;
    const h = { x: end.x, y: end.y - raise * s };
    poses.push({ t: t.swing[0] + (t.swing[1] - t.swing[0]) * s, piece: { x: h.x - (len / 2) * Math.cos(th), y: h.y - (len / 2) * Math.sin(th), rot: -90 * s }, hook: h });
  }
  // carried over the waiting truck, a little above, then lowered onto its lift
  const above = { x: loadX, y: dropTop - Math.max(24, raise) };
  poses.push({ t: t.carry[1], piece: { x: above.x, y: above.y + len / 2, rot: -90 }, hook: above });
  const onLift = { x: loadX, y: dropTop };
  poses.push({ t: t.lower[1], piece: { x: onLift.x, y: onLift.y + len / 2, rot: -90 }, hook: onLift });
  // the hook lets go and parks up; the truck takes the piece under the rocket; the lift raises it
  poses.push({ t: t.hookUp[1], piece: { x: onLift.x + ((cx - loadX) * (t.hookUp[1] - t.drive[0])) / (t.drive[1] - t.drive[0]), y: onLift.y + len / 2, rot: -90 }, hook: { x: loadX, y: parkY } });
  poses.push({ t: t.drive[1], piece: { x: cx, y: dropTop + len / 2, rot: -90 }, hook: { x: loadX, y: parkY } });
  poses.push({ t: t.lift[1], piece: { x: cx, y: dropTop - lift + len / 2, rot: -90 }, hook: { x: loadX, y: parkY } });
  return poses.sort((a, b) => a.t - b.t);
}

/**
 * The minutes' tank, taken by the crane (its hook was the button): the hook rises from the button,
 * goes over the tank and down onto its top (`go`, longer than a loose piece's), grabs it, lifts it
 * (`swing`: no turn, it is upright already); while it is carried it shrinks to the rocket's minutes
 * piece; then as every pick: lowered onto the waiting truck, under the rocket, lift, dock, bolts.
 */
export const TANK_PICK = { ...PICK, goMs: 700, swingMs: 260 } as const;

/** A pose of the tank's pick: the element's centre and its scale across and along (it becomes the piece), and the hook's tip. */
export interface TankPose {
  t: number;
  box: { x: number; y: number; sx: number; sy: number };
  hook: { x: number; y: number };
}

/**
 * The tank's pick, pose by pose: the tank `w` × `h` with its top-left at `at`, the hook starting at
 * `hook` (in the button), parking at `parkY` between moves; it ends `box` wide and `len` long (the
 * minutes piece) on the truck's lift at `loadX` (its top at `dropTop`), then under the rocket at
 * `cx`, raised `lift`. The hook holds the element's top centre from the grab to the drop.
 */
export function tankPickPoses(
  { at, w, h, hook, parkY, loadX, cx, dropTop, lift, box, len, raise }: { at: { x: number; y: number }; w: number; h: number; hook: { x: number; y: number }; parkY: number; loadX: number; cx: number; dropTop: number; lift: number; box: number; len: number; raise: number },
  t: PickTimeline = pickTimeline(TANK_PICK),
): TankPose[] {
  const c0 = { x: at.x + w / 2, y: at.y + h / 2 };
  const full = { sx: 1, sy: 1 };
  const piece = { sx: box / w, sy: len / h };
  const topOf = (b: { x: number; y: number; sy: number }) => ({ x: b.x, y: b.y - (h * b.sy) / 2 });
  const rest = { x: c0.x, y: c0.y, ...full };
  const go = t.go[1] - t.go[0];
  const poses: TankPose[] = [
    { t: 0, box: rest, hook },
    { t: go * 0.3, box: rest, hook: { x: hook.x, y: parkY } },
    { t: go * 0.72, box: rest, hook: { x: c0.x, y: parkY } },
    { t: t.go[1], box: rest, hook: topOf(rest) },
    { t: t.grab[1], box: rest, hook: topOf(rest) },
  ];
  const up = { ...rest, y: rest.y - raise };
  poses.push({ t: t.swing[1], box: up, hook: topOf(up) });
  const above = { x: loadX, y: dropTop - Math.max(24, raise) + len / 2, ...piece };
  poses.push({ t: t.carry[1], box: above, hook: topOf(above) });
  const onLift = { x: loadX, y: dropTop + len / 2, ...piece };
  poses.push({ t: t.lower[1], box: onLift, hook: topOf(onLift) });
  const drive = (ms: number) => loadX + ((cx - loadX) * Math.max(0, Math.min(1, (ms - t.drive[0]) / (t.drive[1] - t.drive[0]))));
  poses.push({ t: t.hookUp[1], box: { ...onLift, x: drive(t.hookUp[1]) }, hook: { x: loadX, y: parkY } });
  poses.push({ t: t.drive[1], box: { ...onLift, x: cx }, hook: { x: loadX, y: parkY } });
  poses.push({ t: t.lift[1], box: { x: cx, y: dropTop - lift + len / 2, ...piece }, hook: { x: loadX, y: parkY } });
  return poses.sort((a, b) => a.t - b.t);
}

// ---------------------------------------------------------------------------------------------
// The last change of clothes in a big porthole, then into the rocket's window and lift-off

/**
 * The porthole's ending (phone, both paths): it comes to its big place (grows out of the rocket's
 * window, or moves there from where it was) in `moveMs`; then the sequence plays, `sequenceMs`
 * long: he stands there, at `changeAt` he walks out through the door and comes back fully in
 * sports kit, «vamos» (later ONE real video of exactly that: its length is `sequenceMs`); then the
 * porthole shrinks along the zoom lines into the rocket's window in `shrinkMs`, and the rocket lifts
 * off exactly as it arrives. The crane (questions' path) lets go of the rocket while «vamos» plays.
 */
export const DRESS = { moveMs: 700, sequenceMs: 3200, changeAt: 700, shrinkMs: 650, cableMs: 300, jibMs: 600 } as const;

export interface PortholeTimeline {
  /** in its big place */
  moveEnd: number;
  /** he walks out to change */
  changeAt: number;
  /** the sequence is over: it shrinks into the window from here */
  shrinkAt: number;
  /** the crane pulls its cable up, and its arm into the tower (done before the shrink) */
  cableAt: number;
  jibAt: number;
  /** ignition, `igniteLeadMs` before lift-off */
  igniteAt: number;
  /** it is in the window: lift-off */
  liftAt: number;
}

/** The ending, ms from its start (see DRESS). */
export function portholeTimeline(igniteLeadMs: number, d: typeof DRESS = DRESS): PortholeTimeline {
  const moveEnd = d.moveMs;
  const shrinkAt = moveEnd + d.sequenceMs;
  const liftAt = shrinkAt + d.shrinkMs;
  const jibAt = Math.max(moveEnd, shrinkAt - d.jibMs - 50);
  const cableAt = Math.max(moveEnd, jibAt - d.cableMs);
  return { moveEnd, changeAt: moveEnd + d.changeAt, shrinkAt, cableAt, jibAt, igniteAt: Math.max(moveEnd, liftAt - igniteLeadMs), liftAt };
}

/** The steel rim round a big porthole's glass, px. */
export const BIG_RIM = 12;

/**
 * The big porthole in the free `area` (px, a box on the screen): as large as fits, never wider
 * than `maxD` (rim included), centred in it; the glass's radius `r` (the rim goes round it). Null
 * when not even a small one fits.
 */
export function bigPorthole(area: { left: number; right: number; top: number; bottom: number }, maxD: number, rim = BIG_RIM): Circle | null {
  const d = Math.floor(Math.min(maxD, area.right - area.left, area.bottom - area.top));
  if (d < 2 * rim + 40) return null;
  return { x: Math.round((area.left + area.right) / 2), y: Math.round((area.top + area.bottom) / 2), r: d / 2 - rim };
}

/**
 * When the start screen's held launch may ignite (ms, performance time): the sentence has been up
 * `readMs` by lift-off (ignition comes `igniteMs` before it), and never before the launch itself
 * gets there.
 */
export function igniteAt(sentenceShownAt: number, igniteMs: number, readMs: number = FINALE.readMs): number {
  return sentenceShownAt + Math.max(0, readMs - igniteMs);
}

// ---------------------------------------------------------------------------------------------
// The sentence of the finale

/** "a", "a y b", "a, b y c" */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

/**
 * The minutes the creator shows (the piece and the finale's sentence): the length the person chose
 * (answered, or written in the sentence), kept within what a routine may last; only when nothing
 * was chosen, the built routine's real length.
 */
export function shownMinutes(chosen: number | null | undefined, real: number, { min = 20, max = 40 }: { min?: number; max?: number } = {}): number {
  if (chosen === null || chosen === undefined || !Number.isFinite(chosen)) return real;
  return Math.min(max, Math.max(min, Math.round(chosen)));
}

/** «Hoy, pierna y glúteo. 30 min, intensidad media.» */
export function finaleSentence(focus: string, minutes: number, intensity: string): string {
  return `Hoy, ${focus}. ${minutes} min, intensidad ${intensity}.`;
}

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
import { barOnPad, baseLayout } from '@/components/workout/launchDrum';
import { padBarLayout } from '@/components/workout/padRocketShape';

// ---------------------------------------------------------------------------------------------
// The pieces, and which go on when

export type PieceId = 'nose' | 'minutes' | 'blocks' | 'engine';
/** Top to bottom: the order they are fitted in. */
export const PIECES: readonly PieceId[] = ['nose', 'minutes', 'blocks', 'engine'];

export type QuestionId = 'minutes' | 'rounds' | 'intensity';
/** The piece each question brings. */
export const PIECE_OF: Record<QuestionId, PieceId> = { minutes: 'minutes', rounds: 'blocks', intensity: 'engine' };

/** How a piece goes on: brought by the truck (an answer), or quickly (known from the sentence, or «Saltar»). */
export type FitMode = 'truck' | 'quick';

const isQuestion = (id: string): id is QuestionId => id === 'minutes' || id === 'rounds' || id === 'intensity';

/**
 * How many pieces may be on, from the top: the nose, and every piece after it that is known (the
 * sentence said it) or already answered, up to the first one still waiting for its answer.
 * `questions`: the ids asked, in order; `answered`: how many of them have been answered;
 * `skipped`: «Saltar, decide tú» (everything goes on).
 */
export function fittedTarget(questions: readonly string[], answered: number, skipped = false): number {
  if (skipped) return PIECES.length;
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
  // («Saltar» answers nothing: what was still open comes the quick way; what was answered keeps its truck)
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
/** The page above the base at full day (CSS). */
export const PAGE_DAY = 'linear-gradient(180deg, #4d9ae0 0%, #80b9ea 100%)';

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
export const PIECE_UNITS = { nozzle: 0.36, engine: 2.2, blocks: 2.4, minutes: 1.9, nose: 3.6 } as const;
/** The nose cone and its antenna with the light, in hull thicknesses. */
export const NOSE_TIP = NOSE.len + NOSE.antenna + 2 * NOSE.light;

/** A label written along a piece: as big as the rockets' labels (about half the hull), never under this. */
export const LABEL = { share: 0.5, min: 10 } as const;

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
  /** the darker strip in front, where «Cambiar» sits */
  foreTop: number;
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
  /** «Cambiar»: the top of its 44 px button */
  cambiarTop: number;
  /** how much the pieces' hulls were shortened to fit (1: not at all) */
  squeeze: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

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

  // from the bottom: «Cambiar», the strip in front, the road, the pad
  const cambiarTop = Math.round(H - safeBottom - 14 - 44);
  const foreTop = cambiarTop - 8;
  const roadH = Math.round(Math.max(20, Math.min(30, (26 * H) / 844)));
  const road = { top: foreTop - 8 - roadH, h: roadH };
  const padTop = road.top - 2;
  const horizon = Math.round(padTop - Math.max(10, 0.02 * H));

  // across: the tower on the right, the rocket just left of it
  const edge = Math.round(W * 0.067);
  const tw = Math.round(Math.max(14, Math.min(20, W * 0.046)));
  const towerX = W - edge - tw;
  const cx = r1(towerX - Math.max(12, 0.5 * T) - T / 2);

  // the rocket's length, shortened if the porthole and the crane would not fit above it
  const hulls = PIECE_UNITS.engine + PIECE_UNITS.blocks + PIECE_UNITS.minutes + PIECE_UNITS.nose;
  const fixed = (PIECE_UNITS.nozzle + NOSE_TIP) * T;
  const RIM = 11;
  const minR = 26;
  const above = 8 + 2 * (minR + RIM) + 8 + 30 * u + 14; // header gap, porthole, gap, cable and jib
  const room = padTop - header - above - fixed;
  const squeeze = Math.max(0.6, Math.min(1, room / (hulls * T)));
  const len = (units: number) => r1(units * squeeze * T);
  const hull = { engine: len(PIECE_UNITS.engine), blocks: len(PIECE_UNITS.blocks), minutes: len(PIECE_UNITS.minutes), nose: len(PIECE_UNITS.nose) };
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
  const cableLen = Math.round(26 * u);
  const jibH = Math.max(7, Math.round(10 * u));
  const jibY = Math.round(rocketTop - cableLen - jibH);
  const jibX0 = Math.round(Math.max(W * 0.42, cx - 3.2 * T));
  const tower = { x: towerX, w: tw, top: jibY - 2, bottom: foreTop + 2 };

  // the porthole: top right, between the header and the crane
  const space = jibY - 8 - (header + 6);
  const R = Math.max(minR, Math.min(Math.round(0.15 * W), Math.floor(space / 2) - RIM));
  const porthole: Circle = { x: Math.round(W - 12 - R - RIM), y: Math.round(header + 6 + RIM + R), r: R };

  // the questions' column: left of the rocket (its fins and the left mechanic), the title also left of the porthole
  const left = W >= 640 ? 32 : 20;
  const right = Math.round(cx - box / 2 - 12);
  const portholeLeft = porthole.x - R - RIM;
  const column = {
    left,
    right,
    top: header + 4,
    titleWidth: Math.max(120, Math.min(right, portholeLeft - 10) - left),
    titleMin: Math.max(0, Math.round(porthole.y + R + RIM + 10 - (header + 4))),
  };

  // the sun, climbing (the sketch's positions on its 390 × 844, against the horizon)
  const sx = W / 390;
  const suns: Circle[] = [
    [0.18, 0.006, 24],
    [0.215, 0.15, 24],
    [0.256, 0.264, 25],
    [0.246, 0.405, 26],
  ].map(([x, up, r]) => ({ x: Math.round(W * x), y: Math.round(horizon - horizon * up), r: Math.round(r * sx) }));
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

/** A piece that goes on quickly (known, or «Saltar»): it slides up into place, a clack, ms. */
export const QUICK = { riseMs: 360, boltMs: 160, gapMs: 120 } as const;

/** From the start of a piece's fitting to when the next one may start, ms. */
export function fitMs(mode: FitMode): number {
  return mode === 'truck' ? truckTimeline().endAt : QUICK.riseMs + QUICK.boltMs + QUICK.gapMs;
}

/**
 * The finale: the sentence and «Cambiar» are read for `readMs` (never before the routine is
 * built), then the take-off; the smoke covers the screen in `smokeMs`; «A ponerse como un cohete»
 * on the white for `whiteMs`; the white dissolves into the player in `veilFadeMs`. With no
 * questions (the start screen's own launch), the sentence comes `cSentenceMs` after the tap at the
 * soonest and the sky turns to day over `cSkyMs`.
 */
export const FINALE = { readMs: 3500, smokeMs: 1100, whiteMs: 1400, veilFadeMs: 600, cSentenceMs: 1300, cSkyMs: 2600 } as const;

/** The assembly scene's take-off, ms from its start. */
export const TAKEOFF = {
  portholeMs: 650,
  cableAt: 450,
  cableMs: 300,
  jibAt: 700,
  jibMs: 600,
  igniteAt: 1300,
  liftAt: 1800,
  liftMs: 1500,
} as const;

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

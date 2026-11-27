/*
 * The minutes question's tank (phone), as pure numbers: an upright white fuel tank whose red level
 * is the minutes (20 to 40, marks every 5). You drag the level anywhere on the tank: it is a bit
 * heavy (it moves half of what the finger travels) and it is drawn to each mark (a click as it
 * lands on one); let go and it settles on the nearest. The fuel is a liquid: its surface sloshes
 * with the level's speed, leaning against the way it moves, and dies down smoothly once it stops.
 * MinutesTank.tsx draws and moves it with these, frame by frame, through refs.
 */

export const TANK = {
  min: 20,
  max: 40,
  /** it sets any whole minute; the marks (and their stronger click) every `mark` */
  step: 1,
  mark: 5,
  /** the level moves this share of the finger's travel */
  drag: 0.5,
  /** within this many minutes of a whole minute the level is drawn onto it */
  magnet: 0.42,
  /** how strongly, there (0: not at all, 1: stuck on it) */
  pull: 0.6,
  /** px between the tank's ends and the 40 mark (room for the value written above the level) and the 20 mark */
  padTop: 52,
  padBottom: 22,
} as const;

/** The level's height (y, px, down) for `minutes` in a tank from `top` to `bottom`. */
export function levelY(minutes: number, top: number, bottom: number): number {
  const span = bottom - top - TANK.padTop - TANK.padBottom;
  const m = Math.max(TANK.min, Math.min(TANK.max, minutes));
  return bottom - TANK.padBottom - ((m - TANK.min) / (TANK.max - TANK.min)) * span;
}

/** Px per minute of the level, in a tank from `top` to `bottom`. */
export const pxPerMinute = (top: number, bottom: number) => (bottom - top - TANK.padTop - TANK.padBottom) / (TANK.max - TANK.min);

/** The nearest whole minute to `minutes`, within 20–40. */
export function snapMinutes(minutes: number): number {
  const m = Math.round(minutes / TANK.step) * TANK.step;
  return Math.max(TANK.min, Math.min(TANK.max, m));
}

/** A mark (20, 25, … 40): the level landing there clicks harder. */
export const isMark = (minutes: number) => Math.round(minutes) % TANK.mark === 0;

/**
 * A drag: the finger went `dy` px (down: positive) from where it pressed the tank, which then
 * showed `start` minutes: the minutes the level is at now (continuous, within 20–40), moving half
 * of the finger's travel.
 */
export function dragMinutes(start: number, dy: number, ppm: number): number {
  const m = start - (dy * TANK.drag) / Math.max(1e-6, ppm);
  return Math.max(TANK.min, Math.min(TANK.max, m));
}

/** Where the level is drawn for `minutes` mid-drag: pulled onto a whole minute when near one (it "lands" on each). */
export function magnet(minutes: number): number {
  const mark = snapMinutes(minutes);
  const d = minutes - mark;
  if (Math.abs(d) >= TANK.magnet) return minutes;
  // eased: fully pulled at the mark, letting go smoothly at the zone's edge
  const t = Math.abs(d) / TANK.magnet;
  const keep = 1 - TANK.pull * (1 - t) * (1 - t);
  return mark + d * keep;
}

/** Keys: arrows one minute up or down, Page Up and Down one mark (5), Home and End the ends. */
export function keyMinutes(minutes: number, key: string): number | null {
  const m = snapMinutes(minutes);
  if (key === 'ArrowUp' || key === 'ArrowRight') return Math.min(TANK.max, m + TANK.step);
  if (key === 'ArrowDown' || key === 'ArrowLeft') return Math.max(TANK.min, m - TANK.step);
  if (key === 'PageUp') return Math.min(TANK.max, m + TANK.mark);
  if (key === 'PageDown') return Math.max(TANK.min, m - TANK.mark);
  if (key === 'Home') return TANK.min;
  if (key === 'End') return TANK.max;
  return null;
}

// ---------------------------------------------------------------------------------------------
// The liquid: two damped waves of different length, and a lean

export const SLOSH = {
  /** amplitude, px, per px/ms of the level's speed; never more than `maxAmp` */
  gain: 9,
  maxAmp: 5,
  /** the surface leans against the movement: px of tilt (end to end, half each side) per px/ms */
  leanGain: 7,
  maxLean: 3.5,
  /** how fast the waves build up while it moves, and how long they take to die down once it stops (time constants, ms) */
  riseMs: 70,
  decayMs: 280,
  /** below this (px) the surface is flat and the loop stops */
  still: 0.12,
  /** the two waves: lengths as shares of the tank's width, and their speeds, radians per ms */
  waves: [
    { length: 1.15, speed: 0.011, share: 0.65 },
    { length: 0.55, speed: -0.017, share: 0.35 },
  ],
} as const;

export interface Slosh {
  amp: number;
  lean: number;
  /** ms of wave time (the phases move with it) */
  t: number;
}

export const STILL: Slosh = { amp: 0, lean: 0, t: 0 };

/**
 * One frame of the liquid: the level moving at `v` px per ms (down: positive), `dtMs` long. The
 * waves build up with the speed and die down (exponentially, ~1.2 s to flat) once it stops; the
 * surface leans against the movement (moving up, the liquid lags: higher behind... a tilt, small).
 */
export function sloshStep(s: Slosh, v: number, dtMs: number): Slosh {
  const dt = Math.max(0, dtMs);
  const speed = Math.abs(v);
  const wantAmp = Math.min(SLOSH.maxAmp, speed * SLOSH.gain);
  const wantLean = Math.max(-SLOSH.maxLean, Math.min(SLOSH.maxLean, -v * SLOSH.leanGain));
  const toward = (x: number, want: number) => {
    const tau = Math.abs(want) > Math.abs(x) ? SLOSH.riseMs : SLOSH.decayMs;
    return want + (x - want) * Math.exp(-dt / tau);
  };
  const amp = toward(s.amp, wantAmp);
  const lean = toward(s.lean, wantLean);
  const quiet = amp < SLOSH.still && Math.abs(lean) < SLOSH.still;
  return quiet ? { amp: 0, lean: 0, t: 0 } : { amp, lean, t: s.t + dt };
}

/** True when the liquid is at rest (nothing to draw per frame). */
export const isStill = (s: Slosh) => s.amp === 0 && s.lean === 0;

/** The surface's height at `x` across a tank from `x0` to `x1`, around the mean level `y`. */
export function surfaceY(x: number, x0: number, x1: number, y: number, s: Slosh): number {
  if (isStill(s)) return y;
  const w = Math.max(1, x1 - x0);
  const u = (x - x0) / w;
  let wave = 0;
  for (const k of SLOSH.waves) wave += k.share * Math.sin(((2 * Math.PI) / k.length) * u + k.speed * s.t);
  return y + s.lean * (u - 0.5) * 2 + s.amp * wave;
}

/**
 * The fuel's outline: the surface across the tank (`steps` segments) then down to `bottom` and
 * back: an SVG path. Flat at rest.
 */
export function fuelPath(x0: number, x1: number, y: number, bottom: number, s: Slosh, steps = 16): string {
  const pts: string[] = [];
  const n = isStill(s) ? 1 : steps;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${surfaceY(x, x0, x1, y, s).toFixed(1)}`);
  }
  return `${pts.join('')}L${x1.toFixed(1)} ${bottom.toFixed(1)}L${x0.toFixed(1)} ${bottom.toFixed(1)}Z`;
}

/** The highest any crest can reach above the mean level, px (the value's text stays above it). */
export const CREST = SLOSH.maxAmp + SLOSH.maxLean;

// ---------------------------------------------------------------------------------------------
// "It slides": the level shows it by itself on entering

/** Twice: up `rise` px and back, `ms` each; then it rests. The level's offset (up: negative) at `t` ms. */
export const HINT = { rise: 18, ms: 900, gapMs: 150, times: 2 } as const;

export function hintOffset(t: number): number {
  const one = HINT.ms + HINT.gapMs;
  if (t < 0 || t >= one * HINT.times) return 0;
  const p = (t % one) / HINT.ms;
  if (p >= 1) return 0;
  return -HINT.rise * Math.sin(Math.PI * p) ** 2;
}

/** How long the hint lasts, ms. */
export const HINT_MS = (HINT.ms + HINT.gapMs) * HINT.times;

// ---------------------------------------------------------------------------------------------
// What sits on the level: its two chevrons, and the value written above it

/** A box, px (x to the right, y down). */
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const boxesMeet = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** The chevrons (▲ above the line, ▼ under it: their tips this far from it, half this wide) and the value's type. */
export const LEVEL_MARKS = { tip: 15, foot: 9, half: 6, stroke: 2.2, numberPx: 26, unitPx: 10.5, gap: 2 } as const;
/** A line of type's box around its baseline, in ems (as the browser measures it: ascent and descent). */
const ASCENT = 0.95;
const DESCENT = 0.27;

/**
 * Around the level line (y 0, the chevrons centred at `cx`): the chevrons' boxes, and the value
 * written above them («30» ending at `cx + 10`, «min» after it), its baseline high enough to clear
 * the ▲ and any crest of the liquid. All relative to the level, px.
 */
export function levelMarks(cx: number): { baseline: number; number: Box; unit: Box; up: Box; down: Box } {
  const m = LEVEL_MARKS;
  const s = m.stroke / 2;
  const up: Box = { x0: cx - m.half - s, x1: cx + m.half + s, y0: -m.tip - s, y1: -m.foot + s };
  const down: Box = { x0: cx - m.half - s, x1: cx + m.half + s, y0: m.foot - s, y1: m.tip + s };
  // (the number's whole box, descent included, clears the ▲ and any crest)
  const baseline = -(Math.max(-up.y0, CREST) + DESCENT * m.numberPx + m.gap);
  // (two digits of a bold 26 px number at most ~0.66 em each)
  const number: Box = { x0: cx + 10 - 2 * 0.66 * m.numberPx, x1: cx + 10, y0: baseline - ASCENT * m.numberPx, y1: baseline + DESCENT * m.numberPx };
  const unit: Box = { x0: cx + 13, x1: cx + 13 + 3 * 0.62 * m.unitPx, y0: baseline - ASCENT * m.unitPx, y1: baseline + DESCENT * m.unitPx };
  return { baseline, number, unit, up, down };
}

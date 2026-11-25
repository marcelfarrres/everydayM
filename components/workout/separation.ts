import { SEPARATION } from './rocketFlight';

/*
 * The separation after a block (or after the warm-up), as poses at `t` ms of the clouds' one clock
 * (cloudClock.ts): pure, so a pause, a hidden tab or "Saltar" can never put one part ahead of
 * another. Its moments are SEPARATION (rocketFlight.ts); the scene that paints them is
 * player/Separation.tsx.
 *
 * Everything here is in the rocket's own drawing px (the scene hangs from the rocket, which in the
 * clouds stands on its tail): along the rocket `x` (tail → nose, so "down" on screen is -x), across
 * `y` (-y is the screen's left). The mechanics are counter-turned to stand upright: their `x` is
 * the screen's (negative: to the left of where they work).
 */

type Ease = (p: number) => number;
const clamp01 = (p: number) => Math.min(1, Math.max(0, p));
const lin: Ease = (p) => p;
const io: Ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);
const out: Ease = (p) => 1 - (1 - p) ** 3;
const inn: Ease = (p) => p * p;

/** A value through moments in time ([t, value, ease to the next]): held before the first and after the last. */
type Key = [t: number, v: number, ease?: Ease];
export function track(keys: Key[], t: number): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    if (t < t1) {
      const [t0, v0, ease = lin] = keys[i - 1];
      return v0 + (v1 - v0) * ease(clamp01((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1][1];
}

const S = SEPARATION;
const round = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------
// The mechanics

export interface MechanicPose {
  /** in view at all */
  shown: boolean;
  /** from its place of work (px; negative: to the left) */
  x: number;
  /** 1: facing the rocket (right); -1: turned round */
  face: 1 | -1;
  /** degrees of its parts (as in RepairCrew: arm -90 is straight out in front) */
  arm: number;
  back: number;
  head: number;
  legL: number;
  legR: number;
}

/** When each one comes in (and is in place). */
export const crewEnter = (who: 'a' | 'b') => {
  const from = S.crewInMs + (who === 'a' ? S.crewLagMs : 0);
  return { from, to: from + S.crewWalkMs };
};

/** A step every `period` ms while it walks or runs between `from` and `to` (legs and the free arm). */
function stride(t: number, from: number, to: number, period: number, amp: number) {
  if (t < from || t >= to) return 0;
  return amp * Math.sin((2 * Math.PI * (t - from)) / period);
}

/**
 * The two at `t`: `b` (the wrench) stands at the latch and undoes it; `a` (the hammer) stands by
 * the part and knocks it loose. `off`: how far to their left the screen ends (px). Reduced motion:
 * they just stand at their places for that while, without a gesture.
 */
export function crewAt(t: number, off: number, reduced = false): { a: MechanicPose; b: MechanicPose } {
  const shown = t >= S.crewInMs && t < S.crewGoneMs + 40;
  const runFrom = S.crewOutMs + 150;
  const pose = (who: 'a' | 'b'): MechanicPose => {
    const { from, to } = crewEnter(who);
    const still: MechanicPose = { shown: shown && t >= to - 1, x: 0, face: 1, arm: who === 'a' ? -55 : -95, back: 6, head: 0, legL: 0, legR: 0 };
    if (reduced) return { ...still, shown: t >= to && t < S.crewOutMs + 150 };
    // in (a little past the place and back: the brake), the hammer's lunge at the blow, then a
    // step back, a turn, and off at a run
    const lunge: Key[] =
      who === 'a'
        ? [
            [S.releaseMs - S.windupMs, 0, io],
            [S.releaseMs - 50, -3, inn],
            [S.releaseMs, 3, out],
          ]
        : [];
    const x = track(
      [
        [from, -off, io],
        [to - 110, 5, out],
        [to, 0, lin],
        ...lunge,
        [S.crewOutMs, who === 'a' ? 3 : 0, io],
        [runFrom, -9, inn],
        [S.crewGoneMs - (who === 'a' ? 60 : 0), -off],
      ],
      t,
    );
    const face: 1 | -1 = t >= runFrom - 40 ? -1 : 1;
    const walking = stride(t, from, to - 110, 280, 28);
    const running = stride(t, runFrom, S.crewGoneMs, 220, 30);
    const legL = walking + running;
    let arm: number;
    let head = 0;
    let back = 6 + stride(t, from, to - 110, 280, 22) + stride(t, runFrom, S.crewGoneMs, 220, 22);
    if (who === 'b') {
      // two turns of the wrench at the latch: out, a pull, a push in two goes, back
      const turns: Key[] = S.turnsMs.flatMap((s): Key[] => [
        [s - 90, -95, io],
        [s - 45, -104, io],
        [s, -72, out],
        [s + 70, -60, io],
        [s + 140, -95, lin],
      ]);
      arm = track([[to - 60, -20, io], [to + 80, -95, lin], ...turns, [S.crewOutMs, -95, io], [S.crewOutMs + 120, -20]], t);
      head = track(S.turnsMs.flatMap((s): Key[] => [[s - 60, 0, io], [s, 5, io], [s + 120, 0]]), t);
    } else {
      // the hammer rests forward; it winds up (and holds a moment), the blow, a bounce, back
      const r = S.releaseMs;
      arm = track(
        [
          [to - 60, -20, io],
          [to + 80, -55, lin],
          [r - S.windupMs, -55, out],
          [r - 70, -165, lin],
          [r - 25, -170, inn],
          [r, -62, out],
          [r + 50, -48, io],
          [r + 120, -55, lin],
          [S.crewOutMs + 120, -55, io],
          [S.crewOutMs + 240, -20],
        ],
        t,
      );
      head = track([[r - 70, 0, out], [r - 30, -6, out], [r + 40, 7, out], [r + 150, 0]], t);
      if (t >= r - S.windupMs && t < S.crewOutMs + 150) back = track([[r - 70, 6, out], [r - 20, -14, out], [r + 60, 10, out], [r + 150, 4]], t);
    }
    return { shown, x: round(x), face, arm: round(arm), back: round(back), head: round(head), legL: round(legL), legR: round(-legL) };
  };
  return { a: pose('a'), b: pose('b') };
}

// ---------------------------------------------------------------------------------------------
// The part

export interface PiecePose {
  shown: boolean;
  /** from where it was on the rocket (px; down the screen is -x, left is -y) */
  x: number;
  y: number;
  rot: number;
  opacity: number;
}

/**
 * The part that comes off, at `t`: unseen before the release (the rocket still draws it); then
 * it comes loose (a few px and a tilt, `creepMs`), and falls away slowly, `fall` px down the
 * screen (out of its bottom), drifting left and tumbling a little, gone by the end of `fallMs`.
 * Reduced motion: it fades where it is.
 */
export function pieceAt(t: number, fall: number, reduced = false): PiecePose {
  const p = t - S.releaseMs;
  if (p < 0 || p >= S.fallMs) return { shown: false, x: 0, y: 0, rot: 0, opacity: 0 };
  if (reduced) return { shown: true, x: 0, y: 0, rot: 0, opacity: round(1 - p / S.fallMs) };
  if (p < S.creepMs) {
    const c = out(p / S.creepMs);
    return { shown: true, x: round(-5 * c), y: round(-1.5 * c), rot: round(-2 * c), opacity: 1 };
  }
  const q = (p - S.creepMs) / (S.fallMs - S.creepMs);
  // gently faster as it goes (it drifts more than it drops)
  const d = 0.35 * q + 0.65 * q * q;
  return {
    shown: true,
    x: round(-5 - (fall - 5) * d),
    y: round(-1.5 - 14 * q),
    rot: round(-2 - 14 * q),
    opacity: round(q < 0.9 ? 1 : 1 - (q - 0.9) / 0.1),
  };
}

// ---------------------------------------------------------------------------------------------
// Smoke

export interface Puff {
  /** when it starts, how long it lives, where it drifts to (px) */
  at: number;
  life: number;
  dx: number;
  dy: number;
  /** where it is born: at the latch or at the nozzle */
  from: 'joint' | 'tail';
}

/** Puffs of the separation: two at the latch as it gives, one for each try of the engine and one as it catches. */
export const SEPARATION_PUFFS: Puff[] = [
  { at: S.releaseMs, life: 900, dx: -6, dy: -16, from: 'joint' },
  { at: S.releaseMs + 90, life: 800, dx: -10, dy: -6, from: 'joint' },
  { at: S.sputtersMs[0] + 40, life: 800, dx: -22, dy: -10, from: 'tail' },
  { at: S.sputtersMs[1] + 40, life: 800, dx: -24, dy: 8, from: 'tail' },
  { at: S.catchMs + 30, life: 700, dx: -30, dy: -4, from: 'tail' },
];

/** A puff at `t`: it swells as it drifts and fades (the warm-up cough's own shape, sputterPuffKeyframes). */
export function puffAt(puff: Puff, t: number, reduced = false): { opacity: number; x: number; y: number; scale: number } {
  const p = (t - puff.at) / puff.life;
  if (reduced || p < 0 || p >= 1) return { opacity: 0, x: 0, y: 0, scale: 0.3 };
  if (p < 0.2) {
    const q = p / 0.2;
    return { opacity: round(q), x: round(puff.dx * 0.3 * q), y: round(puff.dy * 0.3 * q), scale: round(0.3 + 0.6 * q) };
  }
  const q = (p - 0.2) / 0.8;
  return { opacity: round(1 - q), x: round(puff.dx * (0.3 + 0.7 * q)), y: round(puff.dy * (0.3 + 0.7 * q)), scale: round(0.9 + 0.6 * q) };
}

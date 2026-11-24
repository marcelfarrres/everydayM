import { TALK_LEAD_MS } from '@/lib/routine/duration';
import type { RoutineItem } from '@/types/workout';

/*
 * The one rocket of the player (phone), as timing and poses: no React, no DOM.
 *
 * On a phone the bottom widget IS the rocket. When a rest begins it takes off, the clouds close,
 * the big rocket of the clouds comes up from below and shoots off the top as they open, and the
 * rocket comes back from the left and parks again. Both are the same character, so they are never
 * on screen together: everything below is measured from the moment the clouds start (the moment
 * the rest begins) and derived from the clouds' own constants, which CloudTransition also uses.
 *
 *   0      takeoff: anticipation (pull back and compress), then it banks into the screen and climbs out
 *   1350   the widget rocket is gone
 *   1420   the big rocket starts coming up from below            (phone only)
 *   2370   the big rocket shoots off with an S-curve, shrinking   (desktop: straight up, as before)
 *   2520   the clouds open (TALK_LEAD_MS: a long rest's talks start now)
 *   3370   the big rocket is gone
 *   3450   the widget rocket comes back from the left, from the depth of the screen
 *   4220   (the clouds have gone)
 *   4750   parked (with a small squash); its content fades in; controls work again
 * Desktop keeps its bar and the clouds as they were; only the clouds' constants are shared.
 */

// ---------------------------------------------------------------------------------------------
// The clouds (CloudTransition)

const CLOSE_MS = 800;
const STAGGER_MS = 70;
const OPEN_MS = 1600;
// the rocket of the clouds shoots off this long before they open
const LIFT_LEAD_MS = 150;

export const CLOUD_TIMING = {
  closeMs: CLOSE_MS,
  staggerMs: STAGGER_MS,
  // The clouds open TALK_LEAD_MS after a rest begins: the engine sizes long rests with the same
  // constant (a talk starts as they open), so the hold is whatever is left after closing.
  holdMs: TALK_LEAD_MS - CLOSE_MS - STAGGER_MS,
  openMs: OPEN_MS,
  liftLeadMs: LIFT_LEAD_MS,
  /** When the big rocket shoots off the top: once closed, the hold minus the lead. */
  liftMs: TALK_LEAD_MS - LIFT_LEAD_MS,
} as const;

/**
 * When the screen is fully covered, when the clouds start to open, and when the layer is gone
 * again (rocket and clouds off screen), in ms after a rest begins.
 */
export const CLOUDS = {
  coveredMs: CLOSE_MS + 100,
  openingMs: TALK_LEAD_MS,
  clearMs: TALK_LEAD_MS + OPEN_MS + 100,
} as const;

// ---------------------------------------------------------------------------------------------
// The flight of the widget rocket, and the phone timing of the big one

const TAKEOFF_MS = 1350;
const BIG_EXIT_MS = 1000;

export const FLIGHT = {
  /** Seconds left in a serie when the engine lights (the flame grows each second). */
  ignitionS: 3,
  /** The whole takeoff, from the parked pose to gone. */
  takeoffMs: TAKEOFF_MS,
  /** Its first part: the rocket pulls back and compresses before it goes. */
  anticipationMs: 380,
  /** The content (hilo, name, time) fades out as it starts to fly. */
  contentOutMs: 300,
  /** An interrupted flight (a skip while it was coming back) just fades out where it is. */
  fadeMs: 250,
  /** The big rocket only starts to come up once the widget rocket has gone... */
  bigRiseStartMs: TAKEOFF_MS + 70,
  /** ...and stops a little before it shoots off. */
  bigRiseEndMs: CLOUD_TIMING.liftMs - 200,
  bigExitMs: BIG_EXIT_MS,
  /** The big rocket is off the top of the screen. */
  bigGoneMs: CLOUD_TIMING.liftMs + BIG_EXIT_MS,
  /** The widget rocket comes back only after that. */
  returnStartMs: CLOUD_TIMING.liftMs + BIG_EXIT_MS + 80,
  /** From entering at the left to parked (overshoot and ease back included). */
  returnMs: 1300,
  /** The squash as it settles, ending at the parked moment. */
  settleMs: 380,
  contentInMs: 320,
  /** The "¡pam!" when a rest ends and the serie starts (no clouds). */
  pamMs: 420,
} as const;

/** ms after the clouds start until the rocket is parked again and its controls work. */
export const PARKED_AFTER_CLOUDS_MS = FLIGHT.returnStartMs + FLIGHT.returnMs;

/** Whether the big rocket of the clouds can be seen, `ms` after the clouds started (phone). */
export function bigRocketVisibleAt(ms: number): boolean {
  return ms >= FLIGHT.bigRiseStartMs && ms < FLIGHT.bigGoneMs;
}

// ---------------------------------------------------------------------------------------------
// The state of the widget rocket: where it is at any moment is a function of this and the clock.

/**
 * `leftAt`: when it left its parked place (null: it never did; -Infinity: it was already away,
 * as when the player opens). `how`: a full takeoff, or a short fade where it was (an interrupted
 * flight). `returnAt`: when it starts coming back (null: it stays away, as at the end).
 */
export interface Flight {
  leftAt: number | null;
  how: 'takeoff' | 'fade';
  returnAt: number | null;
}

export type Phase = 'parked' | 'leaving' | 'away' | 'returning';

export const PARKED: Flight = { leftAt: null, how: 'fade', returnAt: null };

/** The player opens: the rocket arrives from the depth and parks, from the first second. */
export const arrival = (now: number): Flight => ({ leftAt: -Infinity, how: 'fade', returnAt: now });

export const leaveMs = (how: Flight['how']) => (how === 'takeoff' ? FLIGHT.takeoffMs : FLIGHT.fadeMs);

export function phaseAt(f: Flight, now: number): Phase {
  if (f.leftAt === null) return 'parked';
  if (now < f.leftAt + leaveMs(f.how)) return 'leaving';
  if (f.returnAt === null || now < f.returnAt) return 'away';
  if (now < f.returnAt + FLIGHT.returnMs) return 'returning';
  return 'parked';
}

/** When it is parked again: -Infinity if it already is for good, Infinity if it stays away. */
export function parkedFrom(f: Flight): number {
  if (f.leftAt === null) return -Infinity;
  return f.returnAt === null ? Infinity : f.returnAt + FLIGHT.returnMs;
}

/**
 * What happens to the rocket:
 *   clouds  a rest began (or the clouds play again): take off, come back once the big rocket has gone
 *   end     the routine reached its end screen: take off for good
 *   show    the rocket is needed and is away for good (the routine starts again): come back now
 */
export type FlightEvent = 'clouds' | 'end' | 'show';

export function nextFlight(f: Flight, event: FlightEvent, now: number): Flight {
  const phase = phaseAt(f, now);
  if (event === 'show') {
    if ((phase === 'away' || phase === 'leaving') && f.returnAt === null) {
      return { ...f, returnAt: Math.max(now, (f.leftAt ?? now) + leaveMs(f.how)) };
    }
    return f;
  }
  const returnAt = event === 'clouds' ? now + FLIGHT.returnStartMs : null;
  switch (phase) {
    case 'parked':
      return { leftAt: now, how: 'takeoff', returnAt };
    case 'leaving':
    case 'away':
      // already on its way out (or out): it only comes back later, or not at all
      return { ...f, returnAt };
    case 'returning':
      // it was coming back and is needed away again: it fades where it is
      return { leftAt: now, how: 'fade', returnAt };
  }
}

/** The widget rocket can be seen (parked, taking off, fading or coming back). */
export const widgetVisibleAt = (f: Flight, now: number) => phaseAt(f, now) !== 'away';

// ---------------------------------------------------------------------------------------------
// Ignition

/** A serie (or warm-up clip) whose end takes the rocket off: a rest (clouds) or the end screen comes next. */
export function launchesAfter(queue: RoutineItem[], index: number): boolean {
  const item = queue[index];
  const next = queue[index + 1];
  if (item?.kind !== 'workout' && item?.kind !== 'warmup') return false;
  return next?.kind === 'rest' || next?.kind === 'outro';
}

/** 0 until the last 3 s; then 1, 2, 3 — one step more each second (3 also at zero). */
export function ignitionLevel(timeLeft: number): 0 | 1 | 2 | 3 {
  const s = Math.ceil(timeLeft);
  if (s > FLIGHT.ignitionS) return 0;
  if (s <= 1) return 3;
  return s === 2 ? 2 : 1;
}

// ---------------------------------------------------------------------------------------------
// Poses (transforms of the rocket as a whole). Every pose uses the same list of functions, so any
// two interpolate function by function. The depth is real: `perspective()` projects the rocket,
// so a pose is written as where it APPEARS (offset from its parked place, apparent size) and the
// translateZ that gives that size is derived.

const PERSPECTIVE = 900;

export interface Pose {
  /** apparent offset from the parked place (CSS lengths) */
  x?: string;
  y?: string;
  /** apparent size: 1 = parked; smaller = further into the screen */
  s?: number;
  /** degrees: rz turns it in the screen's plane (negative = nose up), ry turns the nose away (positive) or towards you */
  rz?: number;
  ry?: number;
  /** squash and stretch of the whole widget, text included */
  sx?: number;
  sy?: number;
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);

export function pose({ x = '0px', y = '0px', s = 1, rz = 0, ry = 0, sx = 1, sy = 1 }: Pose): string {
  const z = PERSPECTIVE - PERSPECTIVE / s;
  return (
    `perspective(${PERSPECTIVE}px) translate3d(calc(${x} / ${num(s)}), calc(${y} / ${num(s)}), ${num(z)}px) ` +
    `rotateZ(${num(rz)}deg) rotateY(${num(ry)}deg) scale(${num(sx)}, ${num(sy)})`
  );
}

export const PARKED_POSE = pose({});

// (a type, not an interface, so it is assignable to the DOM's Keyframe)
export type FlightKeyframe = {
  offset: number;
  transform: string;
  opacity: number;
  easing?: string;
};

const ANTICIPATION_AT = FLIGHT.anticipationMs / FLIGHT.takeoffMs;

/** Parked → gone: pull back and compress, stretch as it launches, bank into the screen and climb out. */
export const TAKEOFF_KEYFRAMES: FlightKeyframe[] = [
  { offset: 0, transform: PARKED_POSE, opacity: 1, easing: 'cubic-bezier(0.33, 0, 0.3, 1)' },
  { offset: ANTICIPATION_AT, transform: pose({ x: '-12px', y: '3px', sx: 0.9, sy: 1.08 }), opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.6, 1)' },
  { offset: 0.42, transform: pose({ x: '10px', y: '-8px', s: 0.98, rz: -5, ry: 10, sx: 1.05, sy: 0.95 }), opacity: 1, easing: 'linear' },
  { offset: 0.62, transform: pose({ x: '14vw', y: '-20vh', s: 0.78, rz: -24, ry: 38, sx: 1.03, sy: 0.98 }), opacity: 1, easing: 'linear' },
  { offset: 0.82, transform: pose({ x: '22vw', y: '-52vh', s: 0.52, rz: -44, ry: 58 }), opacity: 1, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
  { offset: 0.94, transform: pose({ x: '25vw', y: '-80vh', s: 0.38, rz: -54, ry: 66 }), opacity: 1, easing: 'linear' },
  { offset: 1, transform: pose({ x: '26vw', y: '-100vh', s: 0.32, rz: -58, ry: 70 }), opacity: 0 },
];

export const AWAY_POSE = TAKEOFF_KEYFRAMES[TAKEOFF_KEYFRAMES.length - 1];

/** Gone → parked: from the depth at the left, growing, nose along its curve; past its place and back. */
export const RETURN_KEYFRAMES: FlightKeyframe[] = [
  { offset: 0, transform: pose({ x: '-78vw', y: '-30vh', s: 0.22, rz: 30, ry: -64 }), opacity: 0, easing: 'linear' },
  { offset: 0.08, transform: pose({ x: '-66vw', y: '-25vh', s: 0.28, rz: 27, ry: -58 }), opacity: 1, easing: 'cubic-bezier(0.25, 0.1, 0.4, 1)' },
  { offset: 0.5, transform: pose({ x: '-20vw', y: '-6vh', s: 0.74, rz: 9, ry: -24 }), opacity: 1, easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)' },
  // a little past its place (the screen's margin is 6 px) and back
  { offset: 0.76, transform: pose({ x: '7px', y: '-1px', rz: -1, ry: 3 }), opacity: 1, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
  { offset: 0.9, transform: pose({ x: '-3px', rz: 0.4 }), opacity: 1, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
  { offset: 1, transform: PARKED_POSE, opacity: 1 },
];

/**
 * Squash and stretch on a separate layer (scale only), from the bottom of the body. It mostly
 * squashes down: the rocket spans the screen, so it may only widen by 2 %.
 */
export const SETTLE_KEYFRAMES = [
  { offset: 0, transform: 'scale(1, 1)', easing: 'cubic-bezier(0.3, 0, 0.5, 1)' },
  { offset: 0.4, transform: 'scale(1.02, 0.88)', easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 0.72, transform: 'scale(0.99, 1.04)', easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 1, transform: 'scale(1, 1)' },
];

export const PAM_KEYFRAMES = [
  { offset: 0, transform: 'scale(1, 1)', easing: 'cubic-bezier(0.2, 0, 0.4, 1)' },
  { offset: 0.3, transform: 'scale(1.02, 0.86)', easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
  { offset: 0.62, transform: 'scale(0.99, 1.05)', easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 1, transform: 'scale(1, 1)' },
];

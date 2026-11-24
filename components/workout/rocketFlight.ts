import { TALK_LEAD_MS } from '@/lib/routine/duration';
import type { RoutineItem } from '@/types/workout';

/*
 * The one rocket of the player (phone), as timing and poses: no React, no DOM.
 *
 * On a phone the bottom widget IS the rocket, and it is also the rocket of the clouds: when a rest
 * begins it folds its banner in and, in one continuous move, turns its nose up, grows and goes to
 * its place in the clouds (by the words, on the rail of the routine) as they close. It waits there,
 * alive, while the words are read; then it takes off, once, straight out of the top as the clouds
 * open, and comes back from the left to park again. Everything below is measured from the moment
 * the clouds start (the moment the rest begins) and derived from the clouds' own constants, which
 * CloudTransition also uses.
 *
 *   0      the banner folds into the body (260 ms); it crouches (anticipation)...
 *   480    ...and goes to its place in the clouds: nose up, bigger      (placed at 1000, settled 1200)
 *   870    the clouds have closed; the words are in by 1200 (phone)
 *   3670   it crouches and takes off straight up                         (desktop: its own rocket, as before)
 *   3820   the clouds open (TALK_LEAD_MS: a long rest's talks start now)
 *   ~4520  it is out of the top of the screen (it fades only once out, at 4670)
 *   4920   ...after a beat, it comes back from the left, from the depth
 *   6220   parked (with a squash)
 *   6720   half a second later the banner springs out of the body: controls work again
 * Desktop keeps its bar and the clouds as they were (their hold is as long); only the clouds'
 * constants are shared.
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

/** Where the rocket stands in the clouds: its nose at this % of the screen's height, from 66 % (start) to 22 % (done). */
export const railTop = (progress: number) => 66 - Math.min(1, Math.max(0, progress)) * 44;
/** ...and across, at this share of the screen's width (from 640 px wide: 0.42). */
export const railLeft = (width: number) => (width >= 640 ? 0.42 : 0.34);

/** The words of the clouds come in by this moment on a phone (the rocket is already placed). */
export const WORDS = { phoneDelayMs: 750, fadeMs: 450 } as const;

// ---------------------------------------------------------------------------------------------
// The flight of the widget rocket

const TAKEOFF_MS = 1600;
const CLOUD_EXIT_MS = 1000;
// Between leaving the screen and coming back the screen holds a beat without the rocket.
const HANDOVER_BEAT_MS = 250;

export const FLIGHT = {
  /** Seconds left in a serie when the engine lights (the flame grows each second). */
  ignitionS: 3,
  /** The whole takeoff, from the parked pose (banner out) to gone. */
  takeoffMs: TAKEOFF_MS,
  /** Its first part: the banner folds in, and only then does the rocket move... */
  foldMs: 260,
  /** ...crouching (anticipation) until this moment, then it turns its nose up and climbs. */
  anticipationMs: 480,
  /** An interrupted flight (a skip while it was coming back) just fades out where it is. */
  fadeMs: 250,
  handoverBeatMs: HANDOVER_BEAT_MS,
  /** In the clouds: it reaches its place (a little past it)... */
  placedMs: 1000,
  /** ...settles there, and waits... */
  settledMs: 1200,
  /** ...until it takes off, once, as the clouds are about to open... */
  cloudLiftMs: CLOUD_TIMING.liftMs,
  /** ...climbing straight out of the top. */
  cloudExitMs: CLOUD_EXIT_MS,
  /** It comes back once it has gone, and a beat later. */
  returnStartMs: CLOUD_TIMING.liftMs + CLOUD_EXIT_MS + HANDOVER_BEAT_MS,
  /** From entering at the left to parked (overshoot and ease back included). */
  returnMs: 1300,
  /** The squash as it settles, ending at the parked moment. */
  settleMs: 420,
  /** The "¡pam!" when a rest ends and the serie starts (no clouds). */
  pamMs: 460,
} as const;

/** ms after the clouds start until the rocket is parked again. */
export const PARKED_AFTER_CLOUDS_MS = FLIGHT.returnStartMs + FLIGHT.returnMs;

/** Its whole way through the clouds, from parked to gone out of the top. */
export const CLOUD_LEAVE_MS = CLOUD_TIMING.liftMs + CLOUD_EXIT_MS;
/** The part of its exit after which it is out of the top of the screen. */
export const CLOUD_OFFSCREEN_AT = 0.85;

// ---------------------------------------------------------------------------------------------
// The state of the widget rocket: where it is at any moment is a function of this and the clock.

/**
 * `leftAt`: when it left its parked place (null: it never did; -Infinity: it was already away,
 * as when the player opens). `how`: through the clouds (it waits in them and takes off from there),
 * a plain takeoff (the end of the routine), or a short fade where it was (an interrupted flight).
 * `placed`: a clouds flight that starts already in its place in the clouds (they played again
 * while it waited there). `returnAt`: when it starts coming back (null: it stays away, as at the end).
 */
export interface Flight {
  leftAt: number | null;
  how: 'clouds' | 'takeoff' | 'fade';
  placed?: boolean;
  returnAt: number | null;
}

export type Phase = 'parked' | 'leaving' | 'away' | 'returning';

export const PARKED: Flight = { leftAt: null, how: 'fade', returnAt: null };

/** The player opens: the rocket arrives from the depth and parks, from the first second. */
export const arrival = (now: number): Flight => ({ leftAt: -Infinity, how: 'fade', returnAt: now });

export const leaveMs = (how: Flight['how']) => (how === 'clouds' ? CLOUD_LEAVE_MS : how === 'takeoff' ? FLIGHT.takeoffMs : FLIGHT.fadeMs);

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
 *   clouds  a rest began (or the clouds play again): go into the clouds, take off from there, come back
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
      return { leftAt: now, how: event === 'clouds' ? 'clouds' : 'takeoff', returnAt };
    case 'leaving':
      // waiting in the clouds and they play again: it waits in its place for the new ones
      if (event === 'clouds' && f.how === 'clouds' && f.leftAt !== null && now >= f.leftAt + FLIGHT.settledMs && now < f.leftAt + FLIGHT.cloudLiftMs) {
        return { leftAt: now, how: 'clouds', placed: true, returnAt };
      }
      return { ...f, returnAt };
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

/**
 * Where the widget rocket can be seen on screen. It fades only at the very end of its takeoff,
 * but it has climbed out of the top by `TAKEOFF_OFFSCREEN_AT` of it (see TAKEOFF_KEYFRAMES), or of
 * its exit from the clouds; coming back it enters at the left edge as it becomes opaque.
 */
export function widgetOnScreenAt(f: Flight, now: number): boolean {
  const phase = phaseAt(f, now);
  if (phase === 'leaving' && f.how === 'takeoff' && f.leftAt !== null) {
    return now < f.leftAt + FLIGHT.takeoffMs * TAKEOFF_OFFSCREEN_AT;
  }
  if (phase === 'leaving' && f.how === 'clouds' && f.leftAt !== null) {
    return now < f.leftAt + FLIGHT.cloudLiftMs + FLIGHT.cloudExitMs * CLOUD_OFFSCREEN_AT;
  }
  return phase !== 'away';
}

// ---------------------------------------------------------------------------------------------
// The banner (in the code, "pod"): it stands on its mast above the parked rocket. Half a second
// after the rocket has landed it springs out of the body (an elastic bounce); at the start of a
// takeoff it folds back into the body before the rocket moves.

export const POD = {
  /** After the rocket parks (its squash is done by then), a beat, and the banner springs out... */
  inDelayMs: 500,
  inMs: 560,
  /** ...and it folds back in during the takeoff's first moment. */
  outMs: FLIGHT.foldMs,
} as const;

/** When the banner is fully out again (-Infinity: it already is; Infinity: it stays in). */
export function podOutFrom(f: Flight): number {
  const parked = parkedFrom(f);
  return Number.isFinite(parked) ? parked + POD.inDelayMs + POD.inMs : parked;
}

/** The banner can be seen (all of it, or springing out, or folding in). */
export function podShownAt(f: Flight, now: number): boolean {
  const phase = phaseAt(f, now);
  if (phase === 'parked') return f.leftAt === null || now >= parkedFrom(f) + POD.inDelayMs;
  // it folds in during the first moment of a takeoff or of the way into the clouds (a fade takes it at once)
  return phase === 'leaving' && f.how !== 'fade' && !f.placed && f.leftAt !== null && now < f.leftAt + POD.outMs;
}

/**
 * The banner's own moves, as scales about the foot of its mast (inside the body). It is drawn
 * behind the rocket, so folded that small it is out of sight.
 */
export const POD_FOLDED = 'scale(0.05, 0.08)';

export function podPopKeyframes(): FlightKeyframe[] {
  return [
    { offset: 0, transform: POD_FOLDED, opacity: 0, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    { offset: 0.1, transform: 'scale(0.22, 0.3)', opacity: 1, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    // ¡boing!: past its size, back under it, and settles
    { offset: 0.46, transform: 'scale(1.07, 1.12)', opacity: 1, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
    { offset: 0.68, transform: 'scale(0.96, 0.93)', opacity: 1, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
    { offset: 0.85, transform: 'scale(1.015, 1.025)', opacity: 1, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
    { offset: 1, transform: 'scale(1, 1)', opacity: 1 },
  ];
}

export function podRetractKeyframes(): FlightKeyframe[] {
  return [
    { offset: 0, transform: 'scale(1, 1)', opacity: 1, easing: 'cubic-bezier(0.3, 0, 0.5, 1)' },
    { offset: 0.25, transform: 'scale(1.04, 0.92)', opacity: 1, easing: 'cubic-bezier(0.6, 0, 0.9, 0.5)' },
    { offset: 0.88, transform: 'scale(0.1, 0.14)', opacity: 1, easing: 'linear' },
    { offset: 1, transform: POD_FOLDED, opacity: 0 },
  ];
}

/** A little bump of the banner when what it holds changes in place (the end of a rest). */
export const POD_BUMP_KEYFRAMES: FlightKeyframe[] = [
  { offset: 0, transform: 'scale(0.96, 0.9)', opacity: 1, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
  { offset: 0.55, transform: 'scale(1.025, 1.04)', opacity: 1, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 1, transform: 'scale(1, 1)', opacity: 1 },
];

// ---------------------------------------------------------------------------------------------
// Controls: they work only once the rocket is parked and its banner is coming out (the widget is
// `inert` otherwise): until then there is nothing to press.

/** Its controls can be pressed. */
export function controlsLiveAt(f: Flight, now: number): boolean {
  if (phaseAt(f, now) !== 'parked') return false;
  return f.leftAt === null || now >= parkedFrom(f) + POD.inDelayMs;
}

/** When its controls change from dead to live next (null: they are live, or never will be). */
export function controlsLiveFrom(f: Flight, now: number): number | null {
  const parked = parkedFrom(f);
  if (!Number.isFinite(parked)) return null;
  const at = parked + POD.inDelayMs;
  return at > now ? at : null;
}

// ---------------------------------------------------------------------------------------------
// Small moves of the rocket in its place, as numbers (the tests check them against the drawing)
// and as transforms: translate (px), rotate (deg, negative = nose up), scale.

export interface Nudge {
  x?: number;
  y?: number;
  rz?: number;
  sx?: number;
  sy?: number;
}

const num = (n: number) => String(Math.round(n * 1000) / 1000);

export const nudge = ({ x = 0, y = 0, rz = 0, sx = 1, sy = 1 }: Nudge) =>
  `translate(${num(x)}px, ${num(y)}px) rotate(${num(rz)}deg) scale(${num(sx)}, ${num(sy)})`;

type NudgeKey = Nudge & { offset: number; easing?: string };
const toKeyframes = (keys: NudgeKey[]) => keys.map(({ offset, easing, ...n }) => ({ offset, transform: nudge(n), ...(easing ? { easing } : {}) }));

// ---------------------------------------------------------------------------------------------
// Warm-up: between one warm-up clip and the next the rocket tries to take off and can't. The
// engine coughs, a crouch, a hop with its nose up and a shake, and it drops back where it was
// (about a second, no clouds). It is not a flight: the rocket never leaves its place, the banner
// stays put and its controls keep working.

export const SPUTTER = {
  ms: 1050,
} as const;

/** It sputters when one warm-up clip gives way to another, and only while it is parked. */
export function sputtersBetween(prev: RoutineItem | undefined, next: RoutineItem | undefined): boolean {
  return prev?.kind === 'warmup' && next?.kind === 'warmup' && prev !== next;
}

/** The rocket (squash layer, about the middle of its belly): crouch, hop nose up, shake, drop. */
export const SPUTTER_NUDGES: NudgeKey[] = [
  { offset: 0, easing: 'cubic-bezier(0.3, 0, 0.5, 1)' },
  { offset: 0.14, x: -5, sx: 1.04, sy: 0.84, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
  { offset: 0.28, x: 3, y: -4, rz: -2.5, sx: 0.98, sy: 1.08, easing: 'linear' },
  { offset: 0.34, x: -2, y: -3.5, rz: -1.4, sx: 0.99, sy: 1.05, easing: 'linear' },
  { offset: 0.4, x: 2, y: -4, rz: -2.2, sx: 0.99, sy: 1.05, easing: 'linear' },
  { offset: 0.46, x: -1.5, y: -3, rz: -1, sx: 1, sy: 1.03, easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
  { offset: 0.6, sx: 1.05, sy: 0.82, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
  { offset: 0.76, y: -1, rz: 0.6, sx: 0.99, sy: 1.04, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 0.9, rz: -0.2, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 1 },
];
export const SPUTTER_KEYFRAMES = toKeyframes(SPUTTER_NUDGES);

/** The flame coughs: two bursts that die, from the nozzle. */
export const SPUTTER_FLAME_KEYFRAMES = [
  { offset: 0, opacity: 0, transform: 'scale(0.1, 0.5)' },
  { offset: 0.12, opacity: 1, transform: 'scale(0.5, 0.95)' },
  { offset: 0.2, opacity: 0.2, transform: 'scale(0.15, 0.6)' },
  { offset: 0.28, opacity: 1, transform: 'scale(0.7, 1.05)' },
  { offset: 0.44, opacity: 0.85, transform: 'scale(0.38, 0.85)' },
  { offset: 0.56, opacity: 0, transform: 'scale(0.06, 0.5)' },
  { offset: 1, opacity: 0, transform: 'scale(0.06, 0.5)' },
];

/** A puff of gas from the nozzle (`dx`, `dy`: where it drifts to, px). */
export function sputterPuffKeyframes(dx: number, dy: number) {
  return [
    { offset: 0, opacity: 0, transform: 'translate(0px, 0px) scale(0.3)' },
    { offset: 0.2, opacity: 1, transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) scale(0.9)` },
    { offset: 1, opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(1.5)` },
  ];
}

// ---------------------------------------------------------------------------------------------
// Rest: the rocket fills with water, so it gets heavy. It sinks and its tail goes down (nose up),
// turning about the foot of the mast, until by the end the tail dips off the bottom of the screen;
// meanwhile it bobs (a loop in CSS) and the water stays level. When the rest ends ("¡pam!") the
// water is gone at once and it springs back upright, past it and back. The banner does not move:
// it is where the finger is ("Saltar").

export const SINK = {
  /** px down at full water */
  maxPx: 10,
  /** degrees at full water (negative: nose up) */
  maxTilt: -6,
  /** the spring back when the rest ends */
  springMs: 560,
} as const;

export interface Sink {
  y: number;
  rz: number;
}

export const UPRIGHT: Sink = { y: 0, rz: 0 };

/** How far it has sunk with the rest `level` full (0..1): slowly at first, heavier as it fills. */
export function sinkAt(level: number): Sink {
  const l = Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
  const e = l * l * (3 - 2 * l) * 0.6 + l * 0.4; // a smoothstep, kept moving from the start
  if (e === 0) return UPRIGHT;
  return { y: Math.round(SINK.maxPx * e * 100) / 100, rz: Math.round(SINK.maxTilt * e * 1000) / 1000 };
}

export const sinkTransform = (s: Sink) => `translateY(${num(s.y)}px) rotate(${num(s.rz)}deg)`;

/** The bob's two extremes, about the same pivot (the loop itself is `.rw-bob` in globals.css). */
export const BOB: Sink[] = [
  { y: 2, rz: 1.4 },
  { y: -1, rz: -1 },
];

/** The spring back's overshoot (up, nose down) and its swing back, after where it had sunk. */
export const SPRING_NUDGES: (Sink & { offset: number })[] = [
  { offset: 0.34, y: -4, rz: 0.9 },
  { offset: 0.62, y: 2, rz: -0.6 },
  { offset: 0.82, y: -0.6, rz: 0.2 },
];

/** From where it had sunk to upright, past it (up) and back: the "¡pam!". */
export function springBackKeyframes(from: Sink) {
  return [
    { offset: 0, transform: sinkTransform(from), easing: 'cubic-bezier(0.15, 0.85, 0.3, 1)' },
    ...SPRING_NUDGES.map(({ offset, ...s }) => ({ offset, transform: sinkTransform(s), easing: 'cubic-bezier(0.4, 0, 0.4, 1)' })),
    { offset: 1, transform: sinkTransform(UPRIGHT) },
  ];
}

/** The rocket lands hard (squash layer, from its belly): a deep squash, a stretch, and settles. */
export const PAM_NUDGES: NudgeKey[] = [
  { offset: 0, easing: 'cubic-bezier(0.2, 0, 0.4, 1)' },
  { offset: 0.26, sx: 1.05, sy: 0.7, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
  { offset: 0.56, sx: 0.98, sy: 1.04, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 0.8, sx: 1.01, sy: 0.98, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 1 },
];
export const PAM_KEYFRAMES = toKeyframes(PAM_NUDGES);

/** Landing from the flight: a squash as it settles. */
export const SETTLE_KEYFRAMES = toKeyframes([
  { offset: 0, easing: 'cubic-bezier(0.3, 0, 0.5, 1)' },
  { offset: 0.4, sx: 1.03, sy: 0.8, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 0.72, sx: 0.99, sy: 1.04, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 1 },
]);

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

/** How hard it shakes at each step of the ignition: the rocket (px), the banner's text (px), and how fast (s). */
export const SHAKE = {
  rocket: [0, 1.6, 3, 4.6],
  text: [0, 0.7, 1.3, 2],
  period: [0.18, 0.15, 0.12, 0.09],
} as const;

// ---------------------------------------------------------------------------------------------
// Poses (transforms of the rocket as a whole, about its middle). Every pose uses the same list of
// functions, so any two interpolate function by function. The depth is real: `perspective()`
// projects the rocket, so a pose is written as where it APPEARS (offset from its parked place,
// apparent size) and the translateZ that gives that size is derived.

const PERSPECTIVE = 900;

export interface Pose {
  /** apparent offset from the parked place (CSS lengths; an expression like "-100vh - 400px" too) */
  x?: string;
  y?: string;
  /** apparent size: 1 = parked; smaller = further into the screen */
  s?: number;
  /** degrees: rz turns it in the screen's plane (negative = nose up), ry turns the nose away (positive) or towards you */
  rz?: number;
  ry?: number;
  /** squash and stretch along (sx) and across (sy) the rocket */
  sx?: number;
  sy?: number;
}

export function pose({ x = '0px', y = '0px', s = 1, rz = 0, ry = 0, sx = 1, sy = 1 }: Pose): string {
  const z = PERSPECTIVE - PERSPECTIVE / s;
  return (
    `perspective(${PERSPECTIVE}px) translate3d(calc((${x}) / ${num(s)}), calc((${y}) / ${num(s)}), ${num(z)}px) ` +
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

export const FOLD_AT = FLIGHT.foldMs / FLIGHT.takeoffMs;
export const ANTICIPATION_AT = FLIGHT.anticipationMs / FLIGHT.takeoffMs;
/** When the nose points straight up. */
export const UPRIGHT_AT = 0.56;
/** The part of the takeoff after which the rocket is out of the top of the screen. */
export const TAKEOFF_OFFSCREEN_AT = 0.92;

/**
 * Parked → gone. Still while the banner folds in; a crouch (nose down a little, squashed); it
 * turns its nose straight up as it lifts; and it climbs straight out of the top of the screen,
 * stretched, never smaller and never fading on screen. (Its middle is parked about 35 px above
 * the bottom; "100vh + 400px" up takes even a tablet's rocket and its flame out of the top.)
 */
const TAKEOFF_POSES: { offset: number; pose: Pose; opacity: number; easing?: string }[] = [
  { offset: 0, pose: {}, opacity: 1, easing: 'linear' },
  { offset: FOLD_AT, pose: {}, opacity: 1, easing: 'cubic-bezier(0.33, 0, 0.3, 1)' },
  { offset: ANTICIPATION_AT, pose: { x: '-6px', y: '4px', rz: 4, sx: 0.9, sy: 1.16 }, opacity: 1, easing: 'cubic-bezier(0.45, 0, 0.4, 1)' },
  { offset: UPRIGHT_AT, pose: { y: '-150px', rz: -90, sx: 1.05, sy: 0.95 }, opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.85, 0.5)' },
  { offset: 0.74, pose: { y: '-35vh - 160px', rz: -90, sx: 1.1, sy: 0.9 }, opacity: 1, easing: 'linear' },
  { offset: TAKEOFF_OFFSCREEN_AT, pose: { y: '-100vh - 400px', rz: -90, sx: 1.1, sy: 0.9 }, opacity: 1, easing: 'linear' },
  { offset: 1, pose: { y: '-100vh - 560px', rz: -90, sx: 1.1, sy: 0.9 }, opacity: 0 },
];

export const TAKEOFF_KEYFRAMES: FlightKeyframe[] = TAKEOFF_POSES.map(({ pose: p, ...k }) => ({ ...k, transform: pose(p) }));

/**
 * The same takeoff for a rocket with nothing to fold (the routine creator's): it starts with the
 * crouch, from a rocket tilted `tilt` degrees (negative: nose up), and climbs out of the top the
 * same way. Play it as fast as the moment needs: its shape doesn't change.
 */
export function launchKeyframes(tilt = 0): FlightKeyframe[] {
  const span = 1 - FOLD_AT;
  return TAKEOFF_POSES.filter((k) => k.offset >= FOLD_AT).map(({ pose: p, offset, ...k }) => ({
    ...k,
    offset: Math.round(((offset - FOLD_AT) / span) * 1000) / 1000,
    transform: pose({ ...p, rz: (p.rz ?? 0) + (offset < UPRIGHT_AT ? tilt : 0) }),
  }));
}

/** The routine creator's rocket comes (back) up from below the screen into its place, tilted `tilt` degrees. */
export function riseKeyframes(tilt = 0) {
  return [
    { offset: 0, transform: `translateY(70vh) rotate(${num(tilt - 8)}deg)`, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
    { offset: 0.72, transform: `translateY(-8px) rotate(${num(tilt + 1.5)}deg)`, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
    { offset: 1, transform: `translateY(0px) rotate(${num(tilt)}deg)` },
  ];
}

/** The routine creator's hops: one rocket leaves (LAUNCH) and the next comes up (RISE) once it is out of sight. */
export const HOP = {
  /** sending the sentence, and "Empezar": the full climb */
  launchMs: TAKEOFF_MS - FLIGHT.foldMs,
  /** from one question to the next: the same climb, faster (the tap has already acted) */
  hopMs: 480,
  riseMs: 300,
} as const;

/** The part of `launchKeyframes` after which the rocket is out of the top of the screen. */
export const LAUNCH_OFFSCREEN_AT = (TAKEOFF_OFFSCREEN_AT - FOLD_AT) / (1 - FOLD_AT);

export const AWAY_POSE = TAKEOFF_KEYFRAMES[TAKEOFF_KEYFRAMES.length - 1];

/** Gone → parked: from the depth at the left, growing, nose along its curve; past its place and back. */
export const RETURN_KEYFRAMES: FlightKeyframe[] = [
  // (it shows at the left edge right away: the beat after the big rocket is the time it waited)
  { offset: 0, transform: pose({ x: '-64vw', y: '-30vh', s: 0.22, rz: 30, ry: -64 }), opacity: 0, easing: 'linear' },
  { offset: 0.08, transform: pose({ x: '-52vw', y: '-25vh', s: 0.28, rz: 27, ry: -58 }), opacity: 1, easing: 'cubic-bezier(0.25, 0.1, 0.4, 1)' },
  { offset: 0.5, transform: pose({ x: '-20vw', y: '-6vh', s: 0.74, rz: 9, ry: -24 }), opacity: 1, easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)' },
  // a little past its place and back
  { offset: 0.76, transform: pose({ x: '9px', y: '-2px', rz: -1.5, ry: 3 }), opacity: 1, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
  { offset: 0.9, transform: pose({ x: '-3px', rz: 0.5 }), opacity: 1, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
  { offset: 1, transform: PARKED_POSE, opacity: 1 },
];
// ---------------------------------------------------------------------------------------------
// Through the clouds (phone): the widget rocket is the rocket of the clouds.

/** Where its place in the clouds is, from its parked place: px across and down, and its size there. */
export interface CloudSpot {
  dx: number;
  dy: number;
  k: number;
}

/**
 * Parked → its place in the clouds → gone, over CLOUD_LEAVE_MS. Still while the banner folds in; a
 * crouch; then one continuous move (nose up, growing, to its place, a little past it and back);
 * it waits there (the bob of the rest keeps it alive) until it crouches and takes off straight up,
 * once, out of the top. `placed`: it is in its place already (the clouds played again).
 */
export function cloudKeyframes({ dx, dy, k }: CloudSpot, placed = false): FlightKeyframe[] {
  const at = (ms: number) => Math.round((ms / CLOUD_LEAVE_MS) * 10000) / 10000;
  const lift = FLIGHT.cloudLiftMs;
  const there = (y = 0, sx = 1, sy = 1) => pose({ x: `${num(dx)}px`, y: `${num(dy + y)}px`, rz: -90, sx: k * sx, sy: k * sy });
  const up = (px: number) => pose({ x: `${num(dx)}px`, y: `${num(dy)}px - 100vh - ${px}px`, rz: -90, sx: k * 1.06, sy: k * 0.94 });
  const away: FlightKeyframe[] = [
    { offset: at(lift - 180), transform: there(), opacity: 1, easing: 'cubic-bezier(0.3, 0, 0.5, 1)' },
    // a crouch before it goes (squashed along its length)
    { offset: at(lift), transform: there(6, 0.93, 1.06), opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.75, 0.6)' },
    { offset: at(lift + FLIGHT.cloudExitMs * CLOUD_OFFSCREEN_AT), transform: up(400), opacity: 1, easing: 'linear' },
    { offset: 1, transform: up(600), opacity: 0 },
  ];
  if (placed) return [{ offset: 0, transform: there(), opacity: 1, easing: 'linear' }, ...away];
  return [
    { offset: 0, transform: PARKED_POSE, opacity: 1, easing: 'linear' },
    { offset: at(FLIGHT.foldMs), transform: PARKED_POSE, opacity: 1, easing: 'cubic-bezier(0.33, 0, 0.3, 1)' },
    { offset: at(FLIGHT.anticipationMs), transform: pose({ x: '-6px', y: '4px', rz: 4, sx: 0.9, sy: 1.16 }), opacity: 1, easing: 'cubic-bezier(0.45, 0, 0.2, 1)' },
    { offset: at(FLIGHT.placedMs), transform: there(-8, 1.03, 1.03), opacity: 1, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
    { offset: at(FLIGHT.settledMs), transform: there(), opacity: 1, easing: 'linear' },
    ...away,
  ];
}

/** Its flame on that way: lit as it goes, burning low while it waits, full as it takes off. */
export function cloudFlameKeyframes(placed = false) {
  const at = (ms: number) => Math.round((ms / CLOUD_LEAVE_MS) * 10000) / 10000;
  const lift = FLIGHT.cloudLiftMs;
  const tail = [
    { offset: at(lift - 180), opacity: 1, transform: 'scale(0.7, 0.9)' },
    { offset: at(lift), opacity: 1, transform: 'scale(1, 1)' },
    { offset: 1, opacity: 1, transform: 'scale(1.35, 1.08)' },
  ];
  if (placed) return [{ offset: 0, opacity: 1, transform: 'scale(0.7, 0.9)' }, ...tail];
  return [
    { offset: 0, opacity: 0, transform: 'scale(0.3, 0.7)' },
    { offset: at(FLIGHT.foldMs), opacity: 1, transform: 'scale(0.45, 0.85)' },
    { offset: at(FLIGHT.placedMs), opacity: 1, transform: 'scale(1, 1)' },
    { offset: at(FLIGHT.settledMs + 300), opacity: 1, transform: 'scale(0.7, 0.9)' },
    ...tail,
  ];
}

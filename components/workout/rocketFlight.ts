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
 *   0      takeoff: its control pod retracts into its belly while it pulls back and compresses
 *          (anticipation), then it banks into the screen and climbs out of the top
 *   ~1220  the widget rocket has left the screen (it fades only once out, at 1350)
 *   1350   ...a beat of clouds alone...
 *   1650   the big rocket starts coming up from below            (phone only)
 *   2370   the big rocket shoots off with an S-curve, shrinking   (desktop: straight up, as before)
 *   2520   the clouds open (TALK_LEAD_MS: a long rest's talks start now)
 *   3370   the big rocket is gone
 *   3670   ...after the same beat, the widget rocket comes back from the left, from the depth
 *   4220   (the clouds have gone)
 *   4970   parked (with a small squash); its content fades in; controls work again
 *   5060   the control pod pops out from under it
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
// Between one rocket leaving and the other arriving, the screen holds a beat with neither: read
// as one rocket that went and came back, not as two.
const HANDOVER_BEAT_MS = 300;

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
  handoverBeatMs: HANDOVER_BEAT_MS,
  /** The big rocket only starts to come up once the widget rocket has gone, and a beat later... */
  bigRiseStartMs: TAKEOFF_MS + HANDOVER_BEAT_MS,
  /** ...and stops a little before it shoots off. */
  bigRiseEndMs: CLOUD_TIMING.liftMs - 120,
  bigExitMs: BIG_EXIT_MS,
  /** The big rocket is off the top of the screen. */
  bigGoneMs: CLOUD_TIMING.liftMs + BIG_EXIT_MS,
  /** The widget rocket comes back only after that, and the same beat. */
  returnStartMs: CLOUD_TIMING.liftMs + BIG_EXIT_MS + HANDOVER_BEAT_MS,
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

/**
 * Where the widget rocket can be seen on screen. It fades only at the very end of its takeoff,
 * but it has climbed out of the top by `TAKEOFF_OFFSCREEN_AT` of it (see TAKEOFF_KEYFRAMES), and
 * coming back it enters at the left edge as it becomes opaque.
 */
export function widgetOnScreenAt(f: Flight, now: number): boolean {
  const phase = phaseAt(f, now);
  if (phase === 'leaving' && f.how === 'takeoff' && f.leftAt !== null) {
    return now < f.leftAt + FLIGHT.takeoffMs * TAKEOFF_OFFSCREEN_AT;
  }
  return phase !== 'away';
}

// ---------------------------------------------------------------------------------------------
// Controls: they work only while the rocket is parked (the widget is `inert` otherwise).

/** Its controls can be pressed. */
export const controlsLiveAt = (f: Flight, now: number) => phaseAt(f, now) === 'parked';

/** When its controls change from dead to live next (null: they are live, or never will be). */
export function controlsLiveFrom(f: Flight, now: number): number | null {
  const at = parkedFrom(f);
  return at > now && Number.isFinite(at) ? at : null;
}

// ---------------------------------------------------------------------------------------------
// The control pod: it hangs under the rocket's belly while it is parked. It pops out (a quick,
// springy drop, "like a projector") once the rocket has settled, and goes back in as the
// takeoff's anticipation starts.

export const POD = {
  /** After the rocket parks (its squash is done by then), the pod pops out... */
  inDelayMs: 90,
  inMs: 420,
  /** ...and it goes back into the belly within the takeoff's anticipation. */
  outMs: 200,
} as const;

/** When the pod is fully out again (-Infinity: it already is; Infinity: it stays in). */
export function podOutFrom(f: Flight): number {
  const parked = parkedFrom(f);
  return Number.isFinite(parked) ? parked + POD.inDelayMs + POD.inMs : parked;
}

/** The pod can be seen (all of it, or popping out, or going in). */
export function podShownAt(f: Flight, now: number): boolean {
  const phase = phaseAt(f, now);
  if (phase === 'parked') return f.leftAt === null || now >= parkedFrom(f) + POD.inDelayMs;
  // it goes in during the first moment of a takeoff (a fade takes it at once)
  return phase === 'leaving' && f.how === 'takeoff' && f.leftAt !== null && now < f.leftAt + POD.outMs;
}

/**
 * The pod's own moves, as transforms from where it hangs (translateY in px: negative is up, into
 * the belly; it is drawn behind the body, so `hidden` px up it is out of sight).
 */
export function podPopKeyframes(hidden: number): FlightKeyframe[] {
  return [
    { offset: 0, transform: `translateY(${-hidden}px) scale(0.94, 1)`, opacity: 0, easing: 'cubic-bezier(0.3, 0, 0.6, 1)' },
    { offset: 0.12, transform: `translateY(${-hidden * 0.8}px) scale(0.95, 1)`, opacity: 1, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
    { offset: 0.5, transform: 'translateY(4px) scale(1.04, 0.93)', opacity: 1, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
    { offset: 0.76, transform: 'translateY(-2px) scale(0.99, 1.03)', opacity: 1, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
    { offset: 1, transform: 'translateY(0px) scale(1, 1)', opacity: 1 },
  ];
}

export function podRetractKeyframes(hidden: number): FlightKeyframe[] {
  return [
    { offset: 0, transform: 'translateY(0px) scale(1, 1)', opacity: 1, easing: 'cubic-bezier(0.3, 0, 0.5, 1)' },
    { offset: 0.3, transform: 'translateY(2px) scale(1.03, 0.95)', opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' },
    { offset: 0.9, transform: `translateY(${-hidden * 0.92}px) scale(0.95, 1)`, opacity: 1, easing: 'linear' },
    { offset: 1, transform: `translateY(${-hidden}px) scale(0.94, 1)`, opacity: 0 },
  ];
}

/** A little bump of the pod when what it holds changes in place (the end of a rest: "Saltar" becomes the three buttons). */
export const POD_BUMP_KEYFRAMES: FlightKeyframe[] = [
  { offset: 0, transform: 'translateY(-6px) scale(0.96, 0.9)', opacity: 1, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
  { offset: 0.55, transform: 'translateY(3px) scale(1.03, 0.96)', opacity: 1, easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 1, transform: 'translateY(0px) scale(1, 1)', opacity: 1 },
];

// ---------------------------------------------------------------------------------------------
// Warm-up: between one warm-up clip and the next the rocket tries to take off and can't. A
// sputter of the engine, a hop with a shake, and it settles back where it was (about a second,
// no clouds). It is not a flight: the rocket never leaves its place and its controls keep working.

export const SPUTTER = {
  ms: 1000,
} as const;

/** It sputters when one warm-up clip gives way to another, and only while it is parked. */
export function sputtersBetween(prev: RoutineItem | undefined, next: RoutineItem | undefined): boolean {
  return prev?.kind === 'warmup' && next?.kind === 'warmup' && prev !== next;
}

/** The whole rocket (squash layer, from the bottom of its body): anticipation, hop, shake, land. */
export const SPUTTER_KEYFRAMES = [
  { offset: 0, transform: 'translate(0px, 0px) scale(1, 1)', easing: 'cubic-bezier(0.3, 0, 0.5, 1)' },
  { offset: 0.16, transform: 'translate(-3px, 0px) scale(1.02, 0.9)', easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
  { offset: 0.3, transform: 'translate(2px, -6px) scale(0.99, 1.05)', easing: 'linear' },
  { offset: 0.37, transform: 'translate(-1.5px, -5px) scale(0.99, 1.04)', easing: 'linear' },
  { offset: 0.44, transform: 'translate(1.5px, -5.5px) scale(0.99, 1.04)', easing: 'linear' },
  { offset: 0.51, transform: 'translate(-1px, -4px) scale(1, 1.02)', easing: 'cubic-bezier(0.5, 0, 0.9, 0.5)' },
  { offset: 0.66, transform: 'translate(0px, 0px) scale(1.02, 0.91)', easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
  { offset: 0.82, transform: 'translate(0px, -1px) scale(0.995, 1.02)', easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 1, transform: 'translate(0px, 0px) scale(1, 1)' },
];

/** The flame coughs: two short bursts that die, from the nozzle. */
export const SPUTTER_FLAME_KEYFRAMES = [
  { offset: 0, opacity: 0, transform: 'scale(0.1, 0.5)' },
  { offset: 0.14, opacity: 1, transform: 'scale(0.32, 0.85)' },
  { offset: 0.22, opacity: 0.2, transform: 'scale(0.12, 0.6)' },
  { offset: 0.3, opacity: 1, transform: 'scale(0.42, 0.95)' },
  { offset: 0.46, opacity: 0.85, transform: 'scale(0.26, 0.8)' },
  { offset: 0.56, opacity: 0, transform: 'scale(0.06, 0.5)' },
  { offset: 1, opacity: 0, transform: 'scale(0.06, 0.5)' },
];

/** A puff of gas from the nozzle (`dx`, `dy`: where it drifts to, px). */
export function sputterPuffKeyframes(dx: number, dy: number) {
  return [
    { offset: 0, opacity: 0, transform: 'translate(0px, 0px) scale(0.3)' },
    { offset: 0.2, opacity: 1, transform: `translate(${dx * 0.3}px, ${dy * 0.3}px) scale(0.8)` },
    { offset: 1, opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(1.3)` },
  ];
}

// ---------------------------------------------------------------------------------------------
// Rest: the rocket fills with water, so it gets heavy. It sinks a little and its tail goes down
// (nose up) as the water rises; when the rest ends ("¡pam!") the water is gone at once and it
// springs back upright. The pod does not move: it is where the finger is ("Saltar").

export const SINK = {
  /** px down at full water: less than the gap between the belly and the pod (rocketShape POD.GAP) */
  maxPx: 7,
  /** degrees at full water (negative: nose up) */
  maxTilt: -2,
  /** the spring back when the rest ends */
  springMs: 520,
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

/** From where it had sunk to upright, past it (up) and back: the "¡pam!". */
export function springBackKeyframes(from: Sink) {
  return [
    { offset: 0, transform: sinkTransform(from), easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
    { offset: 0.38, transform: sinkTransform({ y: -4, rz: 0.6 }), easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
    { offset: 0.7, transform: sinkTransform({ y: 1.2, rz: -0.2 }), easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
    { offset: 1, transform: sinkTransform(UPRIGHT) },
  ];
}

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
/** The part of the takeoff after which the rocket is out of the top of the screen. */
export const TAKEOFF_OFFSCREEN_AT = 0.9;

/** Parked → gone: pull back and compress, stretch as it launches, bank into the screen and climb out. */
export const TAKEOFF_KEYFRAMES: FlightKeyframe[] = [
  { offset: 0, transform: PARKED_POSE, opacity: 1, easing: 'cubic-bezier(0.33, 0, 0.3, 1)' },
  { offset: ANTICIPATION_AT, transform: pose({ x: '-12px', y: '3px', sx: 0.9, sy: 1.08 }), opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.6, 1)' },
  { offset: 0.42, transform: pose({ x: '10px', y: '-8px', s: 0.98, rz: -5, ry: 10, sx: 1.05, sy: 0.95 }), opacity: 1, easing: 'linear' },
  { offset: 0.62, transform: pose({ x: '14vw', y: '-20vh', s: 0.78, rz: -24, ry: 38, sx: 1.03, sy: 0.98 }), opacity: 1, easing: 'linear' },
  { offset: 0.8, transform: pose({ x: '21vw', y: '-55vh', s: 0.54, rz: -42, ry: 56 }), opacity: 1, easing: 'cubic-bezier(0.4, 0, 1, 1)' },
  // out of the top: the middle of the rocket is a whole screen up (more than its own reach)
  { offset: TAKEOFF_OFFSCREEN_AT, transform: pose({ x: '25vw', y: '-100vh', s: 0.4, rz: -53, ry: 65 }), opacity: 1, easing: 'linear' },
  { offset: 1, transform: pose({ x: '27vw', y: '-135vh', s: 0.32, rz: -58, ry: 70 }), opacity: 0 },
];

export const AWAY_POSE = TAKEOFF_KEYFRAMES[TAKEOFF_KEYFRAMES.length - 1];

/** Gone → parked: from the depth at the left, growing, nose along its curve; past its place and back. */
export const RETURN_KEYFRAMES: FlightKeyframe[] = [
  // (it shows at the left edge right away: the beat after the big rocket is the time it waited)
  { offset: 0, transform: pose({ x: '-64vw', y: '-30vh', s: 0.22, rz: 30, ry: -64 }), opacity: 0, easing: 'linear' },
  { offset: 0.08, transform: pose({ x: '-52vw', y: '-25vh', s: 0.28, rz: 27, ry: -58 }), opacity: 1, easing: 'cubic-bezier(0.25, 0.1, 0.4, 1)' },
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

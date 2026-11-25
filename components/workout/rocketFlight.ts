import { BLOCK_END_EXTRA_MS, TALK_LEAD_MS } from '@/lib/routine/duration';
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
 *   -1000  (the serie's last second: the banner folds in, then it crouches towards its tail)
 *   0      it shoots off to the RIGHT, where its nose points, out of the screen (380 ms)
 *   380    a pause out of sight while the clouds close (870)
 *   1000   it comes up from below, standing, nose up, bigger, fast, and brakes...
 *   1700   ...into a slow, visible rise by the words (the slow-motion shot; a part comes off at 1800)
 *   3220   it speeds up again and goes out of the top                    (desktop: its own rocket, as before)
 *   3370   the clouds open (TALK_LEAD_MS: a long rest's talks start now)
 *   ~4070  it is out of the top of the screen (it fades only once out, at 4220)
 *   4470   ...after a beat, it comes back from the left, from the depth
 *   6070   parked, at its real length (it ran past its place and pulled back; a squash)
 *   6310   it stretches to the bar's whole length (DOCK)...
 *   6570   ...and its panels slide up out of the hull: controls work again
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
export const WORDS = { phoneDelayMs: 750, fadeMs: 450, desktopDelayMs: 1200, desktopFadeMs: 500, desktopOutMs: 250 } as const;

// ---------------------------------------------------------------------------------------------
// The flight of the widget rocket

const TAKEOFF_MS = 1600;
const CLOUD_EXIT_MS = 1000;
// Between leaving the screen and coming back the screen holds a beat without the rocket.
const HANDOVER_BEAT_MS = 250;

export const FLIGHT = {
  /** Seconds left in a serie when the engine lights (the flame grows each second). */
  ignitionS: 3,
  /** ...and before that, from this many seconds left, a small blue flame and a soft tremble, growing. */
  warningS: 10,
  /** The whole takeoff, from the parked pose (banner out) to gone. */
  takeoffMs: TAKEOFF_MS,
  /** Its first part: the banner folds in, and only then does the rocket move... */
  foldMs: 260,
  /** ...crouching (anticipation) until this moment, then it turns its nose up and climbs. */
  anticipationMs: 480,
  /** An interrupted flight (a skip while it was coming back) just fades out where it is. */
  fadeMs: 250,
  handoverBeatMs: HANDOVER_BEAT_MS,
  /** Into the clouds: it shoots off to the right, out of the screen, in this long... */
  exitRightMs: 380,
  /** ...waits out of sight, and comes up from below from this moment... */
  appearMs: 1000,
  /** ...braking into a slow rise by the words (from here, by `driftPx` each way of its place)... */
  slowMs: 1700,
  driftPx: 45,
  /** ...(a block's segment, or the boosters after the warm-up, comes off now and falls away)... */
  dropMs: 1800,
  dropFallMs: 1300,
  /** ...until it takes off, once, as the clouds are about to open... */
  cloudLiftMs: CLOUD_TIMING.liftMs,
  /** ...climbing straight out of the top. */
  cloudExitMs: CLOUD_EXIT_MS,
  /** It comes back once it has gone, and a beat later. */
  returnStartMs: CLOUD_TIMING.liftMs + CLOUD_EXIT_MS + HANDOVER_BEAT_MS,
  /** From entering at the left to parked: it comes in fast, runs past its place and off the
   * screen a little, and pulls back (and the ease back). */
  returnMs: 1600,
  /** The squash as it settles, ending at the parked moment. */
  settleMs: 420,
  /** The "¡pam!" when a rest ends and the serie starts (no clouds). */
  pamMs: 460,
} as const;

/** ms after the clouds start until the rocket is parked again. */
export const PARKED_AFTER_CLOUDS_MS = FLIGHT.returnStartMs + FLIGHT.returnMs;

/** Its whole way through the clouds, from parked to gone out of the top. */
export const CLOUD_LEAVE_MS = CLOUD_TIMING.liftMs + CLOUD_EXIT_MS;

// ---------------------------------------------------------------------------------------------
// The rest after a block (its segment comes off): its clouds last BLOCK_END_EXTRA_MS longer, and
// the words come in three sentences (CloudTransition): "Has acabado el primer bloque.", "Llevas el
// NN % completado." (on a phone the % badge of the corner travels into it), and "Retirando el
// primer bloque del cohete…", when the segment comes off; then the usual "Luego: …".

/**
 * Does this rest have the longer clouds with their sentences? Every long rest: after a block (its
 * segment comes off) and after the warm-up (the boosters come off). Not a short one.
 */
export const blockEnds = (item: RoutineItem | undefined) => item?.kind === 'rest' && item.restKind === 'long';

/** How much longer the clouds of this rest last (ms). */
export const cloudExtraMs = (item: RoutineItem | undefined) => (blockEnds(item) ? BLOCK_END_EXTRA_MS : 0);

/** The clouds' moments for a rest whose clouds last `extra` ms longer. */
export const cloudsFor = (extra: number) => ({
  coveredMs: CLOUDS.coveredMs,
  openingMs: CLOUDS.openingMs + extra,
  clearMs: CLOUDS.clearMs + extra,
});

/**
 * The three sentences after a block, from the rest's start (ms): each comes in with a short fade
 * and stays more than a second, one in the place of the other; the % badge travels in with the
 * second (`travelMs`: down the left edge, then across into its hole), stands in its hole, and
 * leaves it `badgeLeadMs` before the third (back out of the column in `badgeOutMs`, then up the
 * left edge in `badgeUpMs`); with the third the mechanics take the segment off (SEPARATION). All
 * of it is read from one clock (cloudClock.ts) through sentenceAt, badgeAt and wordsAt below.
 */
export const BLOCK_END = {
  firstMs: 1200,
  secondMs: 2200,
  travelMs: 600,
  badgeLeadMs: 400,
  badgeOutMs: 250,
  badgeUpMs: 300,
  thirdMs: 4200,
  afterMs: 6500,
  /** each sentence's fade in */
  swapMs: 280,
} as const;

/**
 * The separation after a block (and after the warm-up), on the same clock, one thing at a time
 * (ms from the rest's start; 25-11-2026, the clouds a second longer for it):
 *   1  the rocket rises slowly into a near-hover and its engine goes out (the slow-motion roar
 *      with it), while the first two sentences are read;
 *   2  with the third, the two mechanics of the rests come in from the left (the words are on the
 *      right), one undoes the latch with two turns of the wrench, the other knocks the part loose
 *      with the hammer: the release;
 *   3  they step back and run off while the part comes loose, and then it falls away slowly,
 *      tumbling a little, out of the bottom, alone;
 *   4  the engine tries: two sputters that die (a puff each), then it catches and grows;
 *   5  only then the rocket speeds off out of the top, as ever.
 * Pure numbers: the rocket's keyframes (cloudKeyframes, cloudFlameKeyframes), its sounds
 * (rocketSounds.ts) and the scene's painter (separation.ts) all read them.
 */
const SEP_CREW_IN = BLOCK_END.thirdMs - BLOCK_END.badgeLeadMs + BLOCK_END.badgeOutMs + BLOCK_END.badgeUpMs;
export const SEPARATION = {
  /** the flame dies over this span (and the slow-motion loop stops, with its own fade, at the start) */
  engineOffMs: 3000,
  engineOutMs: 3500,
  /** by now the slow rise has braked into a near-hover (it only creeps up from here) */
  hoverMs: 3700,
  /** the mechanics come in once the % badge is home in its corner (the left edge is theirs) */
  crewInMs: SEP_CREW_IN,
  crewWalkMs: 500,
  crewLagMs: 120,
  /** the one with the wrench undoes the latch: two turns */
  turnsMs: [5080, 5300],
  /** the one with the hammer winds up and knocks it loose: the blow is the release */
  windupMs: 150,
  releaseMs: 5600,
  /** they step back, turn round and run off the way they came, gone by... */
  crewOutMs: 5650,
  crewGoneMs: 6100,
  /** ...while the part comes loose (a few px, a tilt); then it falls away, out of the bottom */
  creepMs: 500,
  fallMs: 1400,
  /** the engine tries: two sputters that die, then it catches and grows */
  sputtersMs: [7040, 7260],
  sputterMs: 200,
  catchMs: 7480,
  /** and the usual lift out of the top, a second later than it used to be */
  liftMs: CLOUD_TIMING.liftMs + BLOCK_END_EXTRA_MS,
} as const;

/** Clouds that last this much longer have the separation (the long rests: BLOCK_END_EXTRA_MS). */
export const separates = (extra = 0) => extra >= BLOCK_END_EXTRA_MS;

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (p: number) => 1 - (1 - clamp01(p)) ** 3;

/**
 * The words of the clouds at `t` ms after the rest began: how far they have come in and gone out
 * (0..1 each, eased). On a phone they are all gone by the moment the clouds start to open, which
 * is when the countdown leaves their column (cloudsOpenAt): the two never meet.
 */
export function wordsAt(t: number, phone: boolean, extra: number): { in: number; out: number } {
  const inAt = phone ? WORDS.phoneDelayMs : WORDS.desktopDelayMs;
  const inMs = phone ? WORDS.fadeMs : WORDS.desktopFadeMs;
  const outAt = CLOUD_TIMING.liftMs + extra;
  const outMs = phone ? LIFT_LEAD_MS : WORDS.desktopOutMs;
  return { in: easeOut((t - inAt) / inMs), out: clamp01((t - outAt) / outMs) };
}

/** When the clouds of a rest whose clouds last `extra` ms longer start to open (the words are gone). */
export const cloudsOpenAt = (extra: number) => CLOUDS.openingMs + extra;

/**
 * Which of a block's sentences stands in its zone at `t`: one at a time, never two. 4 is
 * "Luego: …", where it shares that zone (the computer; on a phone it has a zone of its own).
 */
export function sentenceAt(t: number, luegoShares: boolean): 1 | 2 | 3 | 4 {
  if (t < BLOCK_END.secondMs) return 1;
  if (t < BLOCK_END.thirdMs) return 2;
  return luegoShares && t >= BLOCK_END.afterMs ? 4 : 3;
}

/** How far the sentence standing at `t` has faded in (0..1); the first comes in with the words. */
export function sentenceFade(t: number, step: 1 | 2 | 3 | 4): number {
  const since = [0, BLOCK_END.secondMs, BLOCK_END.thirdMs, BLOCK_END.afterMs][step - 1];
  return step === 1 ? 1 : easeOut((t - since) / BLOCK_END.swapMs);
}

/** "Luego: …" in its own zone (phone): how far it has faded in at `t`. */
export const luegoFade = (t: number) => (t < BLOCK_END.afterMs ? 0 : easeOut((t - BLOCK_END.afterMs) / BLOCK_END.swapMs));

/**
 * Where the % badge is at `t`, as a leg of its one way and how far along it (0..1):
 *   home    in its corner (under the clouds)
 *   down    down the left edge, at its size, left of the rail and of every word
 *   across  across into its hole, growing (the hole starts its own line: nothing is left of it)
 *   landed  in the hole of the second sentence
 *   back    out of the hole to the left edge, shrinking, done before the third sentence comes in
 *   up      up the left edge to its corner
 * It is anywhere but home only while the second sentence stands (or in the left edge's lane).
 */
export type BadgeLeg = 'home' | 'down' | 'across' | 'landed' | 'back' | 'up';

export function badgeAt(t: number): { leg: BadgeLeg; p: number } {
  const B = BLOCK_END;
  const half = B.travelMs / 2;
  const leave = B.thirdMs - B.badgeLeadMs;
  const legs: [BadgeLeg, number, number][] = [
    ['down', B.secondMs, B.secondMs + half],
    ['across', B.secondMs + half, B.secondMs + B.travelMs],
    ['landed', B.secondMs + B.travelMs, leave],
    ['back', leave, leave + B.badgeOutMs],
    ['up', leave + B.badgeOutMs, leave + B.badgeOutMs + B.badgeUpMs],
  ];
  for (const [leg, from, to] of legs) if (t >= from && t < to) return { leg, p: (t - from) / (to - from) };
  return { leg: 'home', p: 0 };
}
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
  /** how much longer its clouds last (the rest after a block) */
  extra?: number;
}

export type Phase = 'parked' | 'leaving' | 'away' | 'returning';

export const PARKED: Flight = { leftAt: null, how: 'fade', returnAt: null };

/** The player opens: the rocket arrives from the depth and parks, from the first second. */
export const arrival = (now: number): Flight => ({ leftAt: -Infinity, how: 'fade', returnAt: now });

export const leaveMs = (how: Flight['how'], extra = 0) =>
  how === 'clouds' ? CLOUD_LEAVE_MS + extra : how === 'takeoff' ? FLIGHT.takeoffMs : FLIGHT.fadeMs;

export function phaseAt(f: Flight, now: number): Phase {
  if (f.leftAt === null) return 'parked';
  if (now < f.leftAt + leaveMs(f.how, f.extra)) return 'leaving';
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

export function nextFlight(f: Flight, event: FlightEvent, now: number, extra = 0): Flight {
  const phase = phaseAt(f, now);
  if (event === 'show') {
    if ((phase === 'away' || phase === 'leaving') && f.returnAt === null) {
      return { ...f, returnAt: Math.max(now, (f.leftAt ?? now) + leaveMs(f.how, f.extra)) };
    }
    return f;
  }
  const returnAt = event === 'clouds' ? now + FLIGHT.returnStartMs + extra : null;
  const more = event === 'clouds' && extra ? { extra } : {};
  switch (phase) {
    case 'parked':
      return { leftAt: now, how: event === 'clouds' ? 'clouds' : 'takeoff', returnAt, ...more };
    case 'leaving':
      // waiting in the clouds and they play again: it waits in its place for the new ones
      if (
        event === 'clouds' &&
        f.how === 'clouds' &&
        f.leftAt !== null &&
        now >= f.leftAt + FLIGHT.slowMs &&
        now < f.leftAt + FLIGHT.cloudLiftMs + (f.extra ?? 0)
      ) {
        return { leftAt: now, how: 'clouds', placed: true, returnAt, ...more };
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
    return now < f.leftAt + FLIGHT.cloudLiftMs + (f.extra ?? 0) + FLIGHT.cloudExitMs * CLOUD_OFFSCREEN_AT;
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

// ---------------------------------------------------------------------------------------------
// The player's bar (phone): its DOCK. In the bar the rocket always takes its whole length; in
// flight and in the clouds it has its real one (shorter once stages have come off). It lands at
// its real length; a moment later (the settle's squash) it stretches to the whole length, and then
// its panels (the banner's heirs: the name and time, the controls; in a rest "Descanso" and
// "Saltar") slide up out of the hull. To leave it goes the other way: the panels slide back in,
// it shrinks to its real length, and it takes off (all within the takeoff's lead: launchLeadMs).
// The banner of the creator's bar keeps POD.

const STRETCH_AT_MS = 240;
const STRETCH_MS = 260;

export const DOCK = {
  /** after it parks: it stretches from here, this long... */
  stretchAtMs: STRETCH_AT_MS,
  stretchMs: STRETCH_MS,
  /** ...then its panels slide out (the second a little later); its controls work from then */
  outAtMs: STRETCH_AT_MS + STRETCH_MS,
  outMs: 200,
  outStaggerMs: 60,
  /** leaving: they slide in (the same stagger, quicker)... */
  inMs: 110,
  inStaggerMs: 30,
  /** ...and it shrinks to its real length */
  compressMs: 260,
} as const;

/** All the panels out, and all of them in. */
export const PANELS_OUT_MS = DOCK.outMs + DOCK.outStaggerMs;
export const PANELS_IN_MS = DOCK.inMs + DOCK.inStaggerMs;

/**
 * As a flight starts from `start`, when it shrinks to its real length (ms after the flight's
 * start) and how long it takes: after its panels have gone in, and done before it moves off.
 * (From its crouch it already has: the last second shrank it, see `prelaunchCompress`.)
 */
export function compressTiming(start: LaunchStart): { delay: number; ms: number } {
  if (start === 'open') return { delay: PANELS_IN_MS, ms: DOCK.compressMs };
  if (start === 'folded') return { delay: 0, ms: Math.min(DOCK.compressMs, PRELAUNCH.quickMs - 20) };
  return { delay: 0, ms: 100 };
}

/** The serie's last second: its panels go in (from `foldLeadS` left), then it shrinks (paused with the routine). */
export const prelaunchCompress = { delay: PANELS_IN_MS, ms: DOCK.compressMs } as const;

/** When it starts to stretch after landing (-Infinity: it already has; Infinity: it stays away). */
export function stretchFrom(f: Flight): number {
  const parked = parkedFrom(f);
  return Number.isFinite(parked) ? parked + DOCK.stretchAtMs : parked;
}

/**
 * A long rest with talks: the window of the next exercise (Stage) slides out of the rocket just
 * after its panels, the same way, so it reads as coming out of the rocket too.
 */
export const PREVIEW = { lagMs: 200, outMs: 280 } as const;
/** ms after the rest begins (the clouds start) when the window starts to come out. */
export const PREVIEW_OUT_AFTER_REST_MS = PARKED_AFTER_CLOUDS_MS + DOCK.outAtMs + PREVIEW.lagMs;

/** When the panels are fully out again (-Infinity: they already are; Infinity: they stay in). */
export function podOutFrom(f: Flight): number {
  const parked = parkedFrom(f);
  return Number.isFinite(parked) ? parked + DOCK.outAtMs + PANELS_OUT_MS : parked;
}

/** The panels can be seen (all of them, or sliding out, or sliding in). */
export function podShownAt(f: Flight, now: number): boolean {
  const phase = phaseAt(f, now);
  if (phase === 'parked') return f.leftAt === null || now >= parkedFrom(f) + DOCK.outAtMs;
  // they go in during the first moment of a takeoff or of the way into the clouds (a fade takes them at once)
  return phase === 'leaving' && f.how !== 'fade' && !f.placed && f.leftAt !== null && now < f.leftAt + PANELS_IN_MS;
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

// ---------------------------------------------------------------------------------------------
// Controls: they work only once the rocket is parked and its panels are coming out (the widget is
// `inert` otherwise): until then there is nothing to press.

/** Its controls can be pressed. */
export function controlsLiveAt(f: Flight, now: number): boolean {
  if (phaseAt(f, now) !== 'parked') return false;
  return f.leftAt === null || now >= parkedFrom(f) + DOCK.outAtMs;
}

/** When its controls change from dead to live next (null: they are live, or never will be). */
export function controlsLiveFrom(f: Flight, now: number): number | null {
  const parked = parkedFrom(f);
  if (!Number.isFinite(parked)) return null;
  const at = parked + DOCK.outAtMs;
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
// Rest: the rocket is "being repaired" (RepairCrew): its stands lift it a few px while the crew
// works, lower it as they leave, and at the end ("¡pam!") it drops into its place, past it and
// back. The banner does not move: it is where the finger is ("Saltar").

export interface Sink {
  y: number;
  rz: number;
}

export const UPRIGHT: Sink = { y: 0, rz: 0 };

/** How high its stands hold it while it is worked on, and as they are taken away (px, up). */
export const STANDS = { liftPx: 4, lowPx: 1.5, springMs: 560 } as const;

export const sinkTransform = (s: Sink) => `translateY(${num(s.y)}px) rotate(${num(s.rz)}deg)`;

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
// The repair of a rest (phone): two mechanics come in from both sides, set stands under the
// rocket, work on it (one hammers at the tail, the other turns a wrench at the nose; now and then
// they cross over), speed up near the end, take the stands away and run off; the rocket drops into
// place with its "¡pam!" at 0. Measured from the moment the rocket parks in the rest (P ms to 0).

export const REPAIR = {
  enterMs: 600,
  /** the second one comes in this much later (they never move as one) */
  lagMs: 120,
  /** they take the stands and leave this long before the end... */
  exitLeadMs: 1200,
  /** ...and are gone after this */
  exitMs: 600,
  /** one gesture (a blow, a turn of the wrench); slower with a talk on */
  beatMs: 650,
  calmBeatMs: 1000,
  /** the last 3 s, faster */
  fastFromEndMs: 3000,
  fastBy: 1.4,
  /** they cross over every so often, if there is time */
  swapEveryMs: 4000,
  swapMs: 1200,
  /** shorter than this, no repair at all; shorter than this, a short one */
  minMs: 2000,
  shortBelowMs: 4000,
  /** a long rest (the minute between blocks): this much work, then a break, by turns; hard work for the last stretch */
  breaksFromMs: 20000,
  workMs: 7000,
  breakMs: 5000,
  finalWorkMs: 8000,
  /** puffs of smoke at either end (fewer with a talk on) */
  puffEveryMs: 600,
  calmPuffEveryMs: 1300,
} as const;

export interface RepairPlan {
  /** too short for anyone to come */
  none: boolean;
  short: boolean;
  calm: boolean;
  /** when both are in place, when they start to leave, when they are gone (ms after parking) */
  enterEnd: number;
  exitStart: number;
  exitEnd: number;
  /** blows of the hammer (the one at the tail) and turns of the wrench (the one at the nose) */
  hits: number[];
  turns: number[];
  /** when they cross over */
  swaps: [number, number][];
  puffs: number[];
  /** a long rest: stretches when they stop to rest (wipe their brow, look at it, sit on the toolbox) */
  breaks: [number, number][];
  /** sparks and jolts of the rocket at each blow (not with a talk on) */
  sparks: boolean;
}

/** The repair's choreography for a rocket parked `parkedMs` before the rest ends (`calm`: a talk is on). */
export function repairPlan(parkedMs: number, calm = false): RepairPlan {
  const P = Math.max(0, Number.isFinite(parkedMs) ? parkedMs : 0);
  const none = P < REPAIR.minMs;
  const short = !none && P < REPAIR.shortBelowMs;
  const enterEnd = short ? 450 : REPAIR.enterMs + REPAIR.lagMs;
  const exitStart = Math.max(enterEnd, P - (short ? 700 : REPAIR.exitLeadMs));
  const exitEnd = Math.min(P - 250, exitStart + (short ? 450 : REPAIR.exitMs));
  const plan: RepairPlan = { none, short, calm, enterEnd, exitStart, exitEnd, hits: [], turns: [], swaps: [], puffs: [], breaks: [], sparks: !calm };
  if (none) return { ...plan, enterEnd: 0, exitStart: 0, exitEnd: 0 };
  const workFrom = enterEnd + (short ? 100 : 200);
  const workTo = exitStart - (short ? 100 : 150);
  if (short) {
    // in, two blows (and two turns), out
    const beat = Math.max(300, Math.min(500, (workTo - workFrom) / 2));
    for (let t = workFrom; t + beat * 0.4 <= workTo && plan.hits.length < 2; t += beat) {
      plan.hits.push(Math.round(t + beat * 0.6));
      plan.turns.push(Math.round(t + beat * 0.6 + beat / 3));
    }
    plan.turns = plan.turns.filter((t) => t <= workTo);
    return plan;
  }
  // a long rest: work and breaks by turns, and hard work again at the end
  if (P >= REPAIR.breaksFromMs) {
    for (let t = workFrom + REPAIR.workMs; t + REPAIR.breakMs <= exitStart - REPAIR.finalWorkMs; t += REPAIR.workMs + REPAIR.breakMs) {
      plan.breaks.push([Math.round(t), Math.round(t + REPAIR.breakMs)]);
    }
  }
  const inBreak = (t: number, margin = 0) => plan.breaks.some(([a, b]) => t > a - margin && t < b + margin);
  // crossings: one every few seconds, never in the last stretch nor in a break
  for (let t = workFrom + 2500; t + REPAIR.swapMs <= exitStart - REPAIR.fastFromEndMs + 600; t += REPAIR.swapEveryMs) {
    if (inBreak(t, 400) || inBreak(t + REPAIR.swapMs, 400)) continue;
    plan.swaps.push([Math.round(t), Math.round(t + REPAIR.swapMs)]);
  }
  const inSwap = (t: number) => plan.swaps.some(([a, b]) => t > a - 250 && t < b + 250) || inBreak(t, 300);
  const base = calm ? REPAIR.calmBeatMs : REPAIR.beatMs;
  for (let t = workFrom; t <= workTo; ) {
    const beat = t >= P - REPAIR.fastFromEndMs ? base / REPAIR.fastBy : base;
    const hit = t + beat * 0.6;
    // the wrench a third of a beat later, at a slightly different pace (they never go as one)
    const turn = hit + beat / 3 + 40;
    if (hit <= workTo && !inSwap(hit)) plan.hits.push(Math.round(hit));
    if (turn <= workTo && !inSwap(turn)) plan.turns.push(Math.round(turn));
    t += beat;
  }
  for (let t = workFrom + 200; t <= workTo; t += calm ? REPAIR.calmPuffEveryMs : REPAIR.puffEveryMs) if (!inBreak(t)) plan.puffs.push(Math.round(t));
  return plan;
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

/**
 * The last second of a serie before a takeoff: first its banner folds in (from `foldLeadS` left:
 * nothing moves with the banner out), then for the last `leadS` the rocket pulls back towards its
 * tail and compresses, more and more (`crouchAt`), and at 0 it shoots off from that crouch.
 * "Siguiente" before that: the fold (if the banner is out), a quick crouch (`quickMs`), and off.
 */
export const PRELAUNCH = { foldLeadS: 1, leadS: 0.7, quickMs: 200 } as const;

/** How far into its crouch it is with `timeLeft` seconds left (0..1, quicker and quicker). */
export function crouchAt(timeLeft: number): number {
  if (!Number.isFinite(timeLeft) || timeLeft >= PRELAUNCH.leadS) return 0;
  const t = 1 - Math.max(0, timeLeft) / PRELAUNCH.leadS;
  return Math.round(t * t * 1000) / 1000;
}

/** How hard it shakes at each step of the ignition: the rocket (px), the banner's text (px), and how fast (s). */
export const SHAKE = {
  rocket: [0, 1.4, 2.4, 3.4],
  text: [0, 0.7, 1.3, 2],
  period: [0.18, 0.15, 0.12, 0.09],
} as const;

/**
 * The warning before the ignition: from FLIGHT.warningS seconds left, 0 rising steadily to 1 as
 * the ignition comes (it takes over from then: 0 again). The blue flame and the soft tremble grow
 * with it, and meet the ignition's first step where it starts, so it reads as one build-up.
 */
export function warningLevel(timeLeft: number): number {
  if (!Number.isFinite(timeLeft) || timeLeft > FLIGHT.warningS || ignitionLevel(timeLeft) > 0) return 0;
  const w = (FLIGHT.warningS - timeLeft) / (FLIGHT.warningS - FLIGHT.ignitionS);
  return Math.round(Math.min(1, Math.max(0, w)) * 1000) / 1000;
}

/** The blue flame of the warning, as a scale of the full flame: small at first, the ignition's first step at the end. */
export function warningFlame(level: number) {
  return { sx: Math.round((0.08 + 0.22 * level) * 1000) / 1000, sy: Math.round((0.5 + 0.18 * level) * 1000) / 1000 };
}

/** How the engine shakes the rocket with `timeLeft` seconds left (px, s): softly in the warning, hard at the ignition. */
export function engineShake(timeLeft: number): { amp: number; period: number } {
  const level = ignitionLevel(timeLeft);
  if (level > 0) return { amp: SHAKE.rocket[level], period: SHAKE.period[level] };
  if (!Number.isFinite(timeLeft) || timeLeft > FLIGHT.warningS) return { amp: 0, period: SHAKE.period[0] };
  const w = warningLevel(timeLeft);
  return {
    amp: Math.round((0.3 + w * (SHAKE.rocket[1] - 0.3 - 0.1)) * 100) / 100,
    period: Math.round((SHAKE.period[0] - w * (SHAKE.period[0] - SHAKE.period[1])) * 1000) / 1000,
  };
}

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

/** The crouch the takeoff goes from: pulled back towards the tail, compressed, nose a little down. */
export const CROUCH: Pose = { x: '-7px', y: '2px', rz: 2, sx: 0.92, sy: 1.09 };
export const CROUCH_POSE = pose(CROUCH);

/** The last second: parked → crouched, quicker and quicker (play it over the time that is left). */
export const PRELAUNCH_KEYFRAMES: FlightKeyframe[] = [
  { offset: 0, transform: PARKED_POSE, opacity: 1, easing: 'cubic-bezier(0.55, 0, 1, 0.45)' },
  { offset: 1, transform: CROUCH_POSE, opacity: 1 },
];

/**
 * How a takeoff starts: from the crouch of the last second; with the banner already folded (a
 * quick crouch first); or with the banner out (it folds in first, then the quick crouch).
 */
export type LaunchStart = 'crouched' | 'folded' | 'open';

/** How long after the takeoff's moment the rocket moves off (ms). */
export const launchLeadMs = (start: LaunchStart) =>
  start === 'crouched' ? 0 : start === 'folded' ? PRELAUNCH.quickMs : FLIGHT.foldMs + PRELAUNCH.quickMs;

/** The start of a takeoff, up to the crouch it goes from (`at`: ms → offset), easing `go` from there. */
function launchStartKeys(start: LaunchStart, at: (ms: number) => number, go: string): FlightKeyframe[] {
  if (start === 'crouched') return [{ offset: 0, transform: CROUCH_POSE, opacity: 1, easing: go }];
  const crouch = 'cubic-bezier(0.4, 0, 0.6, 1)';
  return [
    // (still while its banner folds in)
    ...(start === 'open' ? [{ offset: 0, transform: PARKED_POSE, opacity: 1, easing: 'linear' }] : []),
    { offset: at(launchLeadMs(start) - PRELAUNCH.quickMs), transform: PARKED_POSE, opacity: 1, easing: crouch },
    { offset: at(launchLeadMs(start)), transform: CROUCH_POSE, opacity: 1, easing: go },
  ];
}

/** The end's takeoff, from its crouch (see LaunchStart); then the same climb straight out of the top. */
export function takeoffKeyframes(start: LaunchStart): FlightKeyframe[] {
  const climb = TAKEOFF_POSES.filter((k) => k.offset >= UPRIGHT_AT).map(({ pose: p, ...k }) => ({ ...k, transform: pose(p) }));
  const at = (ms: number) => Math.round((ms / FLIGHT.takeoffMs) * 10000) / 10000;
  return [...launchStartKeys(start, at, 'cubic-bezier(0.2, 0.7, 0.4, 1)'), ...climb];
}

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

/** How far it runs past its place before it pulls back (it leaves the screen a little that way). */
export const RUN_PAST = '22vw';

/** The part of its way back at which it goes through its place at speed and starts to brake. */
export const RETURN_BRAKE_AT = 0.44;

/**
 * Gone → parked: from the depth at the left, growing, fast; it runs past its place and off the right
 * edge a little (squashed by the brake), pulls back past it the other way, and eases into it.
 */
export const RETURN_KEYFRAMES: FlightKeyframe[] = [
  // (it shows at the left edge right away: the beat before is the time it waited)
  { offset: 0, transform: pose({ x: '-64vw', y: '-30vh', s: 0.22, rz: 30, ry: -64 }), opacity: 0, easing: 'linear' },
  { offset: 0.06, transform: pose({ x: '-52vw', y: '-25vh', s: 0.28, rz: 27, ry: -58 }), opacity: 1, easing: 'cubic-bezier(0.3, 0.1, 0.6, 1)' },
  { offset: 0.34, transform: pose({ x: '-14vw', y: '-5vh', s: 0.82, rz: 8, ry: -18 }), opacity: 1, easing: 'linear' },
  // through its place at speed...
  { offset: RETURN_BRAKE_AT, transform: pose({ x: '0px', y: '-1px', rz: -1, sx: 1.04, sy: 0.97 }), opacity: 1, easing: 'cubic-bezier(0.2, 0.6, 0.35, 1)' },
  // ...past it and off the right edge, braking
  { offset: 0.58, transform: pose({ x: RUN_PAST, y: '-2px', rz: -3, sx: 0.95, sy: 1.05 }), opacity: 1, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
  // it pulls back, a little past the other way
  { offset: 0.8, transform: pose({ x: '-12px', rz: 1.5, sx: 1.02, sy: 0.98 }), opacity: 1, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
  { offset: 0.92, transform: pose({ x: '4px', rz: -0.5 }), opacity: 1, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' },
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

/** How far it rises each way of its place in the clouds (px): a little further when they last longer. */
export const cloudDriftPx = (extra = 0) => Math.round(FLIGHT.driftPx + extra * 0.012);

/**
 * Parked → gone, through the clouds, over CLOUD_LEAVE_MS (+ `extra`, the rest after a block). From its crouch it shoots off to the
 * RIGHT (where its nose points) out of the screen; a pause out of sight while the clouds close; it
 * comes up from below standing, nose up and bigger, fast, and brakes ("the camera catches it in
 * slow motion") into a slow but visible rise past its place by the words; and as the clouds are
 * about to open it speeds up again out of the top. `placed`: it is there already (the clouds
 * played again): it just goes on rising and leaves.
 */
export function cloudKeyframes({ dx, dy, k }: CloudSpot, placed = false, start: LaunchStart = 'open', extra = 0): FlightKeyframe[] {
  const at = (ms: number) => Math.round((ms / (CLOUD_LEAVE_MS + extra)) * 10000) / 10000;
  const lift = FLIGHT.cloudLiftMs + extra;
  // (longer clouds: a little further, still slow)
  const drift = cloudDriftPx(extra);
  const there = (y = 0, sx = 1, sy = 1) => pose({ x: `${num(dx)}px`, y: `${num(dy + y)}px`, rz: -90, sx: k * sx, sy: k * sy });
  const up = (px: number) => pose({ x: `${num(dx)}px`, y: `${num(dy)}px - 100vh - ${px}px`, rz: -90, sx: k * 1.08, sy: k * 0.93 });
  // (the separation: it brakes into a near-hover, where the part is taken off, and only creeps up)
  const hover: FlightKeyframe[] = separates(extra)
    ? [{ offset: at(SEPARATION.hoverMs), transform: there(-drift * 0.85), opacity: 1, easing: 'linear' }]
    : [];
  const away: FlightKeyframe[] = [
    ...hover,
    // the slow rise (it never stops), then faster and faster out of the top
    { offset: at(lift), transform: there(-drift), opacity: 1, easing: 'cubic-bezier(0.45, 0, 0.9, 0.5)' },
    { offset: at(lift + FLIGHT.cloudExitMs * CLOUD_OFFSCREEN_AT), transform: up(400), opacity: 1, easing: 'linear' },
    { offset: 1, transform: up(600), opacity: 0 },
  ];
  if (placed) return [{ offset: 0, transform: there(drift / 2), opacity: 1, easing: 'linear' }, ...away];
  const out = launchLeadMs(start) + FLIGHT.exitRightMs;
  const right = pose({ x: '100vw + 260px', y: '-6px', rz: -2, sx: 1.25, sy: 0.86 });
  const below = pose({ x: `${num(dx)}px`, y: `${num(dy)}px + 100vh`, rz: -90, sx: k * 1.12, sy: k * 0.92 });
  return [
    // shooting off to the right, faster and faster (stretched)
    ...launchStartKeys(start, at, 'cubic-bezier(0.55, 0, 0.9, 0.45)'),
    { offset: at(out), transform: right, opacity: 1, easing: 'linear' },
    // out of sight, it goes round to below the screen
    { offset: at(out + 20), transform: right, opacity: 0, easing: 'linear' },
    { offset: at(FLIGHT.appearMs - 20), transform: below, opacity: 0, easing: 'linear' },
    // up from below, fast, braking into the slow rise (still moving as it gets there)
    { offset: at(FLIGHT.appearMs), transform: below, opacity: 1, easing: 'cubic-bezier(0.12, 0.7, 0.4, 0.97)' },
    { offset: at(FLIGHT.slowMs), transform: there(drift), opacity: 1, easing: separates(extra) ? 'cubic-bezier(0.3, 0.45, 0.4, 1)' : 'linear' },
    ...away,
  ];
}

/** The flame of the separation: out, two sputters that die, then it catches and grows towards the lift. */
function separationFlameKeys(at: (ms: number) => number) {
  const S = SEPARATION;
  const off = (ms: number) => ({ offset: at(ms), opacity: 0, transform: 'scale(0.05, 0.4)' });
  return [
    { offset: at(S.engineOffMs), opacity: 1, transform: 'scale(0.45, 0.8)' },
    off(S.engineOutMs),
    ...S.sputtersMs.flatMap((s) => [
      off(s),
      { offset: at(s + 60), opacity: 1, transform: 'scale(0.3, 0.74)' },
      { offset: at(s + 110), opacity: 0.6, transform: 'scale(0.16, 0.58)' },
      { offset: at(s + 150), opacity: 0.9, transform: 'scale(0.22, 0.66)' },
      off(s + S.sputterMs),
    ]),
    off(S.catchMs),
    { offset: at(S.catchMs + 70), opacity: 1, transform: 'scale(0.4, 0.82)' },
    { offset: at(S.catchMs + 150), opacity: 1, transform: 'scale(0.34, 0.8)' },
  ];
}

/** Its flame on that way: full as it shoots off, out while out of sight, burning low as it rises slowly, full as it leaves. */
export function cloudFlameKeyframes(placed = false, start: LaunchStart = 'open', extra = 0) {
  const at = (ms: number) => Math.round((ms / (CLOUD_LEAVE_MS + extra)) * 10000) / 10000;
  const lift = FLIGHT.cloudLiftMs + extra;
  const tail = [
    { offset: at(lift), opacity: 1, transform: 'scale(0.7, 0.9)' },
    { offset: 1, opacity: 1, transform: 'scale(1.35, 1.08)' },
  ];
  if (placed) return [{ offset: 0, opacity: 1, transform: 'scale(0.6, 0.85)' }, ...tail];
  const go = launchLeadMs(start);
  const out = go + FLIGHT.exitRightMs;
  return [
    { offset: 0, opacity: start === 'crouched' ? 1 : 0, transform: start === 'crouched' ? 'scale(0.8, 1)' : 'scale(0.3, 0.7)' },
    ...(go ? [{ offset: at(go), opacity: 1, transform: 'scale(0.8, 1)' }] : []),
    { offset: at(out), opacity: 1, transform: 'scale(1.4, 1.1)' },
    { offset: at(out + 20), opacity: 0, transform: 'scale(1.4, 1.1)' },
    { offset: at(FLIGHT.appearMs - 20), opacity: 0, transform: 'scale(1.2, 1.05)' },
    { offset: at(FLIGHT.appearMs), opacity: 1, transform: 'scale(1.2, 1.05)' },
    { offset: at(FLIGHT.slowMs), opacity: 1, transform: 'scale(0.55, 0.85)' },
    // (the separation: the engine goes out by the hover, and lights again before the lift)
    ...(separates(extra) ? separationFlameKeys(at) : []),
    ...tail,
  ];
}

/**
 * The creator's waiting rocket on the minutes question: `share` of the way from the fewest minutes
 * to the most (0..1). Its flame (scale of the drawing's) goes from almost nothing to a long flare,
 * and it trembles harder (--rw-amp), on a curve: the long routines are where it really roars.
 */
export function waitingEngine(share: number): { flame: number; shake: number } {
  const s = Number.isFinite(share) ? Math.min(1, Math.max(0, share)) : 0;
  const flame = 0.06 + (2.2 - 0.06) * s ** 1.3;
  const shake = 0.25 + (3 - 0.25) * s ** 1.5;
  return { flame: Math.round(flame * 100) / 100, shake: Math.round(shake * 100) / 100 };
}

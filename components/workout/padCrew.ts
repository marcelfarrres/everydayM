/*
 * The two astronauts of the rocket base (phone), as pure numbers. They live on one track: the top
 * of the centred rocket from its hatch, along the crew walkway to the right tower, then up its
 * ladder. A position on the track is `s` px from the hatch (deck first, then ladder rungs), so
 * they can never jump: they only ever walk or climb from where they are.
 *
 *   settled ──(drum moves)──▶ to the ladder, then up and down it while the drum turns
 *      ▲                                      │
 *      └──(drum settles)── down the ladder, along the new rocket's top, ready again
 *
 * The second astronaut follows the first one `gap` px behind. Boarding (the launch) is a short
 * scripted walk to the hatch and a hop in each: `boardingPlan`.
 */

export interface CrewTrack {
  /** x of the hatch's centre (s = 0), the ladder's x, px in the base */
  hatchX: number;
  ladderX: number;
  /** y of the feet on the rocket's top (and walkway), and at the top of the ladder */
  deckY: number;
  ladderTop: number;
  /** where each stands, ready, as s */
  standA: number;
  standB: number;
}

export const CREW = {
  /** px per second */
  walk: 46,
  climb: 32,
  /** px per footstep and per rung (one sound each) */
  stride: 8,
  rung: 7,
  /** while the drum turns they go up and down between these shares of the ladder */
  climbHigh: 1,
  climbLow: 0.35,
} as const;

export type CrewMode = 'stand' | 'walk' | 'climb';

/** The deck's length (hatch to ladder) and the ladder's climb, px. */
export function trackSpans(t: CrewTrack): { deck: number; up: number } {
  return { deck: Math.max(0, t.ladderX - t.hatchX), up: Math.max(0, t.deckY - t.ladderTop) };
}

/** The full length of the track, px. */
export function trackEnd(t: CrewTrack): number {
  const { deck, up } = trackSpans(t);
  return deck + up;
}

/** Where `s` is on the track. */
export function crewPoint(s: number, t: CrewTrack): { x: number; y: number; onLadder: boolean } {
  const { deck, up } = trackSpans(t);
  const at = Math.max(0, Math.min(deck + up, s));
  if (at <= deck) return { x: t.hatchX + at, y: t.deckY, onLadder: false };
  return { x: t.ladderX, y: t.deckY - (at - deck), onLadder: true };
}

/** One frame of travel from `s` toward `target`: walking speed on the deck, climbing on the ladder. */
export function crewMove(s: number, target: number, dtMs: number, t: CrewTrack, speed: { walk: number; climb: number } = CREW): number {
  const { deck } = trackSpans(t);
  let left = Math.max(0, dtMs) / 1000;
  let at = s;
  while (left > 1e-6 && Math.abs(target - at) > 1e-6) {
    const dir = Math.sign(target - at);
    const onLadder = dir > 0 ? at >= deck : at > deck;
    const v = onLadder ? speed.climb : speed.walk;
    // to the end of this segment, or to the target, whichever comes first
    const boundary = dir > 0 ? (at < deck ? deck : Infinity) : at > deck ? deck : -Infinity;
    const stop = dir > 0 ? Math.min(target, boundary) : Math.max(target, boundary);
    const need = Math.abs(stop - at) / v;
    if (need <= left) {
      at = stop;
      left -= need;
    } else {
      at += dir * v * left;
      left = 0;
    }
  }
  return at;
}

/** The ladder target while the drum turns: up to the top, then down to the low mark, and again. */
export function climbTarget(goingUp: boolean, t: CrewTrack): number {
  const { deck, up } = trackSpans(t);
  return deck + up * (goingUp ? CREW.climbHigh : CREW.climbLow);
}

/** How the astronaut at `s` looks while moving to `target`. */
export function crewMode(s: number, target: number, t: CrewTrack): CrewMode {
  const { deck } = trackSpans(t);
  if (Math.abs(target - s) < 0.01) return s > deck ? 'climb' : 'stand';
  const up = target > s;
  return (up ? s >= deck : s > deck) ? 'climb' : 'walk';
}

/** Footsteps (or rungs) between two positions: one per stride crossed. */
export function stepsCrossed(prev: number, next: number, stride: number): number {
  if (stride <= 0) return 0;
  return Math.abs(Math.floor(next / stride) - Math.floor(prev / stride));
}

/** Time to travel between two positions at the usual speeds, ms. */
export function travelMs(from: number, to: number, t: CrewTrack, speed: { walk: number; climb: number } = CREW): number {
  const { deck } = trackSpans(t);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const onDeck = Math.max(0, Math.min(hi, deck) - lo);
  const onLadder = Math.max(0, hi - Math.max(lo, deck));
  return (onDeck / speed.walk + onLadder / speed.climb) * 1000;
}

export interface BoardingPlan {
  /** how long the walk to the hatch takes (both arrive by then), ms */
  walkMs: number;
  /** how much faster than usual they walk to make it in time (≥ 1) */
  hurry: number;
}

/** The walk to the hatch before boarding: at the usual pace, sped up so it never exceeds `maxMs`. */
export function boardingPlan(sA: number, sB: number, t: CrewTrack, maxMs: number): BoardingPlan {
  const usual = Math.max(travelMs(sA, 0, t), travelMs(sB, 0, t));
  if (usual <= maxMs) return { walkMs: Math.round(usual), hurry: 1 };
  return { walkMs: maxMs, hurry: usual / maxMs };
}

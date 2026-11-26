/*
 * The two astronauts of the rocket base (phone), as pure numbers. They live on one track: the top
 * of the centred rocket from its hatch, along the crew walkway to the right tower, then up its
 * ladder; while the sentence's field has focus the ladder reaches on up to the top of the text bar
 * (the rocket drawn above the base) and the track goes on along that rocket's top, leftwards (the
 * "roof"). A position on the track is `s` px from the hatch (deck first, then ladder rungs, then
 * the roof), so they can never jump: they only ever walk or climb from where they are.
 *
 *   settled ──(drum moves)──▶ to the ladder, then up and down it while the drum turns
 *      ▲                                      │
 *      └──(drum settles)── down the ladder, along the new rocket's top, ready again
 *
 *   settled ──(field focused)──▶ up the whole ladder, onto the bar's top, waiting there
 *      ▲                                      │
 *      └──(focus lost, not sent)── back down the ladder, to the centred rocket
 *
 * The second astronaut follows the first one `gap` px behind. Boarding (the launch) is a short
 * scripted walk to the hatch (or the bar's round window) and a hop in each: `boardingPlan`.
 */

export interface CrewRoof {
  /** y of the feet on the bar rocket's top (above the base: negative), px in the base */
  deckY: number;
  /** the far (left) end of the roof: where the leading astronaut waits, px */
  x0: number;
}

export interface CrewTrack {
  /** x of the hatch's centre (s = 0), the ladder's x, px in the base */
  hatchX: number;
  ladderX: number;
  /** y of the feet on the rocket's top (and walkway), and at the top of the tower's ladder */
  deckY: number;
  ladderTop: number;
  /** where each stands, ready, as s */
  standA: number;
  standB: number;
  /** the text bar's top, when it is above the tower (the ladder then reaches it) */
  roof?: CrewRoof | null;
}

export const CREW = {
  /** px per second */
  walk: 85,
  climb: 58,
  /** px per footstep and per rung (one sound each) */
  stride: 8,
  rung: 7,
  /** never two step sounds closer than this, ms (at these speeds a stride is ~95 ms: no rattle) */
  soundGapMs: 150,
  /** while the drum turns they go up and down between these shares of the tower's ladder */
  climbHigh: 1,
  climbLow: 0.35,
} as const;

export type CrewMode = 'stand' | 'walk' | 'climb';

/**
 * The track's spans, px: the deck (hatch to ladder), the tower's own ladder (`up`), the whole
 * ladder (`ladder`: up to the roof when there is one, else the same as `up`) and the roof.
 */
export function trackSpans(t: CrewTrack): { deck: number; up: number; ladder: number; roof: number } {
  const deck = Math.max(0, t.ladderX - t.hatchX);
  const up = Math.max(0, t.deckY - t.ladderTop);
  const roofed = t.roof && t.roof.deckY < t.ladderTop ? t.roof : null;
  const ladder = roofed ? Math.max(up, t.deckY - roofed.deckY) : up;
  const roof = roofed ? Math.max(0, t.ladderX - roofed.x0) : 0;
  return { deck, up, ladder, roof };
}

/** The full length of the track, px. */
export function trackEnd(t: CrewTrack): number {
  const { deck, ladder, roof } = trackSpans(t);
  return deck + ladder + roof;
}

/** Where `s` is on the track. */
export function crewPoint(s: number, t: CrewTrack): { x: number; y: number; onLadder: boolean } {
  const { deck, ladder, roof } = trackSpans(t);
  const at = Math.max(0, Math.min(deck + ladder + roof, s));
  if (at <= deck) return { x: t.hatchX + at, y: t.deckY, onLadder: false };
  if (at <= deck + ladder || roof === 0) return { x: t.ladderX, y: t.deckY - (at - deck), onLadder: true };
  return { x: t.ladderX - (at - deck - ladder), y: t.deckY - ladder, onLadder: false };
}

/** True when `s` is on the roof (the text bar's top), not at the ladder's top rung. */
export function onRoof(s: number, t: CrewTrack): boolean {
  const { deck, ladder, roof } = trackSpans(t);
  return roof > 0 && s > deck + ladder + 0.01;
}

/** The roof spot above x (the bar's top), as s. */
export function roofSpot(x: number, t: CrewTrack): number {
  const { deck, ladder, roof } = trackSpans(t);
  return deck + ladder + Math.max(0, Math.min(roof, t.ladderX - x));
}

/** Where the two wait on the bar's top, as s: the leader at the far end, the other `gap` behind. */
export function roofStands(t: CrewTrack, gap: number): { a: number; b: number } | null {
  const { deck, ladder, roof } = trackSpans(t);
  if (roof <= 0) return null;
  const a = deck + ladder + roof;
  return { a, b: Math.max(deck + ladder, a - gap) };
}

/**
 * The roof for a text bar whose rocket's box has its top-left at (`x`, `y`) in the base (`y`
 * negative: above it): its top deck (the hull's top, like the base's walkway on a drum rocket) and
 * how far left they go (the leader a little before the nose's base, the other `gap` behind).
 * Null when the bar is not above the tower's top (nothing to climb to).
 */
export function barRoof(
  x: number,
  y: number,
  g: { bodyTop: number; stroke: number; noseX: number },
  ladderTop: number,
  gap: number,
): CrewRoof | null {
  const deckY = y + g.bodyTop - g.stroke / 2;
  if (!(deckY < ladderTop - 4)) return null;
  return { deckY, x0: x + g.noseX - gap * 1.2 };
}

/** One frame of travel from `s` toward `target`: walking speed on the deck and the roof, climbing on the ladder. */
export function crewMove(s: number, target: number, dtMs: number, t: CrewTrack, speed: { walk: number; climb: number } = CREW): number {
  const { deck, ladder } = trackSpans(t);
  const top = deck + ladder;
  let left = Math.max(0, dtMs) / 1000;
  let at = s;
  while (left > 1e-6 && Math.abs(target - at) > 1e-6) {
    const dir = Math.sign(target - at);
    const climbing = dir > 0 ? at >= deck && at < top : at > deck && at <= top;
    const v = climbing ? speed.climb : speed.walk;
    // to the end of this segment, or to the target, whichever comes first
    const boundary = dir > 0 ? (at < deck ? deck : at < top ? top : Infinity) : at > top ? top : at > deck ? deck : -Infinity;
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

/** The ladder target while the drum turns: up to the tower's top, then down to the low mark, and again. */
export function climbTarget(goingUp: boolean, t: CrewTrack): number {
  const { deck, up } = trackSpans(t);
  return deck + up * (goingUp ? CREW.climbHigh : CREW.climbLow);
}

/** How the astronaut at `s` looks while moving to `target`. */
export function crewMode(s: number, target: number, t: CrewTrack): CrewMode {
  const { deck, ladder, roof } = trackSpans(t);
  const top = deck + ladder;
  if (Math.abs(target - s) < 0.01) return s > deck && (s < top || roof === 0) ? 'climb' : 'stand';
  const up = target > s;
  return (up ? s >= deck && s < top : s > deck && s <= top) ? 'climb' : 'walk';
}

/** Which way an astronaut faces after moving from `prev` to `next`: where it went, or as it was (on the ladder). */
export function crewFacing(prev: number, next: number, t: CrewTrack, current: 1 | -1): 1 | -1 {
  const dx = crewPoint(next, t).x - crewPoint(prev, t).x;
  return Math.abs(dx) < 1e-6 ? current : dx > 0 ? 1 : -1;
}

/** Footsteps (or rungs) between two positions: one per stride crossed. */
export function stepsCrossed(prev: number, next: number, stride: number): number {
  if (stride <= 0) return 0;
  return Math.abs(Math.floor(next / stride) - Math.floor(prev / stride));
}

/** A step sound may play now: one is owed, and the last one was at least `CREW.soundGapMs` ago. */
export function stepSoundDue(steps: number, now: number, lastAt: number): boolean {
  return steps > 0 && now - lastAt >= CREW.soundGapMs;
}

/** Time to travel between two positions at the usual speeds, ms. */
export function travelMs(from: number, to: number, t: CrewTrack, speed: { walk: number; climb: number } = CREW): number {
  const { deck, ladder, roof } = trackSpans(t);
  const top = deck + ladder;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const span = (a: number, b: number) => Math.max(0, Math.min(hi, b) - Math.max(lo, a));
  const onDeck = span(-Infinity, deck);
  const onLadder = span(deck, roof > 0 ? top : Infinity);
  const onRoofPx = roof > 0 ? span(top, Infinity) : 0;
  return ((onDeck + onRoofPx) / speed.walk + onLadder / speed.climb) * 1000;
}

/**
 * The points of a walk along the track from `from` to `to` (each corner: the ladder's foot, its
 * top), with each one's share of the time: keyframes that never leave the track.
 */
export function trackPath(from: number, to: number, t: CrewTrack): { x: number; y: number; offset: number }[] {
  const { deck, ladder } = trackSpans(t);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const corners = [deck, deck + ladder].filter((c, i, all) => c > lo + 1e-6 && c < hi - 1e-6 && all.indexOf(c) === i);
  if (from > to) corners.reverse();
  const total = travelMs(from, to, t);
  return [from, ...corners, to].map((s, i, all) => {
    const p = crewPoint(s, t);
    const offset = i === 0 ? 0 : i === all.length - 1 ? 1 : total > 0 ? travelMs(from, s, t) / total : i / (all.length - 1);
    return { x: p.x, y: p.y, offset };
  });
}

/** A position kept in place when the track changes (the bar grows a line): on the ladder the same height, on the roof the same spot. */
export function remapOnTrack(s: number, from: CrewTrack, to: CrewTrack): number {
  const a = trackSpans(from);
  const b = trackSpans(to);
  const topA = a.deck + a.ladder;
  const topB = b.deck + b.ladder;
  const end = trackEnd(to);
  if (s <= a.deck) return Math.min(s, end);
  if (s <= topA) return Math.min(b.deck + (s - a.deck), topB);
  return Math.min(end, topB + (s - topA));
}

export interface BoardingPlan {
  /** how long the walk to the door takes (both arrive by then), ms */
  walkMs: number;
  /** how much faster than usual they walk to make it in time (≥ 1) */
  hurry: number;
}

/** The walk to the door (`to`: the hatch, or the bar's window) before boarding: at the usual pace, sped up so it never exceeds `maxMs`. */
export function boardingPlan(sA: number, sB: number, t: CrewTrack, maxMs: number, to = 0): BoardingPlan {
  const usual = Math.max(travelMs(sA, to, t), travelMs(sB, to, t));
  if (usual <= maxMs) return { walkMs: Math.round(usual), hurry: 1 };
  return { walkMs: maxMs, hurry: usual / maxMs };
}

import type { Exercise, RoutineItem } from '@/types/workout';
import { blocksOf } from './model';

/*
 * The phone's end screen as one timeline (pure). Everything on that screen is read from it at the
 * time elapsed since it opened (`endStateAt`), so nothing can drift and a page that was hidden
 * lands, when it comes back, exactly where it should be.
 *
 *   0          the rocket flies in (nose + the one stage it ended with) and parks at the top; the
 *              music fades out (1 s)
 *   300        the list comes in: every exercise, in colour, grouped by its part
 *   900        the drum roll starts (it grows until the hit)
 *   ~1.5 s     group by group, in the order the routine was done, its exercises are crossed off
 *              one after another (`step` apart: 120–180 ms) and turn black and white; then the
 *              group's label gets its tick, and its piece joins the rocket with a "pam":
 *                warm-up   the two boosters clamp onto the stage the rocket arrived with
 *                block 1   that stage itself: a pulse (it was already there)
 *                block n   a new stage at the tail
 *   hit        the last piece joins on the drum's final hit; "¡Hecho!" with it, the praise just after
 *   rest       the complete rocket takes off and flies round the screen for as long as it stays
 *
 * 6 s at the least (a short routine waits a little longer before its last piece, the drums
 * building), about 10.5 s at the most (a long one crosses off faster).
 */

export type EndPiece = 'boosters' | 'pulse' | 'stage';

export interface EndGroup {
  key: string;
  /** «Calentamiento», «Bloque 1»… */
  label: string;
  exercises: Exercise[];
  /** what it gives the rocket when it is complete */
  piece: EndPiece;
}

/** The routine's parts in the order they were done: the warm-up (if any), then each block. */
export function endGroups(queue: RoutineItem[]): EndGroup[] {
  const groups: EndGroup[] = [];
  const warmups = queue.flatMap((item) => (item.kind === 'warmup' ? [item.exercise] : []));
  if (warmups.length) groups.push({ key: 'warmup', label: 'Calentamiento', exercises: warmups, piece: 'boosters' });
  blocksOf(queue).forEach((block, i) => {
    groups.push({
      key: `block-${i + 1}`,
      label: `Bloque ${i + 1}`,
      exercises: block.series.map((s) => s.exercise),
      piece: i === 0 ? 'pulse' : 'stage',
    });
  });
  return groups;
}

/** The timings (ms). */
export const END = {
  /** the rocket's way in, from the first frame */
  flyInMs: 1100,
  /** the list comes in */
  listInAt: 300,
  listInMs: 450,
  /** the drum roll starts (the music has almost gone) */
  rollAt: 900,
  /** the first exercise is crossed off; a routine of fewer than 3 parts waits a little longer per missing part */
  crossAt: 1500,
  crossAtPerMissingGroup: 400,
  /** the line through an exercise draws itself in this long; its photo goes grey a little slower */
  strikeMs: 220,
  greyMs: 320,
  /** between one exercise and the next: about this much for the whole list, never quicker or slower than… */
  crossBudgetMs: 4000,
  stepMinMs: 120,
  stepMaxMs: 180,
  /** …unless the routine is so long that the hit would come too late: then down to this */
  stepFloorMs: 70,
  /** the pauses around the joins: about this much for all of them, each between… */
  pauseBudgetMs: 2800,
  pauseMinMs: 300,
  pauseMaxMs: 1000,
  /** a piece joining the rocket: its whole move, and when it lands (the "pam") */
  joinMs: 380,
  impactMs: 230,
  /** after the hit: the praise, and the start of the flight */
  praiseAfterMs: 350,
  restAfterMs: 1300,
  /** the whole sequence lasts at least this (until the flight), and the hit comes by this at the latest */
  minTotalMs: 6000,
  hitMaxMs: 10500,
  /** the most a short routine waits before its last piece (the drums building) */
  holdMaxMs: 1500,
} as const;

export interface GroupBeats {
  /** when each of its exercises is crossed off */
  crosses: number[];
  /** its label gets its tick (its last line is drawn) */
  ackAt: number;
  /** its piece starts to come in, and lands */
  joinAt: number;
  impactAt: number;
}

export interface EndTimeline {
  groups: GroupBeats[];
  step: number;
  rollAt: number;
  /** the last piece lands with the drum's hit; "¡Hecho!" appears */
  hitAt: number;
  praiseAt: number;
  /** the rocket takes off and flies round the screen */
  restAt: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function build(counts: number[], step: number, hold: number): EndTimeline {
  const G = counts.length;
  const pause = clamp(END.pauseBudgetMs / Math.max(1, G), END.pauseMinMs, END.pauseMaxMs);
  // before a join: its last line is drawn, and a breath; after it: the piece has settled
  const before = Math.max(END.strikeMs + 80, pause * 0.45);
  const after = Math.max(END.joinMs - END.impactMs + 40, pause * 0.55);
  let t = END.crossAt + Math.max(0, 3 - G) * END.crossAtPerMissingGroup;
  const groups: GroupBeats[] = counts.map((count, i) => {
    const crosses = Array.from({ length: count }, (_, k) => Math.round(t + k * step));
    const last = crosses[crosses.length - 1] ?? t;
    const joinAt = Math.round(last + before + (i === G - 1 ? hold : 0));
    const impactAt = joinAt + END.impactMs;
    t = impactAt + after;
    return { crosses, ackAt: last + END.strikeMs, joinAt, impactAt };
  });
  const hitAt = groups.at(-1)?.impactAt ?? END.crossAt;
  return { groups, step, rollAt: END.rollAt, hitAt, praiseAt: hitAt + END.praiseAfterMs, restAt: hitAt + END.restAfterMs };
}

/** The timeline for groups of `counts` exercises (in the order they are crossed off). */
export function endTimeline(counts: number[]): EndTimeline {
  const sizes = counts.map((c) => Math.max(1, Math.round(c)));
  const N = sizes.reduce((a, b) => a + b, 0);
  let step = clamp(END.crossBudgetMs / Math.max(1, N), END.stepMinMs, END.stepMaxMs);
  let tl = build(sizes, step, 0);
  // a very long routine crosses off faster, so the hit never comes too late
  const gaps = N - sizes.length;
  if (tl.hitAt > END.hitMaxMs && gaps > 0) {
    step = Math.max(END.stepFloorMs, step - (tl.hitAt - END.hitMaxMs) / gaps);
    tl = build(sizes, step, 0);
  }
  // a short one holds before its last piece, the drums building
  if (tl.restAt < END.minTotalMs) tl = build(sizes, step, Math.min(END.holdMaxMs, END.minTotalMs - tl.restAt));
  return tl;
}

/** Where the sequence is at `t` ms. */
export interface EndState {
  /** how many exercises are crossed off (in list order) */
  crossed: number;
  /** how many groups have their tick */
  acked: number;
  /** how many pieces have started to join, and have landed */
  joined: number;
  landed: number;
  /** the drum roll sounds */
  rolling: boolean;
  title: boolean;
  praise: boolean;
  /** the rocket flies round the screen */
  resting: boolean;
}

const count = (times: number[], t: number) => times.filter((at) => at <= t).length;

export function endStateAt(tl: EndTimeline, t: number): EndState {
  return {
    crossed: count(
      tl.groups.flatMap((g) => g.crosses),
      t,
    ),
    acked: count(
      tl.groups.map((g) => g.ackAt),
      t,
    ),
    joined: count(
      tl.groups.map((g) => g.joinAt),
      t,
    ),
    landed: count(
      tl.groups.map((g) => g.impactAt),
      t,
    ),
    rolling: t >= tl.rollAt && t < tl.hitAt,
    title: t >= tl.hitAt,
    praise: t >= tl.praiseAt,
    resting: t >= tl.restAt,
  };
}

/** The end of the sequence (reduced motion shows it from the start). */
export const finalEndState = (tl: EndTimeline): EndState => endStateAt(tl, Number.POSITIVE_INFINITY);

export const sameEndState = (a: EndState, b: EndState) =>
  a.crossed === b.crossed &&
  a.acked === b.acked &&
  a.joined === b.joined &&
  a.landed === b.landed &&
  a.rolling === b.rolling &&
  a.title === b.title &&
  a.praise === b.praise &&
  a.resting === b.resting;

/** The rocket at `joined` pieces: how many stages it has on, and whether its boosters are. */
export function rocketAt(groups: EndGroup[], joined: number): { stages: number; boosters: boolean } {
  const done = groups.slice(0, joined);
  return { stages: 1 + done.filter((g) => g.piece === 'stage').length, boosters: done.some((g) => g.piece === 'boosters') };
}

/** How many stages the finished rocket has: one per block (at least one). */
export const stagesOf = (groups: EndGroup[]) => Math.max(1, groups.filter((g) => g.piece !== 'boosters').length);

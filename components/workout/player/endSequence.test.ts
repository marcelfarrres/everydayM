import { describe, expect, it } from 'vitest';
import type { Exercise, RoutineItem } from '@/types/workout';
import { END, endGroups, endStateAt, endTimeline, finalEndState, rocketAt, stagesOf, type EndTimeline } from './endSequence';

const ex = (id: string): Exercise => ({ id, title: id, type: 'workout', video_url: '', muscle: '', difficulty: 5, duration_seconds: 40 });
const warm = (id: string): RoutineItem => ({ kind: 'warmup', exercise: ex(id) });
const serie = (round: number, i: number): RoutineItem => ({
  kind: 'workout',
  exercise: ex(`b${round}-${i}`),
  round,
  totalRounds: 9,
  exerciseIndexInRound: i,
  totalExercisesPerRound: 9,
});
const rest = { kind: 'rest', duration: 20 } as unknown as RoutineItem;
const outro = { kind: 'outro', duration: 8 } as unknown as RoutineItem;

/** A routine: `warmups` warm-up clips, then `blocks` blocks of `per` series. */
function routine(warmups: number, blocks: number, per: number): RoutineItem[] {
  const q: RoutineItem[] = Array.from({ length: warmups }, (_, i) => warm(`w${i}`));
  for (let b = 1; b <= blocks; b++) {
    q.push(rest);
    for (let i = 1; i <= per; i++) q.push(serie(b, i), rest);
  }
  q.push(outro);
  return q;
}

/** Every beat, in the order it must happen, as [what, start, end]. */
function beats(tl: EndTimeline): [string, number, number][] {
  const out: [string, number, number][] = [];
  tl.groups.forEach((g, i) => {
    g.crosses.forEach((at, k) => out.push([`cross ${i}.${k}`, at, at]));
    out.push([`ack ${i}`, g.ackAt, g.ackAt]);
    out.push([`join ${i}`, g.joinAt, g.joinAt + END.joinMs]);
  });
  return out;
}

const SHAPES: [string, number[]][] = [];
for (const warmups of [0, 2, 4]) {
  for (let blocks = 1; blocks <= 5; blocks++) {
    for (const per of [3, 6]) {
      SHAPES.push([`${warmups} warm-up · ${blocks}×${per}`, [...(warmups ? [warmups] : []), ...Array(blocks).fill(per)]]);
    }
  }
}

describe('endGroups', () => {
  it('lists the warm-up first, then each block, in the order they were done, each with its piece', () => {
    const groups = endGroups(routine(3, 3, 4));
    expect(groups.map((g) => g.label)).toEqual(['Calentamiento', 'Bloque 1', 'Bloque 2', 'Bloque 3']);
    expect(groups.map((g) => g.piece)).toEqual(['boosters', 'pulse', 'stage', 'stage']);
    expect(groups.map((g) => g.exercises.length)).toEqual([3, 4, 4, 4]);
    expect(groups[2].exercises.map((e) => e.id)).toEqual(['b2-1', 'b2-2', 'b2-3', 'b2-4']);
    expect(stagesOf(groups)).toBe(3);
  });

  it('without a warm-up, the first block is the stage the rocket arrived with', () => {
    const groups = endGroups(routine(0, 2, 3));
    expect(groups.map((g) => g.piece)).toEqual(['pulse', 'stage']);
  });
});

describe('the rocket as the pieces join', () => {
  it('arrives as one stage; the warm-up adds the boosters, block 1 nothing new, each other block a stage', () => {
    const groups = endGroups(routine(2, 3, 3));
    expect(rocketAt(groups, 0)).toEqual({ stages: 1, boosters: false });
    expect(rocketAt(groups, 1)).toEqual({ stages: 1, boosters: true });
    expect(rocketAt(groups, 2)).toEqual({ stages: 1, boosters: true });
    expect(rocketAt(groups, 3)).toEqual({ stages: 2, boosters: true });
    expect(rocketAt(groups, 4)).toEqual({ stages: 3, boosters: true });
  });
});

describe('endTimeline', () => {
  it.each(SHAPES)('%s: every beat in order, none overlapping, within the time limits', (_, counts) => {
    const tl = endTimeline(counts);
    expect(tl.groups.map((g) => g.crosses.length)).toEqual(counts);
    // the roll starts before anything is crossed off, after the rocket has nearly arrived
    expect(tl.rollAt).toBeLessThan(tl.groups[0].crosses[0]);
    expect(tl.groups[0].crosses[0]).toBeGreaterThanOrEqual(END.flyInMs);
    const list = beats(tl);
    for (let i = 1; i < list.length; i++) {
      const [what, at] = list[i];
      const [before, , beforeEnds] = list[i - 1];
      // each beat after the one before it; a join only once the last line is drawn, the next
      // group's crossing only once the join is over
      expect(at, `${what} after ${before}`).toBeGreaterThan(list[i - 1][1]);
      if (what.startsWith('join') || what.startsWith('cross')) expect(at, `${what} after ${before} ends`).toBeGreaterThanOrEqual(beforeEnds);
    }
    // crossed off briskly
    expect(tl.step).toBeGreaterThanOrEqual(END.stepMinMs);
    expect(tl.step).toBeLessThanOrEqual(END.stepMaxMs);
    // the hit is the last piece landing, "¡Hecho!" with it, the praise and the flight after
    expect(tl.hitAt).toBe(tl.groups.at(-1)!.impactAt);
    expect(tl.praiseAt).toBeGreaterThan(tl.hitAt);
    expect(tl.restAt).toBeGreaterThan(tl.praiseAt);
    // 6–10 s for the sequence (11 s at the very most), never more than 12
    expect(tl.restAt).toBeGreaterThanOrEqual(END.minTotalMs);
    expect(tl.restAt).toBeLessThanOrEqual(11_000);
    if (counts.length >= 2 && counts.reduce((a, b) => a + b, 0) <= 24) expect(tl.restAt).toBeLessThanOrEqual(10_000);
  });

  it('a typical routine (3 warm-up, 3 blocks of 4) crosses off at 180 ms and is done in about 8 s', () => {
    const tl = endTimeline([3, 4, 4, 4]);
    expect(tl.step).toBe(180);
    expect(tl.restAt).toBeGreaterThan(7000);
    expect(tl.restAt).toBeLessThan(9000);
  });

  it('a routine far longer than usual crosses off faster, so the hit still comes in time', () => {
    const tl = endTimeline([6, 8, 8, 8, 8, 8, 8]);
    expect(tl.step).toBeLessThan(END.stepMinMs);
    expect(tl.step).toBeGreaterThanOrEqual(END.stepFloorMs);
    expect(tl.hitAt).toBeLessThanOrEqual(END.hitMaxMs + 1);
    expect(tl.restAt).toBeLessThanOrEqual(12_000);
  });

  it('a short routine holds before its last piece, the drums building, so it still takes 6 s', () => {
    const tl = endTimeline([3]);
    const g = tl.groups[0];
    expect(g.joinAt - g.crosses[2]).toBeGreaterThan(1000);
    expect(tl.restAt).toBe(END.minTotalMs);
  });
});

describe('endStateAt', () => {
  const tl = endTimeline([2, 3, 3]);
  it('starts with nothing done and the rocket on its way', () => {
    expect(endStateAt(tl, 0)).toEqual({ crossed: 0, acked: 0, joined: 0, landed: 0, rolling: false, title: false, praise: false, resting: false });
    expect(endStateAt(tl, END.rollAt).rolling).toBe(true);
  });

  it('crosses off one at a time, then ticks the group, then its piece joins and lands', () => {
    const g = tl.groups[0];
    expect(endStateAt(tl, g.crosses[0]).crossed).toBe(1);
    expect(endStateAt(tl, g.crosses[1]).crossed).toBe(2);
    expect(endStateAt(tl, g.ackAt - 1).acked).toBe(0);
    expect(endStateAt(tl, g.ackAt).acked).toBe(1);
    expect(endStateAt(tl, g.joinAt).joined).toBe(1);
    expect(endStateAt(tl, g.joinAt).landed).toBe(0);
    expect(endStateAt(tl, g.impactAt).landed).toBe(1);
  });

  it('stops the roll on the hit, shows "¡Hecho!" with it, and is all done at the end (a hidden page lands there)', () => {
    expect(endStateAt(tl, tl.hitAt - 1).rolling).toBe(true);
    const hit = endStateAt(tl, tl.hitAt);
    expect(hit.rolling).toBe(false);
    expect(hit.title).toBe(true);
    expect(hit.praise).toBe(false);
    const end = endStateAt(tl, 60_000);
    expect(end).toEqual(finalEndState(tl));
    expect(end).toEqual({ crossed: 8, acked: 3, joined: 3, landed: 3, rolling: false, title: true, praise: true, resting: true });
  });
});

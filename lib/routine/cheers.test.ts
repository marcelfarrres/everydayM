import { describe, expect, it } from 'vitest';
import { buildRoutine } from './buildRoutine';
import {
  HIT_MIN_SECONDS_LEFT,
  HIT_WORDS,
  hitIsDue,
  planCheerHits,
  type CheerHit,
  type HitGroup,
} from './cheers';
import { exercise, gluteIntent, library, seeded } from './fixtures.test-helpers';
import type { RoutineItem } from '@/types/workout';

const routine = (rounds: number, exercisesPerRound: number, seed = 1, seconds?: number): RoutineItem[] => {
  const lib = seconds
    ? library().map((e) => (e.type === 'workout' ? exercise(e.id, ['gluteos'], { seconds }) : e))
    : library();
  return buildRoutine(lib, gluteIntent({ rounds, exercisesPerRound }), seeded(seed)).queue;
};

const seriesOf = (queue: RoutineItem[]) => queue.flatMap((q, i) => (q.kind === 'workout' ? [i] : []));

/** Every shape from 1x1 to 4x5, each with several seeds. */
function* cases(): Generator<{ queue: RoutineItem[]; hits: CheerHit[]; series: number[] }> {
  for (let rounds = 1; rounds <= 4; rounds++) {
    for (let per = 1; per <= 5; per++) {
      for (let seed = 1; seed <= 12; seed++) {
        const queue = routine(rounds, per, seed);
        yield { queue, hits: planCheerHits(queue, seeded(seed * 97)), series: seriesOf(queue) };
      }
    }
  }
}

describe('golpes: which series', () => {
  it('only lands on series, always on the last one, never on two in a row', () => {
    for (const { queue, hits, series } of cases()) {
      expect(hits.length).toBeGreaterThan(0);
      for (const hit of hits) expect(queue[hit.queueIndex].kind).toBe('workout');
      expect(hits.at(-1)?.queueIndex).toBe(series.at(-1));
      const places = hits.map((h) => series.indexOf(h.queueIndex));
      expect(new Set(places).size).toBe(places.length);
      for (let i = 1; i < places.length; i++) {
        const gap = places[i] - places[i - 1];
        expect(gap).toBeGreaterThanOrEqual(2);
        expect(gap).toBeLessThanOrEqual(3);
      }
      // nothing left out at the start: the first hit is within the first three series
      expect(places[0]).toBeLessThanOrEqual(2);
    }
  });

  it('hits about one serie in every two or three', () => {
    let hitCount = 0;
    let serieCount = 0;
    for (const { hits, series } of cases()) {
      const n = series.length;
      expect(hits.length).toBeGreaterThanOrEqual(Math.ceil(n / 3));
      expect(hits.length).toBeLessThanOrEqual(Math.ceil(n / 2));
      hitCount += hits.length;
      serieCount += n;
    }
    const share = hitCount / serieCount;
    expect(share).toBeGreaterThan(1 / 3);
    expect(share).toBeLessThan(1 / 2 + 0.1);
  });
});

describe('golpes: words', () => {
  it('keeps every word short enough for the burst', () => {
    const all = Object.values(HIT_WORDS).flat();
    expect(all.length).toBeGreaterThanOrEqual(25);
    expect(all.length).toBeLessThanOrEqual(30);
    for (const word of all) expect([...word].length).toBeLessThanOrEqual(10);
    expect(new Set(all).size).toBe(all.length);
  });

  it('takes the word from the group of its moment and place', () => {
    for (const { queue, hits } of cases()) {
      hits.forEach((hit, i) => {
        const item = queue[hit.queueIndex];
        if (item.kind !== 'workout') throw new Error('not a serie');
        const isLast = i === hits.length - 1;
        const next = queue.find((q, j) => j > hit.queueIndex && q.kind === 'workout');
        const blockEnd = next?.kind === 'workout' && next.round !== item.round;
        const expected: HitGroup = isLast ? 'routineEnd' : blockEnd ? 'blockEnd' : hit.moment;
        expect(hit.group).toBe(expected);
        expect(HIT_WORDS[hit.group]).toContain(hit.word);
        // the "10 seconds" words only with 10 s left
        if (HIT_WORDS.ten.includes(hit.word)) expect(hit.moment).toBe('ten');
      });
    }
  });

  it('never says the same word twice in a row, nor twice while others are left', () => {
    for (const { hits } of cases()) {
      for (let i = 1; i < hits.length; i++) expect(hits[i].word).not.toBe(hits[i - 1].word);
      const byGroup = new Map<HitGroup, string[]>();
      for (const hit of hits) byGroup.set(hit.group, [...(byGroup.get(hit.group) ?? []), hit.word]);
      for (const [group, words] of byGroup) {
        const distinct = new Set(words).size;
        expect(distinct).toBe(Math.min(words.length, HIT_WORDS[group].length));
      }
    }
  });

  it('uses both moments, and the middle only for short clips', () => {
    const moments = new Set<string>();
    for (const { hits } of cases()) hits.forEach((h) => moments.add(h.moment));
    expect(moments).toEqual(new Set(['mid', 'ten']));
    const short = routine(3, 4, 5, 15);
    for (const hit of planCheerHits(short, seeded(3))) expect(hit.moment).toBe('mid');
  });

  it('gives the same plan for the same seed and another for another seed', () => {
    const queue = routine(4, 4, 9);
    expect(planCheerHits(queue, seeded(42))).toEqual(planCheerHits(queue, seeded(42)));
    const plans = [1, 2, 3, 4, 5].map((s) => JSON.stringify(planCheerHits(queue, seeded(s))));
    expect(new Set(plans).size).toBeGreaterThan(1);
  });

  it('plans nothing for a routine with no series', () => {
    const queue = routine(1, 1).filter((q) => q.kind !== 'workout');
    expect(planCheerHits(queue, seeded(1))).toEqual([]);
  });
});

describe('golpes: the moment in the serie', () => {
  const dueSeconds = (moment: 'mid' | 'ten', total: number) =>
    Array.from({ length: total + 1 }, (_, left) => left).filter((left) => hitIsDue(moment, left, total));

  it('comes with about 10 s left, or around the middle', () => {
    expect(dueSeconds('ten', 45)).toEqual([8, 9, 10]);
    expect(dueSeconds('mid', 45)).toEqual([20, 21, 22]);
    expect(dueSeconds('mid', 60)).toEqual([28, 29, 30]);
  });

  it('never overlaps the 3-2-1 beeps, nor the first seconds of the clip', () => {
    for (let total = 1; total <= 90; total++) {
      for (const moment of ['mid', 'ten'] as const) {
        for (const left of dueSeconds(moment, total)) {
          expect(left).toBeGreaterThanOrEqual(HIT_MIN_SECONDS_LEFT);
          expect(total - left).toBeGreaterThanOrEqual(2);
        }
      }
    }
    expect(dueSeconds('mid', 10)).toEqual([]);
  });
});

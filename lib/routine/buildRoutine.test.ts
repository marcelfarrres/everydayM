import { describe, expect, it } from 'vitest';
import { buildRoutine } from './buildRoutine';
import { cheerFor } from './cheers';
import {
  BETWEEN_BLOCKS_MIN_SECONDS,
  BETWEEN_BLOCKS_TALK_SECONDS,
  BLOCK_END_EXTRA_MS,
  BLOCK_END_LEAD_MS,
  TALK_LEAD_MS,
  getBlockEndRestBase,
  getLongRestSeconds,
  getItemDuration,
  getLongRestBase,
  getRestDuration,
  getTalkRestSeconds,
} from './duration';
import { restClipOf } from './restClips';
import { solveForMinutes } from './solveForMinutes';
import { talksSeconds } from './talks';
import {
  exercise,
  gluteIntent,
  ids,
  library,
  rests,
  seeded,
} from './fixtures.test-helpers';
import type { RoutineItem } from '@/types/workout';

const workouts = (queue: RoutineItem[]) => queue.filter((item) => item.kind === 'workout');

describe('shape: blocks and series', () => {
  it('honours explicit blocks and series per block with a time target', () => {
    const { meta, queue } = buildRoutine(
      library(),
      gluteIntent({ targetMinutes: 30, rounds: 4, exercisesPerRound: 3 }),
      seeded(1),
    );
    expect(meta.rounds).toBe(4);
    expect(meta.exercisesPerRound).toBe(3);
    expect(meta.blocks).toHaveLength(4);
    meta.blocks.forEach((block) => expect(block).toHaveLength(3));
    expect(workouts(queue)).toHaveLength(12);
  });

  it('honours explicit values without a time target', () => {
    const { meta } = buildRoutine(library(), gluteIntent({ rounds: 2, exercisesPerRound: 6 }), seeded(2));
    expect(meta.rounds).toBe(2);
    meta.blocks.forEach((block) => expect(block).toHaveLength(6));
  });

  it('keeps explicit blocks while the solver picks the series', () => {
    for (const minutes of [15, 30, 50]) {
      const { meta } = buildRoutine(library(), gluteIntent({ targetMinutes: minutes, rounds: 5 }), seeded(3));
      expect(meta.rounds).toBe(5);
    }
  });

  it('still lets the solver choose when nothing is explicit', () => {
    const short = buildRoutine(library(), gluteIntent({ targetMinutes: 12 }), seeded(4)).meta;
    const long = buildRoutine(library(), gluteIntent({ targetMinutes: 45 }), seeded(4)).meta;
    expect(long.rounds * long.exercisesPerRound).toBeGreaterThan(short.rounds * short.exercisesPerRound);
  });
});

describe('rests', () => {
  it('marks the rest before the first serie of each block as long, every other as short', () => {
    const { queue } = buildRoutine(library(), gluteIntent({ rounds: 3, exercisesPerRound: 4 }), seeded(5));
    queue.forEach((item, index) => {
      if (item.kind !== 'rest') return;
      const next = queue[index + 1];
      expect(next.kind).toBe('workout');
      if (next.kind !== 'workout') return;
      expect(item.restKind).toBe(next.exerciseIndexInRound === 1 ? 'long' : 'short');
      expect(item.nextExercise.id).toBe(next.exercise.id);
      if (item.restKind === 'short') {
        expect(item.talks).toEqual([]);
        expect(item.duration).toBe(getRestDuration(5));
      }
    });
    expect(rests(queue).filter((r) => r.restKind === 'long')).toHaveLength(3); // warm-up→1, 1→2, 2→3
  });

  it('adds a long rest between the warm-up and block 1, only when there is a warm-up', () => {
    const withWarmup = buildRoutine(library(), gluteIntent({ rounds: 2, exercisesPerRound: 3 }), seeded(6));
    const warmups = withWarmup.meta.warmups.length;
    expect(warmups).toBeGreaterThan(0);
    const rest = withWarmup.queue[warmups];
    expect(rest.kind).toBe('rest');
    if (rest.kind === 'rest') {
      expect(rest.restKind).toBe('long');
      expect(rest.nextRound).toBe(1);
      expect(rest.isEndOfRound).toBe(false);
      expect(rest.nextExercise.id).toBe(withWarmup.meta.blocks[0][0].id);
    }

    const without = buildRoutine(
      library(),
      gluteIntent({ rounds: 2, exercisesPerRound: 3, includeWarmup: false }),
      seeded(6),
    );
    expect(without.meta.warmups).toHaveLength(0);
    expect(without.queue[0].kind).toBe('workout');
    expect(rests(without.queue).filter((r) => r.restKind === 'long')).toHaveLength(1);
  });

  it('points the rest at the end of a block at the first serie of the next block', () => {
    const { queue, meta } = buildRoutine(
      library(),
      gluteIntent({ rounds: 4, exercisesPerRound: 3, variation: 'all' }),
      seeded(7),
    );
    for (const rest of rests(queue).filter((r) => r.isEndOfRound)) {
      expect(rest.nextExercise.id).toBe(meta.blocks[rest.nextRound - 1][0].id);
    }
  });
});

describe('talks in long rests', () => {
  it('never repeats a talk within a routine; the talks of the coming block first, then of later blocks', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const { queue, meta } = buildRoutine(
        library({ talks: [14] }),
        gluteIntent({ rounds: 4, exercisesPerRound: 3, variation: seed % 2 ? 'same' : 'some' }),
        seeded(seed),
      );
      const seen = new Set<string>();
      for (const rest of rests(queue)) {
        if (rest.restKind === 'short') continue;
        if (!rest.isEndOfRound) expect(rest.talks.length).toBeLessThanOrEqual(2);
        else expect(talksSeconds(rest.talks)).toBeLessThanOrEqual(Math.max(BETWEEN_BLOCKS_TALK_SECONDS, talksSeconds(rest.talks.slice(0, 1))));
        const blockIds = new Set(ids(meta.blocks[rest.nextRound - 1]));
        const laterIds = new Set(meta.blocks.slice(rest.nextRound - 1).flatMap((b) => ids(b)));
        let ownFirst = true;
        for (const t of rest.talks) {
          expect(seen.has(t.id)).toBe(false);
          seen.add(t.id);
          if (!rest.isEndOfRound) expect(blockIds.has(t.exercise_id)).toBe(true);
          else {
            expect(laterIds.has(t.exercise_id)).toBe(true);
            // (the coming block's talks come before any later block's)
            if (!blockIds.has(t.exercise_id)) ownFirst = false;
            else expect(ownFirst).toBe(true);
          }
        }
      }
    }
  });

  it('gives 1 or 2 talks when there are some, and none once they run out', () => {
    // One exercise with two talks, repeated in every block: the talks run out after the first long rests.
    const lib = [exercise('solo', ['gluteos'], { talks: [10, 12] }), exercise('w1', [], { type: 'warmup' })];
    const counts = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const { queue } = buildRoutine(lib, gluteIntent({ rounds: 4, exercisesPerRound: 1 }), seeded(seed));
      const longRests = rests(queue).filter((r) => r.restKind === 'long');
      expect(longRests[0].talks.length).toBeGreaterThanOrEqual(1);
      expect(longRests.flatMap((r) => r.talks)).toHaveLength(2);
      counts.add(longRests[0].talks.length);
    }
    expect(counts).toEqual(new Set([1, 2]));
  });

  it('keeps every rest the decided length, whatever the clips last (a clip lasts what it lasts)', () => {
    const lib = library().map((e, i) => ({ ...e, duration_seconds: [20, 32, 45, 60][i % 4] }));
    const { queue, meta } = buildRoutine(lib, gluteIntent({ rounds: 3, exercisesPerRound: 4 }), seeded(3));
    const base = getRestDuration(5);
    for (const rest of rests(queue)) {
      expect(rest.prepSeconds).toBe(0);
      if (rest.restKind === 'short') expect(rest.duration).toBe(base);
      else if (rest.talks.length === 0) expect(rest.duration).toBe(rest.isEndOfRound ? Math.max(BETWEEN_BLOCKS_MIN_SECONDS, getBlockEndRestBase(base)) : getBlockEndRestBase(base));
    }
    // each serie lasts its clip
    queue.forEach((item) => {
      if (item.kind === 'workout') expect(getItemDuration(item, meta.slotSeconds)).toBe(item.exercise.duration_seconds);
    });
  });

  it('makes a long rest last at least its usual time and at least its talks after the clouds open', () => {
    const base = getLongRestBase(getRestDuration(5));
    let stretched = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const { queue } = buildRoutine(
        library({ talks: [25, 31.5] }),
        gluteIntent({ rounds: 3, exercisesPerRound: 3 }),
        seeded(seed),
      );
      for (const rest of rests(queue).filter((r) => r.restKind === 'long')) {
        const talkSum = rest.talks.reduce((acc, t) => acc + t.duration_seconds, 0);
        // after a block its clouds last longer, and so does the rest
        const usual = rest.isEndOfRound ? getBlockEndRestBase(getRestDuration(5)) : base;
        const lead = rest.isEndOfRound ? BLOCK_END_LEAD_MS : TALK_LEAD_MS;
        expect(rest.duration).toBeGreaterThanOrEqual(usual);
        // the talks start when the clouds open
        expect(rest.duration * 1000).toBeGreaterThanOrEqual(lead + talkSum * 1000);
        expect(Number.isInteger(rest.duration)).toBe(true);
        if (rest.talks.length > 0 && rest.duration > usual) stretched++;
        // without talks to fit, exactly its usual time
        if (rest.talks.length === 0) expect(rest.duration).toBe(usual);
      }
    }
    expect(stretched).toBeGreaterThan(0); // the talks really set the length somewhere
  });

  it('gives the rest after a block its longer clouds (3.5 s), before the talks and in the countdown', () => {
    expect(BLOCK_END_EXTRA_MS).toBe(3500);
    expect(BLOCK_END_LEAD_MS).toBe(TALK_LEAD_MS + BLOCK_END_EXTRA_MS);
    expect(getBlockEndRestBase(15)).toBe(getLongRestBase(15) + 4);
    expect(getTalkRestSeconds(25, BLOCK_END_LEAD_MS)).toBe(Math.ceil(25 + BLOCK_END_LEAD_MS / 1000));
    // after the warm-up: the longer clouds too, no minimum
    expect(getLongRestSeconds(15, 0, false)).toBe(getBlockEndRestBase(15));
    expect(getLongRestSeconds(15, 40, false)).toBe(getTalkRestSeconds(40, BLOCK_END_LEAD_MS));
    // between blocks: at least a minute, longer only if its talks need it
    expect(BETWEEN_BLOCKS_MIN_SECONDS).toBe(60);
    expect(getLongRestSeconds(15, 0, true)).toBe(60);
    expect(getLongRestSeconds(15, BETWEEN_BLOCKS_TALK_SECONDS, true)).toBe(60);
    expect(getLongRestSeconds(15, 70, true)).toBe(getTalkRestSeconds(70, BLOCK_END_LEAD_MS));
    expect(BETWEEN_BLOCKS_TALK_SECONDS * 1000 + BLOCK_END_LEAD_MS).toBeLessThanOrEqual(60_000);
  });

  it('adds the lead time only when there are talks', () => {
    expect(getTalkRestSeconds(0)).toBe(0);
    expect(getTalkRestSeconds(25)).toBe(Math.ceil(25 + TALK_LEAD_MS / 1000));
    expect(getTalkRestSeconds(30) * 1000).toBeGreaterThanOrEqual(30_000 + TALK_LEAD_MS);
  });

  it('leaves long rests without talks when the library has none', () => {
    const { queue } = buildRoutine(library(), gluteIntent({ rounds: 3, exercisesPerRound: 3 }), seeded(8));
    for (const rest of rests(queue)) expect(rest.talks).toEqual([]);
  });
});

describe('durations', () => {
  it('makes totalSeconds exactly the sum of the queue', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const { queue, meta } = buildRoutine(
        library({ talks: [17, 40] }),
        gluteIntent({ targetMinutes: 20 + seed, variation: seed % 3 === 0 ? 'all' : 'some' }),
        seeded(seed),
      );
      const sum = queue.reduce((acc, item) => acc + getItemDuration(item, meta.slotSeconds), 0);
      expect(meta.totalSeconds).toBe(sum);
    }
  });

  it('estimates in solveForMinutes exactly what the queue lasts when clips are uniform', () => {
    const { meta } = buildRoutine(
      library(),
      gluteIntent({ targetMinutes: 25, variation: 'same' }),
      seeded(9),
    );
    const estimate = solveForMinutes({
      targetMinutes: 25,
      difficulty: meta.difficulty,
      slotSeconds: meta.slotSeconds,
      candidateExercises: meta.blocks[0],
      warmups: meta.warmups,
      includeWarmup: true,
      minRounds: meta.rounds,
      maxRounds: meta.rounds,
      minExercisesPerRound: meta.exercisesPerRound,
      maxExercisesPerRound: meta.exercisesPerRound,
    });
    expect(estimate.estimatedSeconds).toBe(meta.totalSeconds);
  });
});

describe('variation between blocks', () => {
  const shape = { rounds: 4, exercisesPerRound: 4 };

  it("'same' repeats the circuit in every block", () => {
    const { meta } = buildRoutine(library(), gluteIntent({ ...shape, variation: 'same' }), seeded(10));
    for (const block of meta.blocks) expect(ids(block)).toEqual(ids(meta.blocks[0]));
  });

  it("'some' (the default) swaps one serie in each middle block for the same primary muscle", () => {
    const lib = library();
    const primaryOf = (id: string) => lib.find((e) => e.id === id)?.muscles?.[0]?.id;
    for (let seed = 1; seed <= 20; seed++) {
      const { meta } = buildRoutine(lib, gluteIntent(shape), seeded(seed));
      const circuit = ids(meta.blocks[0]);
      expect(ids(meta.blocks[3])).toEqual(circuit);
      for (const block of meta.blocks.slice(1, 3)) {
        const changed = ids(block).flatMap((id, i) => (id === circuit[i] ? [] : [i]));
        expect(changed).toHaveLength(1);
        const i = changed[0];
        expect(primaryOf(block[i].id)).toBe(primaryOf(circuit[i]));
        expect(circuit).not.toContain(block[i].id);
      }
    }
  });

  it("'some' keeps the blocks identical when there is no alternative", () => {
    const lib = [exercise('a', ['gluteos']), exercise('b', ['cuadriceps'])];
    const { meta } = buildRoutine(lib, gluteIntent({ rounds: 3, exercisesPerRound: 2 }), seeded(11));
    for (const block of meta.blocks) expect(ids(block)).toEqual(ids(meta.blocks[0]));
  });

  it("'all' gives every block other exercises for the same muscles when the library allows", () => {
    const lib = library();
    const primaryOf = (id: string) => lib.find((e) => e.id === id)?.muscles?.[0]?.id;
    const { meta } = buildRoutine(
      lib,
      gluteIntent({ rounds: 2, exercisesPerRound: 4, variation: 'all' }),
      seeded(12),
    );
    const [first, second] = meta.blocks;
    expect(ids(second).some((id) => ids(first).includes(id))).toBe(false);
    second.forEach((ex, i) => expect(primaryOf(ex.id)).toBe(primaryOf(first[i].id)));
  });

  it("'all' falls back to reusing exercises when the library runs out", () => {
    const lib = [exercise('a', ['gluteos']), exercise('b', ['gluteos']), exercise('c', ['gluteos'])];
    const { meta } = buildRoutine(
      lib,
      gluteIntent({ rounds: 4, exercisesPerRound: 2, variation: 'all' }),
      seeded(13),
    );
    expect(meta.blocks).toHaveLength(4);
    meta.blocks.forEach((block) => expect(block).toHaveLength(2));
  });

  it('only says "Mismo plan" when the block really repeats the previous one', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { queue } = buildRoutine(
        library(),
        gluteIntent({ ...shape, variation: 'all' }),
        seeded(seed),
      );
      queue.forEach((_, index) => {
        expect(cheerFor(queue, index, 3, 45)).not.toBe('Mismo plan, más ganas');
      });
    }
  });
});

describe('not the same routine every time', () => {
  it('gives different routines for different seeds and the same for the same seed', () => {
    const build = (seed: number) =>
      buildRoutine(library(), gluteIntent({ targetMinutes: 25 }), seeded(seed)).meta.blocks.map(ids);
    expect(build(21)).toEqual(build(21));
    const others = [22, 23, 24, 25].map(build);
    expect(others.some((blocks) => JSON.stringify(blocks) !== JSON.stringify(build(21)))).toBe(true);
    expect(ids(buildRoutine(library(), gluteIntent({ rounds: 1, exercisesPerRound: 4 }), seeded(1)).meta.blocks[0]))
      .not.toEqual(ids(buildRoutine(library(), gluteIntent({ rounds: 1, exercisesPerRound: 4 }), seeded(2)).meta.blocks[0]));
  });

  it('penalises recently used exercises without forbidding them', () => {
    const recent = ['g1', 'g2', 'g3', 'g4', 'g5'];
    let recentPicks = 0;
    let freshPicks = 0;
    let recentPicksWithoutHistory = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const intent = gluteIntent({ rounds: 1, exercisesPerRound: 3, includeWarmup: false });
      const picked = ids(buildRoutine(library(), intent, seeded(seed), { recentExerciseIds: recent }).meta.blocks[0]);
      recentPicks += picked.filter((id) => recent.includes(id)).length;
      freshPicks += picked.filter((id) => !recent.includes(id)).length;
      const plain = ids(buildRoutine(library(), intent, seeded(seed)).meta.blocks[0]);
      recentPicksWithoutHistory += plain.filter((id) => recent.includes(id)).length;
    }
    expect(recentPicks).toBeLessThan(freshPicks / 3);
    expect(recentPicks).toBeLessThan(recentPicksWithoutHistory / 2);
    expect(recentPicks).toBeGreaterThan(0); // penalised, not forbidden
  });

  it('still uses recent exercises when nothing else fits', () => {
    const lib = [exercise('a', ['gluteos']), exercise('b', ['gluteos'])];
    const { meta } = buildRoutine(
      lib,
      gluteIntent({ rounds: 2, exercisesPerRound: 2 }),
      seeded(1),
      { recentExerciseIds: ['a', 'b'] },
    );
    expect(ids(meta.blocks[0]).sort()).toEqual(['a', 'b']);
  });

  it('draws warm-ups at random instead of always the first ones', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const { meta } = buildRoutine(library(), gluteIntent({ rounds: 1, exercisesPerRound: 2 }), seeded(seed));
      expect(meta.warmups).toHaveLength(3);
      ids(meta.warmups).forEach((id) => seen.add(id));
    }
    expect(seen.size).toBe(4);
  });
});

describe('the rest between blocks', () => {
  it('lasts at least a minute, filled with as many talks of the coming block as fit', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { queue, meta } = buildRoutine(library({ talks: [12, 15, 9] }), gluteIntent({ rounds: 3, exercisesPerRound: 4 }), seeded(seed));
      const between = rests(queue).filter((r) => r.restKind === 'long' && r.isEndOfRound);
      expect(between.length).toBe(2);
      for (const rest of between) {
        expect(rest.duration).toBeGreaterThanOrEqual(BETWEEN_BLOCKS_MIN_SECONDS);
        expect(rest.duration * 1000).toBeGreaterThanOrEqual(BLOCK_END_LEAD_MS + talksSeconds(rest.talks) * 1000);
      }
      // more than the old 1 or 2 when there are short ones to fit
      expect(Math.max(...between.map((r) => r.talks.length))).toBeGreaterThanOrEqual(2);
      // and the minutes announced still add up
      const total = queue.reduce((acc, item) => acc + getItemDuration(item, meta.slotSeconds), 0);
      expect(meta.totalSeconds).toBe(total);
    }
  });

  it('after the warm-up: the longer clouds (talks from BLOCK_END_LEAD_MS), no minimum', () => {
    const { queue } = buildRoutine(library(), gluteIntent({ rounds: 2, exercisesPerRound: 3 }), seeded(2));
    const first = rests(queue).find((r) => r.restKind === 'long' && !r.isEndOfRound);
    if (first) expect(first.duration).toBe(getBlockEndRestBase(getRestDuration(5)));
  });
});

describe('the rest video of each long rest', () => {
  const clip = (id: string) => ({ id, video_url: `${id}.mp4`, video_lite_url: `${id}-lite.mp4`, poster_url: null, duration_seconds: 30 });
  const shape = gluteIntent({ rounds: 4, exercisesPerRound: 2 });

  it('every long rest gets one, in turn: none repeats until all have been used', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { queue } = buildRoutine(library(), shape, seeded(seed), { restClips: [clip('r1'), clip('r2'), clip('r3')] });
      const long = rests(queue).filter((r) => r.restKind === 'long');
      expect(long).toHaveLength(4); // after the warm-up and between the 4 blocks
      const picked = long.map((r) => r.restClip?.id);
      expect(new Set(picked.slice(0, 3)).size).toBe(3);
      expect(picked[3]).toBe(picked[0]);
      expect(long[0].restClip).toEqual(clip(picked[0] ?? ''));
      // short rests have none
      expect(rests(queue).filter((r) => r.restKind === 'short').every((r) => r.restClip === undefined)).toBe(true);
    }
  });

  it("without rest videos the routine's own warm-ups stand in, else any warm-up, else the next exercise", () => {
    const { queue, meta } = buildRoutine(library(), shape, seeded(3));
    const own = new Set(ids(meta.warmups));
    for (const rest of rests(queue).filter((r) => r.restKind === 'long')) expect(own.has(rest.restClip?.id ?? '')).toBe(true);

    const noWarmup = buildRoutine(library(), { ...shape, includeWarmup: false }, seeded(3)).queue;
    for (const rest of rests(noWarmup).filter((r) => r.restKind === 'long')) expect(rest.restClip?.id).toMatch(/^w\d$/);

    const bare = library().filter((e) => e.type !== 'warmup');
    const plain = buildRoutine(bare, { ...shape, includeWarmup: false }, seeded(3)).queue;
    for (const rest of rests(plain).filter((r) => r.restKind === 'long')) expect(rest.restClip?.id).toBe(rest.nextExercise.id);
  });

  it('changes nothing else of the routine', () => {
    const plain = buildRoutine(library(), shape, seeded(5));
    const withClips = buildRoutine(library(), shape, seeded(5), { restClips: [clip('r1')] });
    const strip = (queue: RoutineItem[]) => queue.map((item) => (item.kind === 'rest' ? { ...item, restClip: undefined } : item));
    expect(strip(withClips.queue)).toEqual(strip(plain.queue));
    expect(withClips.meta.totalSeconds).toBe(plain.meta.totalSeconds);
  });

  it('a routine saved before rest videos still has one at play time', () => {
    const { queue } = buildRoutine(library(), shape, seeded(2));
    const old = queue.map((item) => (item.kind === 'rest' ? { ...item, restClip: undefined } : item));
    const rest = rests(old).find((r) => r.restKind === 'long');
    const firstWarmup = old.find((item) => item.kind === 'warmup');
    if (!rest || firstWarmup?.kind !== 'warmup') throw new Error('fixture');
    expect(restClipOf(old, rest).id).toBe(firstWarmup.exercise.id);
    const noWarmups = old.filter((item) => item.kind !== 'warmup');
    expect(restClipOf(noWarmups, rest).id).toBe(rest.nextExercise.id);
  });
});

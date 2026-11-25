import { describe, expect, it } from 'vitest';
import { exercise, talk } from '@/lib/routine/fixtures.test-helpers';
import type { RoutineItem } from '@/types/workout';
import { BLOCK_END_LEAD_MS, getLongRestSeconds } from '@/lib/routine/duration';
import { finalCount, longRestPhase, plannedLongRestPhase, restScreenOf, type RestItem } from './model';

const rest = (restKind: 'short' | 'long', talks = 0): RestItem => ({
  kind: 'rest',
  duration: 20,
  prepSeconds: 0,
  nextExercise: exercise('sentadilla', ['gluteos']),
  nextRound: 1,
  totalRounds: 3,
  isEndOfRound: restKind === 'long',
  restKind,
  talks: Array.from({ length: talks }, (_, i) => talk('sentadilla', i + 1)),
});

describe('restScreenOf', () => {
  it('is null outside a rest', () => {
    const serie: RoutineItem = {
      kind: 'workout',
      exercise: exercise('sentadilla', ['gluteos']),
      round: 1,
      totalRounds: 3,
      exerciseIndexInRound: 1,
      totalExercisesPerRound: 3,
    };
    expect(restScreenOf(serie, null)).toBeNull();
    expect(restScreenOf(undefined, null)).toBeNull();
  });

  it('shows the countdown in short rests and long rests without talks', () => {
    expect(restScreenOf(rest('short'), null)).toBe('countdown');
    expect(restScreenOf(rest('long', 0), null)).toBe('countdown');
  });

  it('plays the talk of a long rest until it is done, then the countdown (computer)', () => {
    const long = rest('long', 1);
    expect(restScreenOf(long, null)).toBe('talks');
    expect(restScreenOf(long, { rest: rest('long', 1), left: 30 })).toBe('talks'); // another rest's talk finished
    expect(restScreenOf(long, { rest: long, left: 30 })).toBe('countdown');
    // (no "ready" on a computer, whatever is left)
    expect(restScreenOf(long, { rest: long, left: 3 }, false, 3)).toBe('countdown');
  });
});

describe('restScreenOf on a phone', () => {
  it('a long rest: its talk, then the rest video, then the last 5 s with the next exercise', () => {
    const long = rest('long', 1);
    expect(restScreenOf(long, null, true, 40)).toBe('talks');
    expect(restScreenOf(long, { rest: long, left: 20 }, true, 20)).toBe('resting');
    expect(restScreenOf(long, { rest: long, left: 20 }, true, 6)).toBe('resting');
    expect(restScreenOf(long, { rest: long, left: 20 }, true, 5)).toBe('ready');
    expect(restScreenOf(rest('long', 0), null, true, 30)).toBe('resting');
    expect(restScreenOf(rest('long', 0), null, true, 5)).toBe('ready');
    expect(restScreenOf({ ...rest('long', 0), isEndOfRound: false }, null, true, 30)).toBe('resting'); // after the warm-up too
    expect(restScreenOf(rest('short'), null, true, 3)).toBe('countdown');
  });

  it('a saved routine with two talks: one talk, then the rest as usual', () => {
    const old = rest('long', 2);
    expect(restScreenOf(old, null, true, 40)).toBe('talks');
    expect(restScreenOf(old, { rest: old, left: 25 }, true, 25)).toBe('resting');
  });
});

describe('longRestPhase', () => {
  it('the last 5 s are always "ready", even over a talk that runs long', () => {
    expect(longRestPhase(5, { speaking: true, endedWithLeft: null })).toBe('ready');
    expect(longRestPhase(1, { speaking: false, endedWithLeft: 30 })).toBe('ready');
    expect(longRestPhase(6, { speaking: true, endedWithLeft: null })).toBe('talk');
  });

  it('skips the rest video when less than 4 s of it would be left after the talk', () => {
    // ended with 9 s left: 4 s of rest video, then the last 5 s
    expect(longRestPhase(9, { speaking: false, endedWithLeft: 9 })).toBe('resting');
    expect(longRestPhase(6, { speaking: false, endedWithLeft: 9 })).toBe('resting');
    // ended with 8 s left: only 3 s, so straight to "ready", no flash of the rest video
    expect(longRestPhase(8, { speaking: false, endedWithLeft: 8 })).toBe('ready');
    expect(longRestPhase(7, { speaking: false, endedWithLeft: 8 })).toBe('ready');
    // no talk: the rest video until the last 5 s
    expect(longRestPhase(6, { speaking: false, endedWithLeft: null })).toBe('resting');
  });
});

describe('plannedLongRestPhase', () => {
  const openS = BLOCK_END_LEAD_MS / 1000;
  const phases = (duration: number, talkS: number) => {
    const out: string[] = [];
    for (let t = 0; t < duration; t += 0.5) {
      const p = plannedLongRestPhase(t, { duration, openS, talkS });
      if (out.at(-1) !== p) out.push(p);
    }
    return out;
  };

  it('between blocks with a short talk: clouds, talk, rest video, ready', () => {
    const duration = getLongRestSeconds(15, 15, true);
    expect(duration).toBe(60);
    expect(phases(duration, 15)).toEqual(['clouds', 'talk', 'resting', 'ready']);
    expect(plannedLongRestPhase(duration - 5, { duration, openS, talkS: 15 })).toBe('ready');
    expect(plannedLongRestPhase(duration - 5.5, { duration, openS, talkS: 15 })).toBe('resting');
  });

  it('a talk longer than the rest: the rest stretches so it plays whole, then straight to ready', () => {
    const duration = getLongRestSeconds(15, 70, true);
    expect(duration).toBeGreaterThan(60);
    expect(phases(duration, 70)).toEqual(['clouds', 'talk', 'ready']);
    // the talk is never cut by the last seconds
    expect(plannedLongRestPhase(openS + 69.9, { duration, openS, talkS: 70 })).toBe('talk');
  });

  it('without a talk: clouds, the rest video, ready', () => {
    const duration = getLongRestSeconds(15, 0, false);
    expect(phases(duration, 0)).toEqual(['clouds', 'resting', 'ready']);
  });
});

describe('finalCount', () => {
  it('3, 2, 1 over a talk, the rest video or the last seconds, nothing elsewhere', () => {
    expect(finalCount('talks', 3)).toBe(3);
    expect(finalCount('resting', 2)).toBe(2);
    expect(finalCount('ready', 1)).toBe(1);
    expect(finalCount('ready', 4)).toBeNull();
    expect(finalCount('resting', 0)).toBeNull();
    expect(finalCount('countdown', 2)).toBeNull();
    expect(finalCount(null, 2)).toBeNull();
  });
});

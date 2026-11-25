import { describe, expect, it } from 'vitest';
import { exercise, talk } from '@/lib/routine/fixtures.test-helpers';
import type { RoutineItem } from '@/types/workout';
import { finalCount, restScreenOf, type RestItem } from './model';

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

  it('plays the talks of a long rest until they are done, then the countdown', () => {
    const long = rest('long', 2);
    expect(restScreenOf(long, null)).toBe('talks');
    expect(restScreenOf(long, rest('long', 1))).toBe('talks'); // another rest's talks finished
    expect(restScreenOf(long, long)).toBe('countdown');
  });
});

describe('restScreenOf on a phone', () => {
  it('a long rest: its talks, then the rest video (never the block preview or the centre countdown)', () => {
    const long = rest('long', 2);
    expect(restScreenOf(long, null, true)).toBe('talks');
    expect(restScreenOf(long, long, true)).toBe('resting');
    expect(restScreenOf(rest('long', 0), null, true)).toBe('resting');
    expect(restScreenOf({ ...rest('long', 0), isEndOfRound: false }, null, true)).toBe('resting'); // after the warm-up too
    expect(restScreenOf(rest('short'), null, true)).toBe('countdown');
  });
});

describe('finalCount', () => {
  it('3, 2, 1 over a talk or the rest video, nothing elsewhere', () => {
    expect(finalCount('talks', 3)).toBe(3);
    expect(finalCount('resting', 2)).toBe(2);
    expect(finalCount('resting', 1)).toBe(1);
    expect(finalCount('resting', 4)).toBeNull();
    expect(finalCount('resting', 0)).toBeNull();
    expect(finalCount('countdown', 2)).toBeNull();
    expect(finalCount(null, 2)).toBeNull();
  });
});

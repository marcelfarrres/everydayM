import { describe, expect, it } from 'vitest';
import { exercise, talk } from '@/lib/routine/fixtures.test-helpers';
import type { RoutineItem } from '@/types/workout';
import { SIDE_COLUMN_PX, WIDE_MIN_HEIGHT_PX, isWideLayout, restScreenOf, type RestItem } from './model';

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

describe('isWideLayout', () => {
  const fits = (height: number) => Math.ceil((height * 9) / 16 + SIDE_COLUMN_PX);

  it('uses the computer layout on common desktop windows', () => {
    expect(isWideLayout(1280, 720)).toBe(true);
    expect(isWideLayout(1440, 900)).toBe(true);
    expect(isWideLayout(1920, 1080)).toBe(true);
    expect(isWideLayout(1024, 768)).toBe(true); // tablet in landscape
  });

  it('falls back to the phone layout on phones, portrait tablets and narrow tall windows', () => {
    expect(isWideLayout(390, 844)).toBe(false);
    expect(isWideLayout(320, 640)).toBe(false);
    expect(isWideLayout(768, 1024)).toBe(false);
    expect(isWideLayout(900, 1000)).toBe(false);
    expect(isWideLayout(844, 390)).toBe(false); // phone in landscape: too short
  });

  it('switches exactly where the video and the widget column stop fitting', () => {
    expect(isWideLayout(fits(900), 900)).toBe(true);
    expect(isWideLayout(fits(900) - 1, 900)).toBe(false);
    expect(isWideLayout(4000, WIDE_MIN_HEIGHT_PX)).toBe(true);
    expect(isWideLayout(4000, WIDE_MIN_HEIGHT_PX - 1)).toBe(false);
  });
});

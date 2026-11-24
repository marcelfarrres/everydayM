import { afterEach, describe, expect, it, vi } from 'vitest';
import { recentExerciseIds, rememberRoutine } from './history';
import { exercise } from './fixtures.test-helpers';

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const routine = (n: number) => ({
  blocks: [[exercise(`a${n}`, ['gluteos']), exercise(`b${n}`, ['gluteos'])]],
  warmups: [exercise(`w${n}`, [], { type: 'warmup' })],
});

afterEach(() => vi.unstubAllGlobals());

describe('routine history', () => {
  it('is a no-op on the server', () => {
    expect(recentExerciseIds()).toEqual([]);
    expect(() => rememberRoutine(routine(1))).not.toThrow();
  });

  it('remembers the exercises of the last 10 routines', () => {
    vi.stubGlobal('window', { localStorage: fakeStorage() });
    for (let n = 1; n <= 12; n++) rememberRoutine(routine(n));
    const recent = recentExerciseIds();
    expect(recent).toContain('a12');
    expect(recent).toContain('w12');
    expect(recent).toContain('b3');
    expect(recent).not.toContain('a2');
    expect(recent).toHaveLength(30);
  });

  it('survives blocked or corrupt storage', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => '{not json',
        setItem: () => {
          throw new Error('quota');
        },
      },
    });
    expect(recentExerciseIds()).toEqual([]);
    expect(() => rememberRoutine(routine(1))).not.toThrow();
  });
});

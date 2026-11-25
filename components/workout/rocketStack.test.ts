import { describe, expect, it } from 'vitest';
import { exercise } from '@/lib/routine/fixtures.test-helpers';
import type { RoutineItem } from '@/types/workout';
import { FLIGHT } from './rocketFlight';
import { dropBetween, rocketStack } from './rocketStack';

const serie = (round: number, n: number): RoutineItem => ({
  kind: 'workout',
  exercise: exercise(`b${round}s${n}`, ['gluteos']),
  round,
  totalRounds: 3,
  exerciseIndexInRound: n,
  totalExercisesPerRound: 2,
});
const rest = (restKind: 'short' | 'long'): RoutineItem => ({
  kind: 'rest',
  duration: 12,
  prepSeconds: 0,
  nextExercise: exercise('x', ['gluteos']),
  nextRound: 1,
  totalRounds: 3,
  isEndOfRound: restKind === 'long',
  restKind,
  talks: [],
});
const warm: RoutineItem = { kind: 'warmup', exercise: exercise('w', ['gluteos']) };
const outro = { kind: 'outro', duration: 8 } as unknown as RoutineItem;

// warm-up, warm-up, | long | b1s1 short b1s2 | long | b2s1 short b2s2 | long | b3s1 short b3s2 | end
const QUEUE: RoutineItem[] = [warm, warm, rest('long'), serie(1, 1), rest('short'), serie(1, 2), rest('long'), serie(2, 1), rest('short'), serie(2, 2), rest('long'), serie(3, 1), rest('short'), serie(3, 2), outro];

describe("the routine's rocket, stage by stage", () => {
  it('has a segment per block and its boosters while the warm-up lasts', () => {
    expect(rocketStack(QUEUE, 0)).toEqual({ blocks: 3, first: 1, boosters: true });
    expect(rocketStack(QUEUE, 1)).toEqual({ blocks: 3, first: 1, boosters: true });
    // the rest after the warm-up: the boosters are off
    expect(rocketStack(QUEUE, 2)).toEqual({ blocks: 3, first: 1, boosters: false });
  });

  it('loses a block\'s segment only in the rest after its last serie, never between its series', () => {
    expect([3, 4, 5].map((i) => rocketStack(QUEUE, i).first)).toEqual([1, 1, 1]);
    expect(rocketStack(QUEUE, 6).first).toBe(2); // long rest after block 1
    expect([7, 8, 9].map((i) => rocketStack(QUEUE, i).first)).toEqual([2, 2, 2]);
    expect(rocketStack(QUEUE, 10).first).toBe(3);
  });

  it('always keeps its last segment, even at the end', () => {
    expect(rocketStack(QUEUE, 13).first).toBe(3);
    expect(rocketStack(QUEUE, 14).first).toBe(3);
  });

  it('puts parts back going back (no drop then), and says what comes off going forward', () => {
    expect(rocketStack(QUEUE, 5)).toEqual({ blocks: 3, first: 1, boosters: false });
    expect(dropBetween(rocketStack(QUEUE, 1), rocketStack(QUEUE, 2))).toBe('boosters');
    expect(dropBetween(rocketStack(QUEUE, 5), rocketStack(QUEUE, 6))).toBe('segment');
    expect(dropBetween(rocketStack(QUEUE, 3), rocketStack(QUEUE, 4))).toBeNull();
    expect(dropBetween(rocketStack(QUEUE, 6), rocketStack(QUEUE, 5))).toBeNull();
  });

  it('has no boosters without a warm-up', () => {
    const plain = QUEUE.slice(3);
    expect(rocketStack(plain, 0)).toEqual({ blocks: 3, first: 1, boosters: false });
  });

  it('drops a part once the rocket stands in the clouds, and it has fallen before it takes off', () => {
    expect(FLIGHT.dropMs).toBeGreaterThan(FLIGHT.settledMs);
    expect(FLIGHT.dropMs + FLIGHT.dropFallMs).toBeLessThan(FLIGHT.cloudLiftMs);
  });
});

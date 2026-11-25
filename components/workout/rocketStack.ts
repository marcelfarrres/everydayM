import type { RoutineItem } from '@/types/workout';
import type { Stack } from '@/components/workout/rocketShape';

/*
 * The routine's rocket, stage by stage (pure). One segment per block (block 1 at the tail); the
 * side boosters are the warm-up. A block's segment comes off in the clouds of the long rest that
 * follows its last serie; the boosters in the clouds of the rest after the warm-up. The last block
 * never comes off: the rocket always keeps its last segment, its nozzle and its nose.
 */

/** The rocket at the moment `index` of the queue (going back to an earlier moment puts parts back). */
export function rocketStack(queue: RoutineItem[], index: number): Stack {
  const lastSerie: number[] = [];
  let lastWarmup = -1;
  let round: number | null = null;
  queue.forEach((item, i) => {
    if (item.kind === 'warmup') lastWarmup = i;
    if (item.kind !== 'workout') return;
    if (item.round !== round) {
      round = item.round;
      lastSerie.push(i);
    } else lastSerie[lastSerie.length - 1] = i;
  });
  const blocks = Math.max(1, lastSerie.length);
  const done = lastSerie.filter((i) => i < index).length;
  return {
    blocks,
    first: Math.min(blocks, 1 + done),
    boosters: lastWarmup >= 0 && index <= lastWarmup,
  };
}

/** What comes off between two moments (in the clouds of the rest that begins at `next`). */
export function dropBetween(before: Stack, after: Stack): 'boosters' | 'segment' | null {
  if (before.blocks !== after.blocks) return null;
  if (after.first > before.first) return 'segment';
  if (before.boosters && !after.boosters) return 'boosters';
  return null;
}

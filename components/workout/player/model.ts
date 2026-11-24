import type { Exercise, RoutineItem, TimelineSegment } from '@/types/workout';
import type { Journey } from '@/components/workout/CloudTransition';

/*
 * Pure helpers for the player: where the routine is, in the shapes the UI draws.
 * Vocabulary on screen: "bloque" (the code's round) and "serie" (one exercise of a block).
 */

export type ExerciseItem = Extract<RoutineItem, { kind: 'warmup' | 'workout' }>;
export type WorkoutItem = Extract<RoutineItem, { kind: 'workout' }>;
export type RestItem = Extract<RoutineItem, { kind: 'rest' }>;

export const isExercise = (item: RoutineItem | undefined): item is ExerciseItem =>
  item?.kind === 'warmup' || item?.kind === 'workout';

export type StepState = 'done' | 'now' | 'todo';

export interface Serie {
  queueIndex: number;
  exercise: Exercise;
  n: number; // 1-based place in its block
}

export interface Block {
  round: number;
  series: Serie[];
}

/** The series of the routine grouped by block, in play order. Warm-up and rests are not series. */
export function blocksOf(queue: RoutineItem[]): Block[] {
  const blocks: Block[] = [];
  queue.forEach((item, queueIndex) => {
    if (item.kind !== 'workout') return;
    let block = blocks.at(-1);
    if (!block || block.round !== item.round) {
      block = { round: item.round, series: [] };
      blocks.push(block);
    }
    block.series.push({ queueIndex, exercise: item.exercise, n: item.exerciseIndexInRound });
  });
  return blocks;
}

/** A serie is done once the routine has moved past it, and "now" only while it plays. */
export function serieState(queueIndex: number, currentIndex: number): StepState {
  return queueIndex < currentIndex ? 'done' : queueIndex === currentIndex ? 'now' : 'todo';
}

/** The warm-up as one step: now while any warm-up clip plays, done once the first serie (or its rest) is reached. */
export function warmupState(queue: RoutineItem[], currentIndex: number): StepState | null {
  const first = queue.findIndex((q) => q.kind === 'warmup');
  if (first < 0) return null;
  let last = first;
  queue.forEach((q, i) => {
    if (q.kind === 'warmup') last = i;
  });
  return currentIndex > last ? 'done' : currentIndex >= first ? 'now' : 'todo';
}

/** The next clip to play after `index` (the one a rest leads to). */
export function nextExerciseAfter(queue: RoutineItem[], index: number): Exercise | undefined {
  const next = queue.find((q, i) => i > index && isExercise(q));
  return isExercise(next) ? next.exercise : undefined;
}

/** "Bloque 2" for the long rest before a block, otherwise the exercise that comes next. */
export function restHeadline(item: RestItem): string {
  return item.restKind === 'long' ? `Bloque ${item.nextRound}` : item.nextExercise.title;
}

/** The words on the clouds as a rest begins: where you are going. */
export function cloudLabel(item: RoutineItem | undefined): { title: string; sub?: string } {
  if (item?.kind !== 'rest') return { title: '' };
  return item.restKind === 'long'
    ? { title: 'Descansa', sub: `Luego: bloque ${item.nextRound} · ${item.nextExercise.title}` }
    : { title: 'Descansa', sub: `Luego: ${item.nextExercise.title}` };
}

/** The rocket's rail: where each section starts and where the routine is now (0..1). */
export function journeyOf(
  queue: RoutineItem[],
  timeline: TimelineSegment[],
  index: number,
  total: number,
): Journey | undefined {
  if (!total || !timeline.length) return undefined;
  const at = (i: number) => Math.min(1, (timeline[i]?.start ?? 0) / total);
  const marks: Journey['marks'] = [];
  const firstWarmup = queue.findIndex((q) => q.kind === 'warmup');
  if (firstWarmup >= 0) marks.push({ at: at(firstWarmup), label: 'Calentamiento' });
  queue.forEach((q, i) => {
    if (q.kind === 'workout' && q.exerciseIndexInRound === 1) marks.push({ at: at(i), label: `Bloque ${q.round}` });
  });
  const item = queue[index];
  const minutes = Math.max(1, Math.round(total / 60));
  const done = Math.min(minutes, Math.round((timeline[index]?.start ?? 0) / 60));
  return {
    progress: item?.kind === 'outro' ? 1 : at(index),
    total: `${minutes} min`,
    note: `Llevas ${done} de ${minutes} min`,
    marks,
  };
}

/** "1:05" or "0:42": the clock as plain text (no leading zero on the minutes). */
export function clock(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

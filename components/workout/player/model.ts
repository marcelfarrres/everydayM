import type { Exercise, RoutineItem, TimelineSegment } from '@/types/workout';
import type { Journey } from '@/components/workout/CloudTransition';
import { LONG_REST_MIN_RESTING_SECONDS, LONG_REST_READY_SECONDS } from '@/lib/routine/duration';

/*
 * Pure helpers for the player: where the routine is, in the shapes the UI draws.
 * Vocabulary on screen: "bloque" (the code's round) and "serie" (one exercise of a block).
 */

export type ExerciseItem = Extract<RoutineItem, { kind: 'warmup' | 'workout' }>;
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

/**
 * What a rest shows full screen:
 *   talks      a long rest's vídeo hablado, until it has played (`talksDone`: the rest whose talk finished)
 *   resting    phone, a long rest once its talk is done (or with none): the rest video (Marcel
 *              resting), looped, with the next exercise in the small window, "Descansando…" and the
 *              countdown big in the middle
 *   ready      phone, a long rest's last seconds: the next exercise fills the screen behind a veil,
 *              "Prepárate" and the countdown going on in the middle (longRestPhase)
 *   countdown  the next exercise looping behind a dark veil with the giant countdown (short rests;
 *              on a computer also a long rest once its talk is done)
 * Null if not a rest.
 */
export type RestScreen = 'talks' | 'resting' | 'ready' | 'countdown';

/** The rest whose talk has finished, and the seconds it had left then (the clock's whole seconds). */
export interface TalksDone {
  rest: RoutineItem;
  left: number;
}

export function restScreenOf(
  item: RoutineItem | undefined,
  talksDone: TalksDone | null,
  phone = false,
  timeLeft = Number.POSITIVE_INFINITY,
): RestScreen | null {
  if (item?.kind !== 'rest') return null;
  if (item.restKind !== 'long') return 'countdown';
  const hasTalk = item.talks.length > 0;
  const done = talksDone !== null && talksDone.rest === item;
  if (!phone) return hasTalk && !done ? 'talks' : 'countdown';
  const phase = longRestPhase(timeLeft, { speaking: hasTalk && !done, endedWithLeft: hasTalk && done ? talksDone.left : null });
  return phase === 'talk' ? 'talks' : phase;
}

/**
 * Phone, a long rest once its clouds have opened (26-11-2026):
 *   talk      its one vídeo hablado, with voice
 *   resting   then (or with no talk) the rest video, "Descansando…" and the countdown in the middle
 *   ready     the last LONG_REST_READY_SECONDS: the next exercise fills the screen, "Prepárate"
 * A talk that would leave less than LONG_REST_MIN_RESTING_SECONDS of rest video before the last
 * seconds goes straight into them (`endedWithLeft`: the seconds left when it ended). A talk still
 * speaking at the last seconds (longer than the catalogue said) gives way to them.
 */
export type LongRestPhase = 'talk' | 'resting' | 'ready';

export function longRestPhase(
  timeLeft: number,
  talk: { speaking: boolean; endedWithLeft: number | null },
): LongRestPhase {
  if (timeLeft <= LONG_REST_READY_SECONDS) return 'ready';
  if (talk.speaking) return 'talk';
  if (talk.endedWithLeft !== null && talk.endedWithLeft - LONG_REST_READY_SECONDS < LONG_REST_MIN_RESTING_SECONDS) return 'ready';
  return 'resting';
}

/**
 * The same, as planned: at second `t` of a long rest of `duration` s whose clouds open at `openS`
 * and whose talk lasts `talkS` (0: none). Before the clouds open, 'clouds'.
 */
export function plannedLongRestPhase(
  t: number,
  { duration, openS, talkS }: { duration: number; openS: number; talkS: number },
): LongRestPhase | 'clouds' {
  if (t < openS) return 'clouds';
  const talkEnd = openS + talkS;
  return longRestPhase(duration - t, {
    speaking: talkS > 0 && t < talkEnd,
    endedWithLeft: talkS > 0 ? duration - talkEnd : null,
  });
}

/** The big 3, 2, 1 over the stage at the end of a long rest (phone): the second shown, or null. */
export function finalCount(screen: RestScreen | null, timeLeft: number): 1 | 2 | 3 | null {
  if (screen !== 'talks' && screen !== 'resting' && screen !== 'ready') return null;
  const s = Math.round(timeLeft);
  return s === 1 || s === 2 || s === 3 ? s : null;
}

/** The next clip to play after `index` (the one a rest leads to). */
export function nextExerciseAfter(queue: RoutineItem[], index: number): Exercise | undefined {
  const next = queue.find((q, i) => i > index && isExercise(q));
  return isExercise(next) ? next.exercise : undefined;
}

const ORDINALS = ['primer', 'segundo', 'tercer', 'cuarto', 'quinto', 'sexto', 'séptimo', 'octavo', 'noveno', 'décimo'];

/** "primer", "segundo", "tercer"… for block `n` (1-based; past the tenth, "bloque 11"-style "11.º"). */
export function blockOrdinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}.º`;
}

/** The three sentences after the warm-up: the boosters come off with the third. */
export const WARMUP_END_WORDS = {
  first: 'Has acabado el calentamiento.',
  second: { before: 'Llevas el', after: 'completado.' },
  third: 'Soltando los propulsores…',
};

/** The sentences of a long rest's clouds: after the warm-up, or after the block before it. */
export function longRestWords(rest: Extract<RoutineItem, { kind: 'rest' }>) {
  return rest.isEndOfRound ? blockEndWords(rest.nextRound - 1) : WARMUP_END_WORDS;
}

/**
 * The three sentences on the clouds of the rest after block `done`: the second is split round the
 * % done (`before`, the number, `after`), where on a phone the % badge itself comes to stand.
 */
export function blockEndWords(done: number) {
  const ordinal = blockOrdinal(done);
  return {
    first: `Has acabado el ${ordinal} bloque.`,
    second: { before: 'Llevas el', after: 'completado.' },
    third: `Retirando el ${ordinal} bloque del cohete…`,
  };
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

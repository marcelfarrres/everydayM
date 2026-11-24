import type { RoutineItem } from '@/types/workout';
import { getItemDuration } from './duration';

/*
 * Words of encouragement.
 *   cheerFor / REST_LINES   the lines written on the TikTok clips (lib/server/clips).
 *   planCheerHits           the player's comic "golpes": a short exclamation bursting onto the
 *                           video now and then during a serie (see the bottom of this file).
 * Each moment has its own list and the pick depends on where in the routine you are, so two
 * exercises in a row almost never say the same thing.
 */

const WARMUP_START = [
  'Suave, sin prisa',
  'Despierta el cuerpo',
  'Movimiento amplio',
  'A tu ritmo',
  'Respira y suelta',
  'Calienta bien',
  'Sin forzar',
  'Activa las articulaciones',
];
const WORK_START = [
  '¡Vamos!',
  '¡A por ello!',
  '¡Dale!',
  'Con todo',
  'Tú puedes',
  'Fuerte y controlado',
  'Concéntrate',
  '¡Arriba!',
  'Técnica primero',
  'Sin parar',
  'Hoy se nota',
  'Uno más',
];
const ROUND_START = ['¡Nuevo bloque!', 'Otro bloque, ¡vamos!', 'Bloque nuevo, energía nueva', 'Arranca el bloque'];
// Only true when the block repeats the previous one exactly (blocks can now differ).
const SAME_BLOCK_START = ['Mismo plan, más ganas', 'Ya lo conoces: ¡a por él!'];
const CHANGED_BLOCK_START = ['Este bloque trae cambios', 'Ojo a los cambios'];
const HALFWAY = ['Ya vas por la mitad', 'Mitad hecha', 'Sigue así', 'No pares', 'Buen ritmo', 'Mantén la forma', 'Respira y sigue'];
const LAST_SECONDS = ['¡Queda poco!', '¡Últimos segundos!', 'Aguanta', '¡Ya casi!', 'Un poco más', '¡Termina fuerte!', 'No aflojes'];
const LAST_EXERCISE = ['El último. ¡Dalo todo!', 'Último esfuerzo', 'Lo último, a tope'];
export const REST_LINES = [
  'Respira hondo',
  'Bebe un poco de agua',
  'Lo estás haciendo genial',
  'Suelta los hombros',
  'Recupera el aire',
  'Sacude las piernas',
  'Relaja la mandíbula',
  'Buen trabajo',
];

// 13 shares no factor with any list length, so consecutive exercises walk through the whole list.
const at = (list: string[], index: number, salt = 0) => list[(index * 13 + salt) % list.length];

/** The exercise ids of block `round`, in play order. */
function blockIds(queue: RoutineItem[], round: number): string[] {
  return queue.flatMap((q) => (q.kind === 'workout' && q.round === round ? [q.exercise.id] : []));
}

function blockStartLines(queue: RoutineItem[], round: number): string[] {
  const current = blockIds(queue, round).join('|');
  const same = current === blockIds(queue, round - 1).join('|');
  return [...ROUND_START, ...(same ? SAME_BLOCK_START : CHANGED_BLOCK_START)];
}

/**
 * What to say `elapsed` seconds into an exercise of `total` seconds, or null to stay quiet.
 * Not on every clip: only at the moments that matter (a block starting, the last serie, every
 * third serie), halfway through every fourth, and the last 10 s when a block is closing.
 */
export function cheerFor(queue: RoutineItem[], index: number, elapsed: number, total: number): string | null {
  const item = queue[index];
  if (!item || (item.kind !== 'warmup' && item.kind !== 'workout') || total <= 0) return null;
  const left = total - elapsed;
  const last = item.kind === 'workout' && !queue.slice(index + 1).some((q) => q.kind === 'workout');
  const roundStart = item.kind === 'workout' && item.exerciseIndexInRound === 1;
  const roundEnd = item.kind === 'workout' && item.exerciseIndexInRound === item.totalExercisesPerRound;
  const firstWarmup = item.kind === 'warmup' && queue[index - 1]?.kind !== 'warmup';
  if (elapsed >= 2 && elapsed <= 5) {
    if (last) return at(LAST_EXERCISE, index);
    if (firstWarmup) return at(WARMUP_START, index);
    if (roundStart && item.round > 1) return at(blockStartLines(queue, item.round), item.round);
    if (item.kind === 'workout' && index % 3 === 0) return at(WORK_START, index);
    return null;
  }
  if (total >= 30 && index % 4 === 1 && Math.abs(left - total / 2) <= 1.5) return at(HALFWAY, index, 3);
  if ((roundEnd || last) && left <= 10 && left > 6) return at(LAST_SECONDS, index, 5);
  return null;
}

/* ---------------------------------------------------------------------------------------------
 * Golpes: comic-book hits of encouragement in the player.
 *
 * Which series get one (the rule, decided once per routine):
 *   - always the last serie of the routine;
 *   - walking back from it, the next hit is 2 or 3 series earlier (even odds), and so on while
 *     there are series left. So never two consecutive series, at most one per serie, and about
 *     one serie in every two or three (between ceil(n/3) and ceil(n/2) hits for n series).
 * When: around the middle of the serie or with 10 s left (even odds; the middle only when the
 * clip is shorter than 20 s), and never so late that it would overlap the 3-2-1 beeps.
 * Which word: the last serie of the routine and the last serie of a block have their own lists;
 * any other serie takes the list of its moment ("10 s" words only with 10 s left). A word is not
 * used twice in a routine while its list has others left, and never twice in a row.
 * --------------------------------------------------------------------------------------------- */

export type HitMoment = 'mid' | 'ten';
export type HitGroup = 'mid' | 'ten' | 'blockEnd' | 'routineEnd';

/** Short enough for the burst: at most 10 characters each, ¡! included. */
export const HIT_WORDS: Readonly<Record<HitGroup, readonly string[]>> = {
  mid: ['¡Vamos!', '¡Dale!', '¡Aprieta!', '¡Fuerte!', '¡Sigue!', '¡Eso es!', '¡Bien!', '¡Arriba!', '¡Con todo!', '¡Venga!', '¡Así sí!'],
  ten: ['¡10 seg!', '¡Ya casi!', '¡Aguanta!', '¡No pares!', '¡Resiste!', '¡Empuja!'],
  blockEnd: ['¡Remata!', '¡A tope!', '¡Termina!', '¡Con alma!', '¡Muy bien!'],
  routineEnd: ['¡Última!', '¡Todo!', '¡Remátalo!', '¡Final!', '¡Ahora sí!'],
};

export interface CheerHit {
  queueIndex: number;
  moment: HitMoment;
  group: HitGroup;
  word: string;
  /** Drives the look of this hit (tilt, place, the star's points), so it is stable across renders. */
  seed: number;
}

/** How long a hit is on screen. */
export const HIT_MS = 1500;
/** A serie needs at least this many seconds for a "10 s left" hit (else it goes in the middle). */
export const TEN_MIN_SERIE_SECONDS = 20;
/** No hit may start with fewer seconds left: it would still be showing when the 3-2-1 beeps. */
export const HIT_MIN_SECONDS_LEFT = 6;
// A hit that could not show at its second (the list was open, say) may still come this late.
const HIT_GRACE_SECONDS = 3;

/** The series of the routine that get a hit, when, and with which word. `random` returns [0, 1). */
export function planCheerHits(queue: RoutineItem[], random: () => number = Math.random): CheerHit[] {
  const series = queue.flatMap((item, index) => (item.kind === 'workout' ? [index] : []));
  if (series.length === 0) return [];

  const chosen: number[] = [];
  for (let p = series.length - 1; p >= 0; p -= random() < 0.5 ? 2 : 3) chosen.unshift(series[p]);

  const used = new Set<string>();
  let previous: string | null = null;
  const pickWord = (group: HitGroup): string => {
    const list = HIT_WORDS[group];
    const fresh = list.filter((w) => !used.has(w));
    const others = list.filter((w) => w !== previous);
    const pool = fresh.length > 0 ? fresh : others.length > 0 ? others : list;
    const word = pool[Math.floor(random() * pool.length)];
    used.add(word);
    previous = word;
    return word;
  };

  return chosen.map((queueIndex) => {
    const item = queue[queueIndex];
    const round = item.kind === 'workout' ? item.round : 0;
    const nextSerie = queue.find((q, i) => i > queueIndex && q.kind === 'workout');
    const lastOfRoutine = !nextSerie;
    const lastOfBlock = lastOfRoutine || (nextSerie.kind === 'workout' && nextSerie.round !== round);
    const moment: HitMoment = getItemDuration(item) >= TEN_MIN_SERIE_SECONDS && random() < 0.5 ? 'ten' : 'mid';
    const group: HitGroup = lastOfRoutine ? 'routineEnd' : lastOfBlock ? 'blockEnd' : moment;
    return { queueIndex, moment, group, word: pickWord(group), seed: Math.floor(random() * 2 ** 32) };
  });
}

/** The second (time left) at which a hit of `moment` shows in a serie of `total` seconds. */
export function hitSecond(moment: HitMoment, total: number): number {
  return moment === 'ten' ? 10 : Math.floor(total / 2);
}

/**
 * True while a hit of `moment` may start, with `timeLeft` of `total` seconds left in its serie:
 * from its second for a short grace, at least 2 s into the serie, and never so late that it would
 * overlap the countdown beeps of the last 3 s.
 */
export function hitIsDue(moment: HitMoment, timeLeft: number, total: number): boolean {
  if (total <= 0) return false;
  const at = hitSecond(moment, total);
  return timeLeft <= at && timeLeft > at - HIT_GRACE_SECONDS && timeLeft >= HIT_MIN_SECONDS_LEFT && total - timeLeft >= 2;
}

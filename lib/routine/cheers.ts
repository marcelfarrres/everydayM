import type { RoutineItem } from '@/types/workout';

/*
 * Words of encouragement, shared by the player and the TikTok export.
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

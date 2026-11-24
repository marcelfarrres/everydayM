import type { BlockVariation, Exercise } from '@/types/workout';
import { pickWeighted, sharesPrimaryMuscle, type ScoredExercise } from './select';

const DEFAULT_VARIATION: BlockVariation = 'some';

export function resolveVariation(value: unknown): BlockVariation {
  return value === 'same' || value === 'some' || value === 'all' ? value : DEFAULT_VARIATION;
}

/**
 * One list per block from the circuit of block 1.
 * 'same': every block repeats it. 'some': middle blocks swap one serie for another exercise with
 * the same primary muscle, so the first and last blocks stay the familiar circuit. 'all': every
 * block takes other exercises for the same muscles, falling back to the circuit when the library
 * has nothing else.
 */
export function buildBlocks(
  circuit: readonly Exercise[],
  rounds: number,
  variation: BlockVariation,
  scored: readonly ScoredExercise[],
  rng: () => number,
): Exercise[][] {
  const blocks: Exercise[][] = [[...circuit]];
  if (rounds <= 1 || circuit.length === 0) {
    return Array.from({ length: Math.max(1, rounds) }, () => [...circuit]);
  }

  const scoredById = new Map(scored.map((item) => [item.exercise.id, item]));
  const alternativesFor = (exercise: Exercise): ScoredExercise[] => {
    const own = scoredById.get(exercise.id);
    if (!own) return [];
    return scored.filter((item) => item.exercise.id !== exercise.id && sharesPrimaryMuscle(own, item));
  };

  if (variation === 'same') {
    for (let b = 1; b < rounds; b++) blocks.push([...circuit]);
    return blocks;
  }

  if (variation === 'some') {
    const circuitIds = new Set(circuit.map((exercise) => exercise.id));
    const swappedIn = new Set<string>();
    for (let b = 1; b < rounds; b++) {
      const block = [...circuit];
      const isMiddle = b < rounds - 1;
      if (isMiddle) {
        const slots = circuit
          .map((exercise, index) => ({ index, alternatives: alternativesFor(exercise) }))
          .filter((slot) => slot.alternatives.some((alt) => !circuitIds.has(alt.exercise.id)));
        if (slots.length > 0) {
          const slot = slots[Math.min(slots.length - 1, Math.floor(rng() * slots.length))];
          // Prefer an exercise no other middle block has brought in yet.
          const swap =
            pickWeighted(slot.alternatives, new Set([...circuitIds, ...swappedIn]), rng) ??
            pickWeighted(slot.alternatives, circuitIds, rng);
          if (swap) {
            block[slot.index] = swap;
            swappedIn.add(swap.id);
          }
        }
      }
      blocks.push(block);
    }
    return blocks;
  }

  // 'all'
  const used = new Set(circuit.map((exercise) => exercise.id));
  for (let b = 1; b < rounds; b++) {
    const previousIds = new Set(blocks[b - 1].map((exercise) => exercise.id));
    const inBlock = new Set<string>();
    const block = circuit.map((exercise) => {
      const alternatives = alternativesFor(exercise);
      const pick =
        pickWeighted(alternatives, new Set([...used, ...inBlock]), rng) ??
        // Library too small for all new ones: reuse an older block's, never the one just played.
        pickWeighted(alternatives, new Set([...previousIds, ...inBlock]), rng) ??
        exercise;
      inBlock.add(pick.id);
      used.add(pick.id);
      return pick;
    });
    blocks.push(block);
  }
  return blocks;
}

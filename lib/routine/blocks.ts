/**
 * The day's distinct exercises across every block, in the order they first play.
 * Generic and defensive because the server also calls it on a `meta` that arrived as JSON.
 */
export function uniqueExercises<T extends { id: string }>(meta: {
  blocks?: readonly (readonly T[])[] | null;
}): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const block of Array.isArray(meta.blocks) ? meta.blocks : []) {
    for (const exercise of Array.isArray(block) ? block : []) {
      if (exercise && !seen.has(exercise.id)) {
        seen.add(exercise.id);
        out.push(exercise);
      }
    }
  }
  return out;
}

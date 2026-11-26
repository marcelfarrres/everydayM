import { parseIntentKeywords } from './keywords';
import type { Exercise, MuscleId } from '@/types/workout';

/*
 * The first screen's porthole (phone) shows Marcel doing something that fits the suggestion at the
 * centre of the drum. He has not recorded clips for it yet, so one of the catalogue's exercise
 * clips stands in: the one whose muscles best match what the suggestion asks for (local keyword
 * parser: instant, no network). Pure, so the same suggestion always shows the same clip.
 */

const SKIP_TYPES = new Set(['warmup', 'intro', 'filler']);

/** An exercise's muscles, with how much each counts (primary 1, secondary 0.5). */
function exerciseMuscles(exercise: Exercise): Map<MuscleId, number> {
  const out = new Map<MuscleId, number>();
  for (const m of exercise.muscles ?? []) out.set(m.id, Math.max(out.get(m.id) ?? 0, m.role === 'primary' ? 1 : 0.5));
  return out;
}

/** A small stable hash, to pick among equally good clips (different suggestions, different clips). */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The exercise clip standing in for `suggestion`, or null when none fits (no catalogue yet, no
 * workout clip touching those muscles): then the porthole shows Marcel's usual still.
 */
export function standInExercise(suggestion: string, exercises: readonly Exercise[]): Exercise | null {
  const intent = parseIntentKeywords(suggestion);
  const wanted = new Map<MuscleId, number>();
  for (const m of intent.muscles) wanted.set(m.id, Math.max(wanted.get(m.id) ?? 0, (m.role === 'primary' ? 1 : 0.5) * (m.weight || 1)));
  if (wanted.size === 0) return null;

  let best: { exercise: Exercise; score: number }[] = [];
  let bestScore = 0;
  for (const exercise of exercises) {
    if (SKIP_TYPES.has(String(exercise.type)) || !exercise.video_url) continue;
    const own = exerciseMuscles(exercise);
    if (own.size === 0) continue;
    let hit = 0;
    for (const [id, w] of own) hit += w * (wanted.get(id) ?? 0);
    if (hit <= 0) continue;
    // what it works that was not asked for counts a little against it (a squat, not a burpee, for legs)
    let stray = 0;
    for (const [id, w] of own) if (!wanted.has(id)) stray += w;
    const score = Math.round((hit / (1 + 0.35 * stray)) * 1000) / 1000;
    if (score > bestScore) {
      bestScore = score;
      best = [{ exercise, score }];
    } else if (score === bestScore) {
      best.push({ exercise, score });
    }
  }
  if (best.length === 0) return null;
  const sorted = best.map((b) => b.exercise).sort((a, b) => a.id.localeCompare(b.id));
  return sorted[hash(suggestion) % sorted.length];
}

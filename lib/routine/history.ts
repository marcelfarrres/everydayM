import type { RoutineMeta } from '@/types/workout';
import { uniqueExercises } from './blocks';

// The exercises of the last routines on this device, so the next one leans towards others.
// One entry per routine, newest first. Only ids: nothing personal is stored.
const STORAGE_KEY = 'everydaym:recent-routines';
const MAX_ROUTINES = 10;

function readEntries(): string[][] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is unknown[] => Array.isArray(entry))
      .map((entry) => entry.filter((id): id is string => typeof id === 'string'));
  } catch {
    // private mode, blocked storage or a corrupt value: start afresh
    return [];
  }
}

/** Ids of the exercises (and warm-ups) used in the last ~10 routines on this device. */
export function recentExerciseIds(): string[] {
  return Array.from(new Set(readEntries().flat()));
}

/** Records a routine that is about to be played. Safe to call on the server (does nothing). */
export function rememberRoutine(meta: Pick<RoutineMeta, 'blocks' | 'warmups'>): void {
  if (typeof window === 'undefined') return;
  const ids = [
    ...uniqueExercises(meta).map((exercise) => exercise.id),
    ...(meta.warmups ?? []).map((exercise) => exercise.id),
  ];
  if (ids.length === 0) return;
  const entries = [ids, ...readEntries()].slice(0, MAX_ROUTINES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full or blocked: the next routine just will not know about this one
  }
}

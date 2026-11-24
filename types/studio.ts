import type { ExerciseTalk } from '@/types/workout';
import type { CatalogExercise } from '@/types/catalog';

/** An exercise as the Studio library lists it: straight from the catalog, talks included. */
export type StudioExercise = CatalogExercise;

/** NDJSON events sent while a clip is processed (ingest of exercises and talks). */
export interface StudioProgressEvent {
  phase: 'compressing' | 'uploading' | 'done' | 'error';
  originalSize?: number;
  compressedSize?: number;
  durationSeconds?: number;
  isHdr?: boolean;
  exercise?: CatalogExercise;
  talk?: ExerciseTalk;
  error?: string;
}

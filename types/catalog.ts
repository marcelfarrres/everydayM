import type { Exercise, ExerciseTalk } from '@/types/workout';

/*
 * The catalog: all the app's data in one JSON file next to the media, at
 * `${NEXT_PUBLIC_MEDIA_BASE_URL}/catalog/catalog.json`. Only the Studio writes it (whole file,
 * one writer); the app reads it. Ids are strings (new ones are UUIDs). Media fields hold full
 * public URLs.
 */

/** One track of the player's playlist. Files live in the media store, never on third-party sites. */
export interface MusicTrack {
  id: string;
  title: string;
  artist: string | null;
  source_url: string | null; // page it was downloaded from
  license: string | null;
  audio_url: string; // AAC ~96 kbit/s .m4a
  duration_seconds: number;
  enabled: boolean; // false = out of the playlist, not deleted
}

/** An exercise as stored in the catalog: its vídeos hablados always present (maybe empty). */
export type CatalogExercise = Exercise & { talks: ExerciseTalk[] };

export interface Catalog {
  version: 1;
  updatedAt: string; // ISO 8601
  exercises: CatalogExercise[]; // newest first
  music: MusicTrack[]; // newest first
}

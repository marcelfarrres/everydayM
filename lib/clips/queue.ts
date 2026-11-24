import type { ClipType } from '@/lib/clips/types';
import type { MuscleId, RoutineItem, RoutineMeta } from '@/types/workout';

/*
 * The clip queue as the Studio sees it: what was asked, what it became, and where it stands.
 * Plain types and constants (no 'server-only'): the queue UI and the API routes share them.
 */

/**
 * rendering: waiting or being rendered · ready: rendered, not reviewed yet ·
 * approved / rejected: reviewed by Marcel · failed: the render broke (see `error`).
 */
export type ClipStatus = 'rendering' | 'ready' | 'approved' | 'rejected' | 'failed';

export const CLIP_STATUS_LABELS: Record<ClipStatus, string> = {
  rendering: 'Montando',
  ready: 'Por revisar',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  failed: 'Ha fallado',
};

/** Where the request came from: the sentence box, the type picker, or the player's "···" menu. */
export type ClipOrigin = 'sentence' | 'manual' | 'player';

export interface ClipExerciseRef {
  id: string;
  title: string;
}

export interface ClipQueueItem {
  id: string;
  type: ClipType;
  origin: ClipOrigin;
  instruction: string; // the sentence, or what was picked by hand
  exercises: ClipExerciseRef[]; // in the order they appear
  talkIds: string[]; // vídeos hablados used
  status: ClipStatus;
  comment: string | null; // Marcel's comment when reviewing
  createdAt: string; // ISO 8601
  updatedAt: string;
  finishedAt: string | null;
  file: string | null; // relative to the clips folder: the MP4, or the ZIP of a carousel
  durationSeconds: number | null;
  sizeBytes: number | null;
  slides: number; // carousel photos (0 for videos)
  progress: number; // 0..1 while rendering
  step: string; // what the render is doing, in Spanish
  error: string | null;
  notes: string[]; // things worth knowing about the result ("Sin música: …")
  caption: string; // TikTok description, ready to paste
  regeneratedFrom: string | null; // the item this one replaces (kept as history)
  variant: number; // bumps on each regeneration: other words, other exercises when possible
}

/** POST /api/studio/clips: a sentence, or a type picked by hand, or a routine from the player. */
export interface CreateClipBody {
  sentence?: string;
  type?: ClipType;
  muscles?: MuscleId[];
  exerciseId?: string | null;
  exerciseTitle?: string | null; // only to describe the request in the queue
  minutes?: number | null;
  routine?: { queue: RoutineItem[]; meta: RoutineMeta; prompt?: string };
  handle?: string;
}

export const MAX_COMMENT_LENGTH = 500;
export const MAX_SENTENCE_LENGTH = 300;

import 'server-only';
import { uniqueExercises } from '@/lib/routine';
import type { Exercise, RoutineItem, RoutineMeta } from '@/types/workout';

/*
 * What every part of a clip can read while it renders, and the words it shows.
 * Types without a routine (talk, intro_talk, random_mix) get a small routine-shaped `meta`
 * built from their exercises, so the same parts serve every type.
 */

export interface SourceInfo {
  seconds: number; // real length (ffprobe), 0 when unknown
  hasAudio: boolean;
}

export interface Ctx {
  dir: string; // scratch folder of this render, deleted at the end
  sources: Map<string, string>; // media URL → local file
  info: Map<string, SourceInfo>; // media URL → what ffprobe saw (talks only)
  encoder: string[];
  handle: string;
  meta: RoutineMeta;
  queue: RoutineItem[];
  prompt: string; // the sentence typed in the opening
  variant: number; // 0 for the first render; regenerations pick other words and exercises
  headline?: string; // replaces the routine headline over Marcel's clip
}

export type Part = { name: string; render: (ctx: Ctx, out: string) => Promise<void> };

/** The local file of a media URL. Every URL a part uses was collected before rendering. */
export function source(ctx: Ctx, url: string): string {
  const file = ctx.sources.get(url);
  if (!file) throw new Error('Falta un vídeo por descargar.');
  return file;
}

/** A clip's length for seeking into it: at least `seconds + 1`, so a loop never starts at its end. */
export function seekable(exercise: Exercise, seconds: number): number {
  return Math.max(seconds + 1, Number(exercise.duration_seconds) || 30);
}

/* ── words ────────────────────────────────────────────────────────────────── */

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function plan(meta: RoutineMeta) {
  const minutes = Math.max(1, Math.round(meta.totalSeconds / 60));
  return {
    minutes,
    shape: `${plural(meta.rounds, 'bloque', 'bloques')} × ${plural(meta.exercisesPerRound, 'serie', 'series')}`,
  };
}

/** The day's own exercises (no repeats), so every routine's video opens and closes differently. */
export function dayExercises(meta: RoutineMeta): Exercise[] {
  return uniqueExercises(meta);
}

/** Same routine and variant → same words; another routine or a regeneration → (likely) others. */
export function pick<T>(ctx: Pick<Ctx, 'meta' | 'variant'>, salt: number, options: readonly T[]): T {
  let h = salt + ctx.variant * 7919;
  // hashed on the first block, which is what the old single circuit was
  for (const ch of (ctx.meta.blocks[0] ?? []).map((e) => e.id).join('|')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return options[h % options.length];
}

export function headline(ctx: Ctx): string {
  if (ctx.headline) return ctx.headline;
  const { minutes } = plan(ctx.meta);
  const focus = ctx.meta.focusLabel || 'Full body';
  const low = focus.toLowerCase();
  return pick(ctx, 7, [`Hoy toca ${low}`, `${minutes} min de ${low}`, `${focus}, ${minutes} minutos`, `Rutina de ${low}`, `${focus} sin excusas`]);
}

export const CTAS = ['¿Te atreves?', 'Guárdala y hazla hoy', 'Mañana, otra distinta', 'Comenta «hecha» si la acabas'];

/** The user's sentence, made safe to draw: printable, one line, short. */
export function cleanPrompt(raw: unknown, fallback: string): string {
  const typed = typeof raw === 'string' ? raw.replace(/[^\p{L}\p{N} ,.¿?¡!'-]/gu, ' ').replace(/\s+/g, ' ').trim() : '';
  if (typed.length >= 3) return typed.slice(0, 44);
  return fallback.slice(0, 44);
}

export function defaultPrompt(meta: RoutineMeta): string {
  return `${meta.focusLabel || 'Full body'}, ${plan(meta).minutes} minutos`;
}

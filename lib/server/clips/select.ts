import 'server-only';
import { clipNeedsRoutine, CLIP_TYPE_NAMES, type ClipType } from '@/lib/clips/types';
import type { ClipExerciseRef } from '@/lib/clips/queue';
import { ALL_MUSCLE_IDS, MUSCLE_LABELS_ES } from '@/lib/intent/types';
import { buildFocusLabel, buildRoutine, extractExerciseMuscles, uniqueExercises } from '@/lib/routine';
import { readCatalog } from '@/lib/server/catalog';
import { briefFrom, captionFor } from '@/lib/server/contentIdeas';
import { cleanPrompt, dayExercises, defaultPrompt } from '@/lib/server/clips/context';
import { choose, mediaFor, type ClipSpec } from '@/lib/server/clips/recipes';
import { isAllowedMediaUrl } from '@/lib/server/clips/sources';
import type { CatalogExercise } from '@/types/catalog';
import type { Exercise, ExerciseTalk, MuscleId, RoutineIntent, RoutineItem, RoutineMeta } from '@/types/workout';

/*
 * From a request to a spec: which exercises and which talk a clip uses, decided before the
 * render starts. A request that cannot be met fails here with a Spanish message that says
 * what is missing, so nothing is queued in vain.
 */

export class ClipRequestError extends Error {
  readonly status = 422;
}

export interface ResolvedClip {
  spec: ClipSpec;
  exercises: ClipExerciseRef[];
  talkIds: string[];
  caption: string;
}

export interface Avoid {
  exerciseIds: string[];
  talkIds: string[];
}

export function cleanHandle(raw: unknown): string {
  const handle = typeof raw === 'string' ? raw.replace(/[^\w.@]/g, '').slice(0, 30) : '';
  return handle ? (handle.startsWith('@') ? handle : `@${handle}`) : '@everydaym';
}

export function cleanMuscles(raw: unknown): MuscleId[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((m): m is MuscleId => typeof m === 'string' && (ALL_MUSCLE_IDS as readonly string[]).includes(m)))];
}

/** "glúteos", "bíceps y tríceps", "cuádriceps, glúteos y gemelos". */
export function musclesLabel(muscles: readonly MuscleId[]): string {
  const labels = muscles.map((m) => MUSCLE_LABELS_ES[m]);
  if (labels.length <= 1) return labels[0] ?? 'todo el cuerpo';
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
}

const focusOf = (muscles: readonly MuscleId[]) =>
  muscles.length ? buildFocusLabel(muscles.map((id) => ({ id, role: 'primary' as const }))) : 'Full body';

function musclesOf(exercise: Exercise): MuscleId[] {
  return extractExerciseMuscles(exercise.muscles, exercise.muscle).map((m) => m.id);
}

function primaryOf(exercise: Exercise): MuscleId[] {
  const all = extractExerciseMuscles(exercise.muscles, exercise.muscle);
  const primary = all.filter((m) => m.role === 'primary');
  return (primary.length ? primary : all).map((m) => m.id);
}

/** 0 = no match, 1 = works one of them, 2 = one of them is its main muscle. */
function matchScore(exercise: Exercise, muscles: readonly MuscleId[]): number {
  if (muscles.length === 0) return 1;
  if (primaryOf(exercise).some((m) => muscles.includes(m))) return 2;
  return musclesOf(exercise).some((m) => muscles.includes(m)) ? 1 : 0;
}

function shuffle<T>(list: readonly T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Usable exercises: with an original video under our media base. */
function usable(exercises: CatalogExercise[]): CatalogExercise[] {
  return exercises.filter((e) => isAllowedMediaUrl(e.video_url));
}

function findNamed(exercises: CatalogExercise[], exerciseId: string | null, title: string | null): CatalogExercise | null {
  if (exerciseId) {
    const byId = exercises.find((e) => e.id === exerciseId);
    if (byId) return byId;
  }
  if (title) {
    const wanted = title.trim().toLowerCase();
    return exercises.find((e) => e.title.trim().toLowerCase() === wanted) ?? null;
  }
  return null;
}

/** A routine-shaped summary for clips made without a routine. */
function looseMeta(exercises: Exercise[], focusLabel: string, seconds: number): RoutineMeta {
  return {
    totalSeconds: seconds,
    slotSeconds: 40,
    rounds: 1,
    exercisesPerRound: exercises.length,
    difficulty: 5,
    muscles: [],
    blocks: [exercises],
    warmups: [],
    focusLabel,
  };
}

/** The exercises a spec shows, in order: what the queue lists for each clip. */
export function exercisesUsed(spec: ClipSpec): ClipExerciseRef[] {
  const day = dayExercises(spec.meta);
  let list: Exercise[];
  switch (spec.type) {
    case 'talk':
    case 'intro_talk':
      list = spec.talks.map((t) => t.exercise);
      break;
    case 'full':
      list = [...(spec.meta.warmups ?? []), ...day];
      break;
    case 'carousel':
      list = day.slice(0, 8);
      break;
    case 'summary':
      list = choose(day, 4, spec);
      break;
    case 'top3':
    case 'challenge':
      list = choose(day, 3, spec);
      break;
    case 'random_mix':
      list = day;
      break;
  }
  const seen = new Set<string>();
  return list.filter((e) => !seen.has(e.id) && seen.add(e.id)).map((e) => ({ id: e.id, title: e.title }));
}

function finish(spec: ClipSpec): ResolvedClip {
  const exercises = exercisesUsed(spec);
  const brief = briefFrom(spec.meta);
  if (spec.type !== 'full') brief.exercises = exercises.map((e) => e.title);
  return {
    spec,
    exercises,
    // Only the full routine shows the talks of its long rests.
    talkIds: [
      ...new Set([
        ...spec.talks.map((t) => t.talk.id),
        ...(spec.type === 'full' ? spec.queue.flatMap((q) => (q.kind === 'rest' && Array.isArray(q.talks) ? q.talks.map((t) => t.id) : [])) : []),
      ]),
    ],
    caption: captionFor(spec.type, brief),
  };
}

/* ── from the player: its own routine ─────────────────────────────────────── */

export function fromRoutine(o: {
  type: ClipType;
  routine: { queue: unknown; meta: unknown; prompt?: unknown };
  handle: string;
  variant: number;
  avoid: Avoid;
}): ResolvedClip {
  const queue = o.routine.queue as RoutineItem[];
  const meta = o.routine.meta as RoutineMeta;
  if (!clipNeedsRoutine(o.type)) throw new ClipRequestError('Este tipo de clip no se hace desde una rutina.');
  if (!Array.isArray(queue) || queue.length === 0 || queue.length > 400) throw new ClipRequestError('Rutina vacía o demasiado larga.');
  if (!meta || typeof meta !== 'object' || !Array.isArray(meta.blocks) || !meta.blocks.every(Array.isArray)) {
    throw new ClipRequestError('Faltan los datos de la rutina.');
  }
  if (uniqueExercises(meta).length === 0) throw new ClipRequestError('La rutina no tiene ejercicios.');
  const spec: ClipSpec = {
    type: o.type,
    handle: o.handle,
    prompt: cleanPrompt(o.routine.prompt, defaultPrompt(meta)),
    variant: o.variant,
    queue,
    meta,
    talks: [],
    avoidExerciseIds: o.avoid.exerciseIds,
  };
  const media = mediaFor(spec);
  if (![...media.videos, ...media.talks].every(isAllowedMediaUrl)) {
    throw new ClipRequestError('Hay un vídeo que no es de la biblioteca de EverydayM.');
  }
  return finish(spec);
}

/* ── from the Studio: a type, maybe muscles, maybe an exercise ──────────────── */

export interface Choice {
  type: ClipType;
  muscles: MuscleId[];
  exerciseId: string | null;
  exerciseTitle: string | null;
  minutes: number | null;
  handle: string;
  variant: number;
  avoid: Avoid;
}

function talkClip(choice: Choice, exercises: CatalogExercise[]): ClipSpec {
  const withTalks = exercises
    .map((e) => ({ ...e, talks: e.talks.filter((t) => isAllowedMediaUrl(t.video_url)) }))
    .filter((e) => e.talks.length > 0);
  const named = findNamed(exercises, choice.exerciseId, choice.exerciseTitle);
  let candidates: CatalogExercise[];
  if (named) {
    candidates = withTalks.filter((e) => e.id === named.id);
    if (candidates.length === 0) {
      throw new ClipRequestError(`«${named.title}» todavía no tiene vídeo hablado. Grábalo y súbelo en «Vídeos hablados».`);
    }
  } else {
    if (withTalks.length === 0) {
      throw new ClipRequestError('Todavía no hay ningún vídeo hablado. Grábalos y súbelos en «Vídeos hablados».');
    }
    const best = Math.max(...withTalks.map((e) => matchScore(e, choice.muscles)));
    candidates = withTalks.filter((e) => matchScore(e, choice.muscles) === best && best > 0);
    if (candidates.length === 0) {
      const covered = [...new Set(withTalks.flatMap(primaryOf))];
      throw new ClipRequestError(
        `No hay vídeos hablados de ${musclesLabel(choice.muscles)}.${covered.length ? ` Hay de ${musclesLabel(covered)}.` : ''} Graba uno en «Vídeos hablados».`,
      );
    }
  }
  const pool = candidates.flatMap((e) => e.talks.map((talk) => ({ talk, exercise: e })));
  const fresh = pool.filter((p) => !choice.avoid.talkIds.includes(p.talk.id));
  const picked = shuffle(fresh.length ? fresh : pool)[0];
  const { talk, exercise } = picked;
  const focus = focusOf(primaryOf(exercise));
  const title = exercise.title.trim();
  const plainExercise: Exercise = { ...exercise, talks: undefined };
  const plainTalk: ExerciseTalk = { ...talk };
  return {
    type: choice.type,
    handle: choice.handle,
    prompt: cleanPrompt(`${title}: cómo se hace`, title),
    variant: choice.variant,
    queue: [],
    meta: looseMeta([plainExercise], focus, Number(talk.duration_seconds) || 15),
    talks: [{ talk: plainTalk, exercise: plainExercise }],
    avoidExerciseIds: choice.avoid.exerciseIds,
    headline: `Así se hace: ${title}`.length <= 28 ? `Así se hace: ${title}` : title,
    kicker: focus === 'Full body' ? 'TE LO EXPLICO' : focus.toUpperCase(),
  };
}

function mixClip(choice: Choice, exercises: CatalogExercise[]): ClipSpec {
  const workouts = exercises.filter((e) => (e.type ?? 'workout').toLowerCase() === 'workout');
  const best = workouts.length ? Math.max(...workouts.map((e) => matchScore(e, choice.muscles))) : 0;
  const pool = workouts.filter((e) => best > 0 && matchScore(e, choice.muscles) >= Math.min(best, 1));
  const label = musclesLabel(choice.muscles);
  if (pool.length < 3) {
    throw new ClipRequestError(
      pool.length === 0
        ? `No hay ejercicios de ${label} en la biblioteca.`
        : `Solo hay ${pool.length} ${pool.length === 1 ? 'ejercicio' : 'ejercicios'} de ${label} en la biblioteca y la mezcla necesita al menos 3.`,
    );
  }
  const named = findNamed(pool, choice.exerciseId, choice.exerciseTitle);
  const avoid = new Set(choice.avoid.exerciseIds);
  const ordered = [
    ...(named ? [named] : []),
    ...shuffle(pool.filter((e) => e !== named && !avoid.has(e.id))),
    ...shuffle(pool.filter((e) => e !== named && avoid.has(e.id))),
  ];
  const picked = ordered.slice(0, Math.min(5, ordered.length)).map((e): Exercise => ({ ...e, talks: undefined }));
  return {
    type: 'random_mix',
    handle: choice.handle,
    prompt: '',
    variant: choice.variant,
    queue: [],
    meta: looseMeta(picked, focusOf(choice.muscles), picked.length * 2.2 + 4),
    talks: [],
    avoidExerciseIds: choice.avoid.exerciseIds,
  };
}

function routineClip(choice: Choice, exercises: CatalogExercise[]): ResolvedClip {
  const muscles: RoutineIntent['muscles'] = choice.muscles.length
    ? choice.muscles.map((id) => ({ id, role: 'primary' as const, weight: 1 }))
    : ALL_MUSCLE_IDS.map((id) => ({
        id,
        role: (['pectorales', 'dorsales', 'cuadriceps', 'gluteos', 'hombros', 'abdominales'] as MuscleId[]).includes(id) ? ('primary' as const) : ('secondary' as const),
        weight: 0.6,
      }));
  const minutes = Math.max(3, Math.min(60, Math.round(choice.minutes ?? (choice.type === 'full' ? 20 : 15))));
  const intent: RoutineIntent = {
    muscles,
    difficulty: 5,
    targetMinutes: minutes,
    slotSeconds: null,
    includeWarmup: true,
    focusLabel: focusOf(choice.muscles),
  };
  const { queue, meta } = buildRoutine(exercises, intent, Math.random, { recentExerciseIds: choice.avoid.exerciseIds });
  if (uniqueExercises(meta).length === 0) {
    throw new ClipRequestError(`No hay ejercicios de ${musclesLabel(choice.muscles)} para montar una rutina.`);
  }
  return fromRoutine({
    type: choice.type,
    routine: { queue, meta, prompt: `${meta.focusLabel}, ${minutes} minutos` },
    handle: choice.handle,
    variant: choice.variant,
    avoid: choice.avoid,
  });
}

/** Resolve a Studio request against the catalog. Throws ClipRequestError when it cannot be met. */
export async function fromChoice(choice: Choice): Promise<ResolvedClip> {
  const catalog = await readCatalog();
  const exercises = usable(catalog.exercises);
  if (exercises.length === 0) throw new ClipRequestError('La biblioteca está vacía: sube algún ejercicio primero.');
  switch (choice.type) {
    case 'talk':
    case 'intro_talk':
      return finish(talkClip(choice, exercises));
    case 'random_mix':
      return finish(mixClip(choice, exercises));
    default:
      return routineClip(choice, exercises);
  }
}

/** What a request reads like in the queue when it was not a sentence. */
export function describeChoice(choice: Pick<Choice, 'type' | 'muscles' | 'minutes'>, exerciseTitle: string | null): string {
  const bits: string[] = [CLIP_TYPE_NAMES[choice.type]];
  if (choice.muscles.length) bits.push(musclesLabel(choice.muscles));
  if (exerciseTitle) bits.push(exerciseTitle);
  if (choice.type === 'full' && choice.minutes) bits.push(`${choice.minutes} min`);
  return bits.join(' · ');
}

/** Catalog titles, for the sentence reader to recognise a named exercise. */
export async function catalogTitles(): Promise<string[]> {
  const catalog = await readCatalog();
  return usable(catalog.exercises).map((e) => e.title);
}

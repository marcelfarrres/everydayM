import 'server-only';
import type { ClipType } from '@/lib/clips/types';
import { getItemDuration } from '@/lib/routine';
import { dayExercises, type Ctx, type Part } from '@/lib/server/clips/context';
import { marcelPart, typingPart } from '@/lib/server/clips/parts/opening';
import { anyRestPart, endPart, exercisePart, planPart } from '@/lib/server/clips/parts/routine';
import { challengePart, cutPart, listItemPart, titlePart } from '@/lib/server/clips/parts/shorts';
import { talkPart } from '@/lib/server/clips/parts/talk';
import type { Exercise, ExerciseTalk, RoutineItem, RoutineMeta } from '@/types/workout';

/*
 * What each clip type is made of. A spec is everything a render needs, decided before it
 * starts (exercises picked, routine built), so it can be stored and rendered again later.
 */

export interface ClipSpec {
  type: ClipType;
  handle: string;
  prompt: string; // the sentence typed in the opening
  variant: number;
  queue: RoutineItem[]; // [] for types without a routine
  meta: RoutineMeta; // a routine-shaped summary for types without a routine
  talks: { talk: ExerciseTalk; exercise: Exercise }[]; // talk types: the one talk to show
  avoidExerciseIds: string[]; // a regeneration prefers other exercises when it can
  headline?: string;
  kicker?: string; // label over the talk's title
}

/** `n` of the day's exercises: the first ones, or on a regeneration others first, rotated. */
export function choose(day: Exercise[], n: number, spec: Pick<ClipSpec, 'variant' | 'avoidExerciseIds'>): Exercise[] {
  if (spec.variant === 0 && spec.avoidExerciseIds.length === 0) return day.slice(0, n);
  const avoid = new Set(spec.avoidExerciseIds);
  const fresh = day.filter((e) => !avoid.has(e.id));
  const shift = fresh.length ? spec.variant % fresh.length : 0;
  const rotated = [...fresh.slice(shift), ...fresh.slice(0, shift)];
  return [...rotated, ...day.filter((e) => avoid.has(e.id))].slice(0, n);
}

export function partsFor(spec: ClipSpec): Part[] {
  const { meta, queue } = spec;
  // Routine videos open the same way, with that day's sentence: it types itself, Marcel gets
  // ready, the plan appears over the day's exercises.
  const opening = () => [typingPart(), marcelPart(4.7)];
  const day = dayExercises(meta);
  const focus = (meta.focusLabel || 'todo el cuerpo').toLowerCase();

  switch (spec.type) {
    case 'summary': {
      const shots = choose(day, 4, spec);
      return [...opening(), planPart(2.6), ...shots.map((e, k) => cutPart(e, k, shots.length, 1.6)), endPart(2.4)];
    }
    case 'top3': {
      const three = choose(day, 3, spec);
      return [
        titlePart('hook', 1.8, () => three[0], () => ({ kicker: 'SIN MATERIAL', title: `${three.length} ejercicios para ${focus}`, sub: 'Guárdalo para tu próximo entreno' })),
        ...three.map((e, k) => listItemPart(e, k, three.length, 4)),
        endPart(2.4),
      ];
    }
    case 'challenge': {
      const three = choose(day, 3, spec);
      return [
        titlePart('hook', 2, () => three[0], () => ({ kicker: 'RETO', title: 'Aguanta 1 minuto conmigo', sub: `${meta.focusLabel} · sin parar` })),
        ...three.map((e, k) => challengePart(e, k, three.length, 20, three[k + 1])),
        titlePart('end', 2.6, () => three[Math.min(2, three.length - 1)], (ctx: Ctx) => ({ title: '¿Lo has aguantado?', sub: `Comenta «hecho» · ${ctx.handle}` })),
      ];
    }
    case 'random_mix': {
      const mix = day;
      return [
        titlePart('hook', 1.8, () => mix[0], () => ({ kicker: 'MEZCLA AL AZAR', title: `${mix.length} ejercicios de ${focus}`, sub: 'Sin rutina: elige y dale' })),
        ...mix.map((e, k) => cutPart(e, k, mix.length, 2.2)),
        titlePart('end', 2.4, () => mix[mix.length - 1], (ctx: Ctx) => ({ title: '¿Cuál te cuesta más?', sub: `Comenta · ${ctx.handle}` })),
      ];
    }
    case 'talk':
      return spec.talks.map(({ talk, exercise }) => talkPart(talk, exercise, { title: true, kicker: spec.kicker ?? 'TE LO EXPLICO' }));
    case 'intro_talk':
      return [...opening(), ...spec.talks.map(({ talk, exercise }) => talkPart(talk, exercise, { title: false, kicker: spec.kicker ?? 'TE LO EXPLICO' }))];
    case 'carousel':
      return []; // photos, rendered by renderCarousel
    case 'full':
      // The routine no longer has a plan step, but the full video still shows the plan after the opening.
      return [
        ...opening(),
        planPart(5),
        ...queue.flatMap((item, index): Part[] => {
          const seconds = getItemDuration(item, meta.slotSeconds);
          switch (item.kind) {
            case 'warmup':
            case 'workout':
              return [exercisePart(index, seconds)];
            case 'rest':
              return [anyRestPart(item, index, seconds)];
            case 'outro':
              return [endPart(Math.min(seconds, 4))];
          }
        }),
      ];
  }
}

/** Every media URL the parts will read, and the talks among them (probed for length and voice). */
export function mediaFor(spec: ClipSpec): { videos: string[]; talks: string[] } {
  const videos = new Set<string>();
  const talks = new Set<string>();
  for (const { talk } of spec.talks) talks.add(talk.video_url);
  if (spec.type !== 'talk' && spec.type !== 'intro_talk') {
    dayExercises(spec.meta).forEach((e) => videos.add(e.video_url));
  }
  if (spec.type === 'full') {
    for (const item of spec.queue) {
      if (item.kind === 'warmup' || item.kind === 'workout') videos.add(item.exercise.video_url);
      if (item.kind === 'rest') {
        videos.add(item.nextExercise.video_url);
        if (item.restKind === 'long' && Array.isArray(item.talks)) item.talks.forEach((t) => talks.add(t.video_url));
      }
    }
  }
  return { videos: [...videos], talks: [...talks] };
}

/** Whether the clip carries Marcel's voice (it then gets loudness-normalised). */
export function hasVoice(spec: ClipSpec): boolean {
  return mediaFor(spec).talks.length > 0;
}

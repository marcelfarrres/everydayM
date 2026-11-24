import { clipNeedsTalk, type ClipType } from '@/lib/clips/types';
import type { MuscleId } from '@/types/workout';

/*
 * Sentence → clip, without Gemini: a deterministic keyword reading of what Marcel writes in the
 * Studio ("hazme un clip de un ejercicio de glúteo donde salgo explicando"). The Gemini reading
 * (lib/server/clips/sentence.ts) returns the same shape and falls back to this one.
 * Pure on purpose: no catalog access, no 'server-only', covered by intent.test.ts.
 */

export interface ClipIntent {
  type: ClipType;
  muscles: MuscleId[]; // [] = any
  exercise: string | null; // an exercise named in the sentence, as a catalog title when known
  needsTalk: boolean; // Marcel speaking on camera was asked for
  minutes: number | null; // only meaningful for the full routine
}

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const TALK_WORDS = /\b(explic\w*|hablando|hablado|hablados|hablo|hable|cuento|cuenta\w*|consejos?|tecnica|voz|digo|comento|comentando)\b/;
const INTRO_WORDS = /\b(intro|entrada|apertura|presentacion|teclado|frase escribiendose)\b/;

const TYPE_RULES: ReadonlyArray<{ type: ClipType; test: (t: string) => boolean }> = [
  { type: 'carousel', test: (t) => /\b(carrusel|carrousel|fotos?|diapositivas?|slides?)\b/.test(t) },
  {
    type: 'full',
    test: (t) =>
      /\b(rutina|entreno|entrenamiento|video|clase|sesion)\s+(completa|completo|entera|entero)\b/.test(t) ||
      /\b(de principio a fin|hazla conmigo|para seguirla|para hacerla)\b/.test(t),
  },
  { type: 'challenge', test: (t) => /\b(reto|desafio|challenge|aguanta\w*)\b/.test(t) },
  { type: 'top3', test: (t) => /\b(top ?3|top tres|3 ejercicios|tres ejercicios)\b/.test(t) },
  { type: 'summary', test: (t) => /\b(resumen|teaser|avance|vistazo)\b/.test(t) },
  { type: 'intro_talk', test: (t) => INTRO_WORDS.test(t) },
  { type: 'talk', test: (t) => TALK_WORDS.test(t) },
  { type: 'random_mix', test: (t) => /\b(mezcla\w*|azar|aleatori\w*|random|variad\w*|sueltos?|cualquiera|al tun tun)\b/.test(t) },
];

const LEGS: MuscleId[] = ['cuadriceps', 'isquiotibiales', 'gluteos', 'gemelos', 'aductores'];

const MUSCLE_RULES: ReadonlyArray<{ pattern: RegExp; muscles: MuscleId[] }> = [
  { pattern: /\b(glute\w*|culo|nalgas?)\b/, muscles: ['gluteos'] },
  { pattern: /\b(cuadricep\w*|cuads?)\b/, muscles: ['cuadriceps'] },
  { pattern: /\b(isquio\w*|femoral\w*)\b/, muscles: ['isquiotibiales'] },
  { pattern: /\b(gemelos?|pantorrillas?)\b/, muscles: ['gemelos'] },
  { pattern: /\b(aductor\w*)\b/, muscles: ['aductores'] },
  { pattern: /\b(piernas?|tren inferior)\b/, muscles: LEGS },
  { pattern: /\b(pecho|pectoral\w*)\b/, muscles: ['pectorales'] },
  { pattern: /\b(hombros?|deltoide\w*)\b/, muscles: ['hombros'] },
  { pattern: /\b(bicep\w*)\b/, muscles: ['biceps'] },
  { pattern: /\b(tricep\w*)\b/, muscles: ['triceps'] },
  { pattern: /\b(antebrazos?)\b/, muscles: ['antebrazos'] },
  { pattern: /\b(brazos?)\b/, muscles: ['biceps', 'triceps', 'antebrazos'] },
  { pattern: /\b(core|zona media)\b/, muscles: ['abdominales', 'oblicuos', 'lumbares'] },
  { pattern: /\b(abdominal\w*|abdomen|abs|barriga|tripa)\b/, muscles: ['abdominales'] },
  { pattern: /\b(oblicuos?)\b/, muscles: ['oblicuos'] },
  { pattern: /\b(espalda)\b/, muscles: ['dorsales', 'trapecio', 'lumbares'] },
  { pattern: /\b(dorsal\w*)\b/, muscles: ['dorsales'] },
  { pattern: /\b(trapecios?)\b/, muscles: ['trapecio'] },
  { pattern: /\b(lumbar\w*)\b/, muscles: ['lumbares'] },
];

/** The muscles a sentence names, in order of first mention; [] when it names none. */
export function musclesIn(text: string): MuscleId[] {
  const t = normalize(text);
  const found: { index: number; muscles: MuscleId[] }[] = [];
  for (const rule of MUSCLE_RULES) {
    const match = rule.pattern.exec(t);
    if (match) found.push({ index: match.index, muscles: rule.muscles });
  }
  found.sort((a, b) => a.index - b.index);
  return [...new Set(found.flatMap((f) => f.muscles))];
}

/** The clip type a sentence asks for, or null when it does not say. */
export function clipTypeIn(text: string): ClipType | null {
  const t = normalize(text);
  return TYPE_RULES.find((rule) => rule.test(t))?.type ?? null;
}

/**
 * The clip type a review comment asks to switch to, or null. Stricter than a request: "la
 * música tapa la voz" talks about the voice, it does not ask for a vídeo hablado.
 */
export function clipTypeInComment(text: string): ClipType | null {
  const t = normalize(text);
  const type = clipTypeIn(text);
  if (type === 'talk') return /\b(video hablado|hablado|hablando|explicando)\b/.test(t) ? type : null;
  if (type === 'random_mix') return /\b(mezcla\w*|azar|aleatori\w*)\b/.test(t) ? type : null;
  return type;
}

function minutesIn(text: string): number | null {
  const t = normalize(text);
  if (/\bmedia hora\b/.test(t)) return 30;
  if (/\b(una|1) hora\b/.test(t)) return 60;
  const match = /\b(\d{1,3}) ?(min|mins|minuto|minutos)\b/.exec(t);
  if (!match) return null;
  const minutes = Number(match[1]);
  return minutes >= 1 && minutes <= 90 ? minutes : null;
}

const STOP_WORDS = new Set(['de', 'del', 'con', 'en', 'la', 'el', 'los', 'las', 'y', 'a', 'al', 'por', 'para', 'sin', 'un', 'una', 'o']);

function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

/**
 * The catalog title a text names ("sentadillas búlgaras" → "Sentadilla búlgara"), or null.
 * A title matches when most of its words appear in the text (plurals and endings allowed).
 */
export function matchExerciseTitle(text: string, titles: readonly string[]): string | null {
  const words = normalize(text).split(' ');
  const has = (token: string) => {
    const stem = token.slice(0, Math.max(4, token.length - 2));
    return words.some((w) => w === token || (w.length >= 4 && w.startsWith(stem)));
  };
  let best: { title: string; score: number; length: number } | null = null;
  for (const title of titles) {
    const wanted = tokens(title);
    if (wanted.length === 0) continue;
    const hits = wanted.filter(has);
    if (!hits.some((w) => w.length >= 4)) continue;
    const score = hits.length / wanted.length;
    if (score < 0.66) continue;
    if (!best || score > best.score || (score === best.score && wanted.length > best.length)) {
      best = { title, score, length: wanted.length };
    }
  }
  return best?.title ?? null;
}

/** The keyword reading of a sentence. `titles` lets it recognise a named exercise. */
export function parseClipIntentKeywords(sentence: string, titles: readonly string[] = []): ClipIntent {
  const text = sentence.slice(0, 500);
  const t = normalize(text);
  const talkWords = TALK_WORDS.test(t);
  let type = clipTypeIn(text);
  // "Intro" without a talk still means the only type that opens with the intro and needs no routine.
  if (type === null) type = talkWords ? 'talk' : 'random_mix';
  return {
    type,
    muscles: musclesIn(text),
    exercise: matchExerciseTitle(text, titles),
    needsTalk: clipNeedsTalk(type) || talkWords,
    minutes: minutesIn(text),
  };
}

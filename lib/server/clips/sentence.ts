import 'server-only';
import { matchExerciseTitle, parseClipIntentKeywords, type ClipIntent } from '@/lib/clips/intent';
import { IMPLEMENTED_CLIP_TYPES, clipNeedsTalk, clipTypesForPrompt, isClipType } from '@/lib/clips/types';
import { ALL_MUSCLE_IDS } from '@/lib/intent/types';
import type { MuscleId } from '@/types/workout';

/*
 * Sentence → clip request with Gemini, the same way lib/intent/gemini.ts reads routine requests
 * (GEMINI_API_KEY, GEMINI_MODEL, an 8 s timeout, a JSON schema). Without a key, on a timeout or
 * on a bad answer, the deterministic keyword reading in lib/clips/intent.ts takes over.
 */

const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';
const GEMINI_TIMEOUT_MS = 8_000;
const MAX_TITLES_IN_PROMPT = 200;

export type ClipIntentSource = 'gemini' | 'keywords';

function instruction(titles: readonly string[]): string {
  return `Eres el ayudante del Estudio de EverydayM. Marcel, entrenador, escribe qué clip de TikTok quiere y tú lo conviertes en un objeto JSON con el esquema pedido.
Tipos de clip (campo type): ${clipTypesForPrompt()}.
- talk: un vídeo hablado suyo solo (él a cámara explicando un ejercicio, con voz). Usa talk si dice que sale explicando, hablando, contando o dando un consejo.
- intro_talk: la entrada de siempre (su frase escribiéndose y él preparado) y después un vídeo hablado.
- random_mix: ejercicios sueltos de la biblioteca, sin rutina. Es el tipo por defecto si no pide otro.
- full: la rutina completa para seguirla, con música. summary, top3, challenge y carousel salen de una rutina.
muscles: los músculos que nombra, con estos IDs: ${ALL_MUSCLE_IDS.join(', ')}. "piernas" = cuadriceps, isquiotibiales, gluteos, gemelos, aductores; "brazos" = biceps, triceps, antebrazos; "core" = abdominales, oblicuos, lumbares; "espalda" = dorsales, trapecio, lumbares. Vacío si no nombra ninguno.
exercise: si nombra un ejercicio concreto, su título exacto de esta lista; si no, null. Lista: ${titles.slice(0, MAX_TITLES_IN_PROMPT).join(' | ') || '(vacía)'}.
needsTalk: true si quiere que salga él hablando.
minutes: minutos de la rutina completa si los dice; si no, null.`;
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    type: { type: 'STRING', enum: [...IMPLEMENTED_CLIP_TYPES] },
    muscles: { type: 'ARRAY', items: { type: 'STRING', enum: [...ALL_MUSCLE_IDS] } },
    exercise: { type: 'STRING', nullable: true },
    needsTalk: { type: 'BOOLEAN' },
    minutes: { type: 'INTEGER', nullable: true },
  },
  required: ['type', 'muscles', 'exercise', 'needsTalk', 'minutes'],
} as const;

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/** Gemini's answer, checked field by field; null when it is not usable. */
function sanitize(raw: unknown, titles: readonly string[]): ClipIntent | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!isClipType(r.type)) return null;
  const muscles = Array.isArray(r.muscles)
    ? [...new Set(r.muscles.filter((m): m is MuscleId => typeof m === 'string' && (ALL_MUSCLE_IDS as readonly string[]).includes(m)))]
    : [];
  const named = typeof r.exercise === 'string' && r.exercise.trim() ? r.exercise.trim().slice(0, 120) : null;
  const exercise = named ? (titles.find((t) => t.toLowerCase() === named.toLowerCase()) ?? matchExerciseTitle(named, titles)) : null;
  const minutes = typeof r.minutes === 'number' && Number.isFinite(r.minutes) && r.minutes >= 1 && r.minutes <= 90 ? Math.round(r.minutes) : null;
  return { type: r.type, muscles, exercise, needsTalk: clipNeedsTalk(r.type) || r.needsTalk === true, minutes };
}

export async function readClipSentence(text: string, titles: readonly string[]): Promise<{ intent: ClipIntent; source: ClipIntentSource }> {
  const clean = text.trim().slice(0, 500);
  const fallback = () => ({ intent: parseClipIntentKeywords(clean, titles), source: 'keywords' as const });
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return fallback();

  const rawModel = process.env.GEMINI_MODEL?.trim();
  const model = rawModel && /^[a-zA-Z0-9._-]+$/.test(rawModel) ? rawModel : DEFAULT_GEMINI_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instruction(titles) }] },
        contents: [{ role: 'user', parts: [{ text: clean }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA },
      }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return fallback();
    const payload = (await res.json()) as GeminiResponse;
    const json = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!json) return fallback();
    const intent = sanitize(JSON.parse(json) as unknown, titles);
    return intent ? { intent, source: 'gemini' } : fallback();
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}

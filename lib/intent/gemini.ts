import 'server-only';

import { parseIntentKeywords, sanitizeRoutineIntent } from './keywords';
import {
  ALL_MUSCLE_IDS,
  type RoutineIntent,
  type RoutineIntentResponse,
} from './types';

// An alias, not a pinned version: Google retires pinned models (2.5-flash stopped working for
// new keys). Lite answers in ~2 s, well inside the 8 s timeout; reading one sentence needs no more.
const DEFAULT_GEMINI_MODEL = 'gemini-flash-lite-latest';
const GEMINI_TIMEOUT_MS = 8_000;

const SYSTEM_INSTRUCTION = `Eres el motor de interpretación de entrenamientos de EverydayM.
Convierte la petición del usuario (en español o inglés) en un objeto JSON que siga estrictamente el esquema solicitado.

Reglas de mapeo:
1. IDs de músculos válidos: pectorales, hombros, biceps, antebrazos, abdominales, oblicuos, cuadriceps, aductores, gemelos, trapecio, dorsales, triceps, lumbares, gluteos, isquiotibiales.
2. Grupos musculares:
   - "brazos" -> biceps, triceps, antebrazos.
   - "piernas" / "pierna" / "tren inferior" -> cuadriceps, isquiotibiales, gluteos, gemelos, aductores.
   - "core" / "abdomen" -> abdominales, oblicuos, lumbares.
   - "espalda" -> dorsales, trapecio, lumbares.
   - "tren superior" / "torso" -> pectorales, dorsales, trapecio, hombros, biceps, triceps, antebrazos.
   - "empuje" / "push" -> pectorales, hombros, triceps.
   - "tirón" / "pull" -> dorsales, trapecio, biceps, antebrazos.
   - "full body" / "cuerpo completo" -> incluye los 15 músculos con role="secondary" (weight ~0.45) y marca los músculos de enfoque ("enfoque en X", "prioridad en X") con role="primary" y weight=1.0. Si es full body sin foco específico, marca pectorales, dorsales, cuadriceps, gluteos, hombros y abdominales como "primary" (weight 0.8) y el resto "secondary" (weight 0.45).
3. "enfoque en X" / "foco en X" / "prioridad en X" -> esos músculos llevan role="primary" y weight=1.0; el resto de músculos mencionados llevan role="secondary" y weight entre 0.45 y 0.65.
4. difficulty: entero del 1 al 10 (fácil/principiante=3, intermedio=6, difícil/avanzado/intenso=8, extremo=9, por defecto=5, o el nivel explícito que pida el usuario).
5. targetMinutes: duración total en minutos (ej. "40 minutos" -> 40, "media hora" -> 30, "1 hora" -> 60). Si no se menciona duración total, devuelve null.
6. slotSeconds: duración en segundos por serie/ejercicio solo si el usuario lo especifica (ej. "series de 45 segundos" -> 45). Si no lo especifica, devuelve null.
7. includeWarmup: true por defecto; false solo si pide "sin calentamiento" / "no warmup".
8. focusLabel: resumen corto en español, por ejemplo "Full body · brazos", "Espalda y bíceps", "Piernas · glúteos".
9. Una rutina son bloques (también "rondas", "vueltas" o "circuitos") de series (cada serie es un ejercicio).
   - rounds: número de bloques solo si el usuario lo dice ("3 bloques", "cuatro rondas"); si no, null.
   - exercisesPerRound: series por bloque solo si lo dice ("3 bloques de 4 series" -> rounds 3 y exercisesPerRound 4; "5 ejercicios por ronda" -> 5); si no, null. "Series de 45 segundos" es slotSeconds, no exercisesPerRound.
   - variation: "all" si pide bloques distintos entre sí ("bloques distintos", "todas las rondas diferentes", "sin repetir ejercicios"); "same" si pide repetir lo mismo ("siempre lo mismo", "el mismo circuito", "bloques iguales"); "some" solo si pide pocos cambios; null si no dice nada.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    muscles: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: {
            type: 'STRING',
            enum: [...ALL_MUSCLE_IDS],
          },
          role: {
            type: 'STRING',
            enum: ['primary', 'secondary'],
          },
          weight: {
            type: 'NUMBER',
          },
        },
        required: ['id', 'role', 'weight'],
      },
    },
    difficulty: {
      type: 'INTEGER',
    },
    targetMinutes: {
      type: 'INTEGER',
      nullable: true,
    },
    slotSeconds: {
      type: 'INTEGER',
      nullable: true,
    },
    includeWarmup: {
      type: 'BOOLEAN',
    },
    focusLabel: {
      type: 'STRING',
    },
    rounds: {
      type: 'INTEGER',
      nullable: true,
    },
    exercisesPerRound: {
      type: 'INTEGER',
      nullable: true,
    },
    variation: {
      type: 'STRING',
      enum: ['same', 'some', 'all'],
      nullable: true,
    },
  },
  required: [
    'muscles',
    'difficulty',
    'targetMinutes',
    'slotSeconds',
    'includeWarmup',
    'focusLabel',
    'rounds',
    'exercisesPerRound',
    'variation',
  ],
} as const;

interface GeminiGenerateContentResponse {
  candidates?: {
    content?: {
      parts?: {
        text?: string;
      }[];
    };
  }[];
}

export async function parseIntentWithGemini(
  text: string,
): Promise<RoutineIntent> {
  const result = await resolveRoutineIntent(text);
  return result.intent;
}

export async function resolveRoutineIntent(
  text: string,
): Promise<RoutineIntentResponse> {
  const cleanText = text.trim().slice(0, 500);
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return {
      intent: parseIntentKeywords(cleanText),
      source: 'keywords',
    };
  }

  const rawModel = process.env.GEMINI_MODEL?.trim();
  const model =
    rawModel && /^[a-zA-Z0-9._-]+$/.test(rawModel)
      ? rawModel
      : DEFAULT_GEMINI_MODEL;

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model,
  )}:generateContent`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        contents: [
          {
            role: 'user',
            parts: [{ text: cleanText }],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      return {
        intent: parseIntentKeywords(cleanText),
        source: 'keywords',
      };
    }

    const payload = (await response.json()) as GeminiGenerateContentResponse;
    const rawJsonText = payload.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawJsonText || typeof rawJsonText !== 'string') {
      return {
        intent: parseIntentKeywords(cleanText),
        source: 'keywords',
      };
    }

    const parsed: unknown = JSON.parse(rawJsonText);
    const validatedIntent = sanitizeRoutineIntent(parsed, cleanText);

    return {
      intent: validatedIntent,
      source: 'gemini',
    };
  } catch {
    return {
      intent: parseIntentKeywords(cleanText),
      source: 'keywords',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

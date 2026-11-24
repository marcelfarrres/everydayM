import {
  ALL_MUSCLE_IDS,
  MUSCLE_LABELS_ES,
  type BlockVariation,
  type MuscleId,
  type MuscleRole,
  type RoutineIntent,
  type RoutineIntentMuscle,
} from './types';

export type { RoutineIntent, RoutineIntentMuscle };

interface ConceptDefinition {
  key: string;
  label: string;
  muscles: MuscleId[];
  patterns: RegExp[];
  isCompositeGroup?: boolean;
}

const FULL_BODY_PATTERNS: RegExp[] = [
  /\bfull\s*[-]?\s*body\b/i,
  /\bcuerpo\s+completo\b/i,
  /\btodo\s+el\s+cuerpo\b/i,
  /\bcuerpo\s+entero\b/i,
  /\btotal\s*[-]?\s*body\b/i,
  /\brutina\s+completa\b/i,
  /\bentrenamiento\s+completo\b/i,
  /\bgeneral\b/i,
];

const DEFAULT_FULL_BODY_PRIMARY: readonly MuscleId[] = [
  'pectorales',
  'dorsales',
  'cuadriceps',
  'gluteos',
  'hombros',
  'abdominales',
];

const CONCEPTS: readonly ConceptDefinition[] = [
  {
    key: 'tren_superior',
    label: 'tren superior',
    muscles: [
      'pectorales',
      'dorsales',
      'trapecio',
      'hombros',
      'biceps',
      'triceps',
      'antebrazos',
    ],
    patterns: [
      /\btren\s+superior\b/i,
      /\bupper\s*[-]?\s*body\b/i,
      /\bparte\s+superior\b/i,
      /\btorso\b/i,
    ],
    isCompositeGroup: true,
  },
  {
    key: 'tren_inferior',
    label: 'tren inferior',
    muscles: ['cuadriceps', 'isquiotibiales', 'gluteos', 'gemelos', 'aductores'],
    patterns: [
      /\btren\s+inferior\b/i,
      /\blower\s*[-]?\s*body\b/i,
      /\bparte\s+inferior\b/i,
    ],
    isCompositeGroup: true,
  },
  {
    key: 'brazos',
    label: 'brazos',
    muscles: ['biceps', 'triceps', 'antebrazos'],
    patterns: [/\bbrazos?\b/i, /\barms?\b/i],
    isCompositeGroup: true,
  },
  {
    key: 'piernas',
    label: 'piernas',
    muscles: ['cuadriceps', 'isquiotibiales', 'gluteos', 'gemelos', 'aductores'],
    patterns: [/\bpiernas?\b/i, /\blegs?\b/i, /\bleg\s+day\b/i],
    isCompositeGroup: true,
  },
  {
    key: 'core',
    label: 'core',
    muscles: ['abdominales', 'oblicuos', 'lumbares'],
    patterns: [/\bcore\b/i, /\btronco\b/i, /\bmedia\s+seccion\b/i],
    isCompositeGroup: true,
  },
  {
    key: 'espalda',
    label: 'espalda',
    muscles: ['dorsales', 'trapecio', 'lumbares'],
    patterns: [/\bespalda\b/i, /\bback\b/i],
    isCompositeGroup: true,
  },
  {
    key: 'empuje',
    label: 'empuje',
    muscles: ['pectorales', 'hombros', 'triceps'],
    patterns: [/\bempuje\b/i, /\bpush\b/i],
    isCompositeGroup: true,
  },
  {
    key: 'tiron',
    label: 'tirón',
    muscles: ['dorsales', 'trapecio', 'biceps', 'antebrazos'],
    patterns: [/\btiron\b/i, /\btraccion\b/i, /\bpull\b/i],
    isCompositeGroup: true,
  },
  {
    key: 'pectorales',
    label: 'pecho',
    muscles: ['pectorales'],
    patterns: [/\bpectorales?\b/i, /\bpecho\b/i, /\bchest\b/i, /\bpecs?\b/i],
  },
  {
    key: 'hombros',
    label: 'hombros',
    muscles: ['hombros'],
    patterns: [
      /\bhombros?\b/i,
      /\bdeltoides?\b/i,
      /\bshoulders?\b/i,
      /\bdelts?\b/i,
    ],
  },
  {
    key: 'biceps',
    label: 'bíceps',
    muscles: ['biceps'],
    patterns: [/\bbiceps?\b/i],
  },
  {
    key: 'triceps',
    label: 'tríceps',
    muscles: ['triceps'],
    patterns: [/\btriceps?\b/i],
  },
  {
    key: 'antebrazos',
    label: 'antebrazos',
    muscles: ['antebrazos'],
    patterns: [/\bantebrazos?\b/i, /\bforearms?\b/i, /\bagarre\b/i],
  },
  {
    key: 'abdominales',
    label: 'abdominales',
    muscles: ['abdominales'],
    patterns: [
      /\babdominales?\b/i,
      /\babdomen\b/i,
      /\babs\b/i,
      /\bsix\s*[-]?\s*pack\b/i,
      /\bvientre\b/i,
    ],
  },
  {
    key: 'oblicuos',
    label: 'oblicuos',
    muscles: ['oblicuos'],
    patterns: [/\boblicuos?\b/i, /\bobliques?\b/i, /\blaterales\b/i],
  },
  {
    key: 'cuadriceps',
    label: 'cuádriceps',
    muscles: ['cuadriceps'],
    patterns: [/\bcuadriceps?\b/i, /\bquads?\b/i, /\bmuslos?\b/i],
  },
  {
    key: 'isquiotibiales',
    label: 'isquiotibiales',
    muscles: ['isquiotibiales'],
    patterns: [
      /\bisquiotibiales?\b/i,
      /\bisquios?\b/i,
      /\bfemorales?\b/i,
      /\bfemoral\b/i,
      /\bhamstrings?\b/i,
    ],
  },
  {
    key: 'gluteos',
    label: 'glúteos',
    muscles: ['gluteos'],
    patterns: [
      /\bgluteos?\b/i,
      /\bglutes?\b/i,
      /\bpompis\b/i,
      /\bnalgas\b/i,
      /\bbooty\b/i,
    ],
  },
  {
    key: 'aductores',
    label: 'aductores',
    muscles: ['aductores'],
    patterns: [/\baductores?\b/i, /\badductors?\b/i, /\bcara\s+interna\b/i],
  },
  {
    key: 'gemelos',
    label: 'gemelos',
    muscles: ['gemelos'],
    patterns: [
      /\bgemelos?\b/i,
      /\bpantorrillas?\b/i,
      /\bcalves\b/i,
      /\bcalf\b/i,
      /\bsoleos?\b/i,
    ],
  },
  {
    key: 'trapecio',
    label: 'trapecio',
    muscles: ['trapecio'],
    patterns: [/\btrapecios?\b/i, /\btraps?\b/i],
  },
  {
    key: 'dorsales',
    label: 'dorsales',
    muscles: ['dorsales'],
    patterns: [/\bdorsales?\b/i, /\blats?\b/i, /\bespalda\s+alta\b/i],
  },
  {
    key: 'lumbares',
    label: 'lumbares',
    muscles: ['lumbares'],
    patterns: [
      /\blumbares?\b/i,
      /\blumbar\b/i,
      /\bespalda\s+baja\b/i,
      /\blower\s+back\b/i,
    ],
  },
];

const SPANISH_NUMBERS: Record<string, number> = {
  cinco: 5,
  diez: 10,
  quince: 15,
  veinte: 20,
  veinticinco: 25,
  treinta: 30,
  'treinta y cinco': 35,
  cuarenta: 40,
  'cuarenta y cinco': 45,
  cincuenta: 50,
  'cincuenta y cinco': 55,
  sesenta: 60,
  setenta: 70,
  ochenta: 80,
  noventa: 90,
};

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function joinLabelsEs(labels: string[]): string {
  const unique = Array.from(new Set(labels.filter(Boolean)));
  if (unique.length === 0) return 'Full body';
  if (unique.length === 1) return unique[0];
  if (unique.length === 2) return `${unique[0]} y ${unique[1]}`;
  return `${unique.slice(0, -1).join(', ')} y ${unique[unique.length - 1]}`;
}

function matchConceptsInSegment(segment: string): ConceptDefinition[] {
  const matched: { concept: ConceptDefinition; index: number }[] = [];

  for (const concept of CONCEPTS) {
    let earliestIndex = Number.POSITIVE_INFINITY;
    for (const pattern of concept.patterns) {
      const match = pattern.exec(segment);
      if (match && match.index < earliestIndex) {
        earliestIndex = match.index;
      }
    }
    if (Number.isFinite(earliestIndex)) {
      matched.push({ concept, index: earliestIndex });
    }
  }

  matched.sort((a, b) => a.index - b.index);
  return matched.map((item) => item.concept);
}

function extractClauseMatches(
  normalized: string,
  clausePatterns: RegExp[],
): ConceptDefinition[] {
  const results: ConceptDefinition[] = [];
  for (const regex of clausePatterns) {
    let match: RegExpExecArray | null = regex.exec(normalized);
    while (match !== null) {
      const clauseText = match[1] ?? '';
      results.push(...matchConceptsInSegment(clauseText));
      if (!regex.global) break;
      match = regex.exec(normalized);
    }
  }
  return results;
}

function parseTargetMinutes(normalized: string): number | null {
  if (/\b(?:una|1)\s+hora\s+y\s+media\b/.test(normalized)) return 90;
  if (/\b(?:una|1)\s+hora\s+y\s+cuarto\b/.test(normalized)) return 75;
  if (/\btres\s+cuartos\s+de\s+hora\b/.test(normalized)) return 45;
  if (/\bmedia\s+hora\b|\bhalf\s+(?:an\s+)?hour\b/.test(normalized)) return 30;
  if (/\bun\s+cuarto\s+de\s+hora\b/.test(normalized)) return 15;

  const hoursAndMins =
    /\b(\d{1,2})\s*(?:horas?|hours?|hrs?|h)\s*(?:y\s*|con\s*|and\s*)?(\d{1,2})\s*(?:minutos?|minutes?|mins?|m)?\b/.exec(
      normalized,
    );
  if (hoursAndMins) {
    const hours = Number.parseInt(hoursAndMins[1], 10);
    const mins = Number.parseInt(hoursAndMins[2], 10);
    if (Number.isFinite(hours) && Number.isFinite(mins)) {
      return clamp(hours * 60 + mins, 5, 180);
    }
  }

  const decimalHours =
    /\b(\d+(?:[.,]\d+)?)\s*(?:horas?|hours?|hrs?)\b/.exec(normalized);
  if (decimalHours) {
    const hours = Number.parseFloat(decimalHours[1].replace(',', '.'));
    if (Number.isFinite(hours) && hours > 0) {
      return clamp(Math.round(hours * 60), 5, 180);
    }
  }

  if (/\b(?:una|un)\s+hora\b|\b1\s*h\b|\b(?:an|one)\s+hour\b/.test(normalized)) {
    return 60;
  }

  const numericMinutes =
    /\b(\d{1,3})\s*(?:minutos?|minutes?|mins?|min|m)\b/.exec(normalized);
  if (numericMinutes) {
    const mins = Number.parseInt(numericMinutes[1], 10);
    if (Number.isFinite(mins) && mins > 0) {
      return clamp(mins, 5, 180);
    }
  }

  for (const [word, value] of Object.entries(SPANISH_NUMBERS)) {
    const wordRegex = new RegExp(`\\b${word}\\s*(?:minutos?|mins?|min)\\b`, 'i');
    if (wordRegex.test(normalized)) {
      return clamp(value, 5, 180);
    }
  }

  // "piernas 40": a lone number that is not rounds, seconds or kilos reads as minutes.
  const bare = /(?:^|[\s,])(\d{2})(?=$|[\s,.])(?!\s*(?:rondas?|bloques?|vueltas?|circuitos?|series?|ejercicios?|seg|s\b|kg|reps?|repeticiones))/.exec(normalized);
  if (bare) {
    const mins = Number.parseInt(bare[1], 10);
    if (mins >= 10 && mins <= 90) return mins;
  }

  return null;
}

// Counts said in words: "tres bloques", "cuatro series por bloque".
const COUNT_WORDS: Record<string, number> = {
  un: 1,
  una: 1,
  uno: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};
const COUNT = String.raw`(\d{1,2}|un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)`;
const BLOCK_WORD = String.raw`(?:bloques?|rondas?|vueltas?|circuitos?)`;
const SERIES_WORD = String.raw`(?:series?|ejercicios?)`;
export const MAX_ROUNDS = 10;
export const MAX_EXERCISES_PER_ROUND = 20;

function readCount(word: string, max: number): number | null {
  const value = COUNT_WORDS[word] ?? Number.parseInt(word, 10);
  return Number.isFinite(value) && value >= 1 && value <= max ? value : null;
}

/** "3 bloques", "tres rondas", "4 vueltas" → 3, 3, 4. null when the text does not say. */
export function parseRounds(text: string): number | null {
  const match = new RegExp(String.raw`\b${COUNT}\s+${BLOCK_WORD}\b`).exec(normalizeText(text));
  return match ? readCount(match[1], MAX_ROUNDS) : null;
}

const SERIES_PATTERNS: RegExp[] = [
  new RegExp(String.raw`\b${COUNT}\s+${SERIES_WORD}\s+(?:por|en\s+cada|cada|de\s+cada)\s+${BLOCK_WORD}`),
  new RegExp(String.raw`\b${BLOCK_WORD}\s+de\s+${COUNT}\s+${SERIES_WORD}\b`),
  new RegExp(String.raw`\b(?:cada|por)\s+${BLOCK_WORD}\s+(?:con\s+|de\s+|tiene\s+|lleva\s+)?${COUNT}\s+${SERIES_WORD}\b`),
];

/**
 * Series per block: "4 series por bloque", "bloques de 5 ejercicios", "cada ronda con 3 series".
 * A lone "4 series" is left alone: in a gym that often means sets, not series in a block.
 */
export function parseExercisesPerRound(text: string): number | null {
  const normalized = normalizeText(text);
  for (const pattern of SERIES_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match) return readCount(match[1], MAX_EXERCISES_PER_ROUND);
  }
  return null;
}

const DIFFERENT = String.raw`(?:distint[oa]s?|diferentes?|variad[oa]s?)`;
const VARIATION_ALL: RegExp[] = [
  // Checked before 'same', so "no quiero siempre lo mismo" is not read as "siempre lo mismo".
  /\bno\s+(?:\w+\s+){0,2}(?:siempre\s+)?(?:lo\s+mismo|los\s+mismos|el\s+mismo|iguales)\b/,
  new RegExp(String.raw`\b(?:bloques|rondas|vueltas|circuitos)\s+(?:\w+\s+){0,2}${DIFFERENT}`),
  new RegExp(String.raw`\bcada\s+(?:bloque|ronda|vuelta|circuito)\s+(?:\w+\s+){0,2}${DIFFERENT}`),
  new RegExp(String.raw`\b${DIFFERENT}\s+(?:en\s+)?cada\s+(?:bloque|ronda|vuelta|circuito)`),
  /\b(?:sin\s+repetir|no\s+repetir|que\s+no\s+se\s+repitan?|mucha\s+variedad|maxima\s+variedad)\b/,
];
const VARIATION_SAME: RegExp[] = [
  /\bsiempre\s+(?:lo\s+mismo|los\s+mismos|el\s+mismo|igual)\b/,
  /\b(?:bloques|rondas|vueltas|circuitos)\s+(?:\w+\s+){0,2}(?:iguales|identic[oa]s)\b/,
  /\bmismo\s+circuito\b/,
  /\blos\s+mismos\s+ejercicios\b/,
  /\brepetir\s+(?:el\s+)?circuito\b/,
];

/** "bloques distintos" → 'all', "siempre lo mismo" → 'same'; undefined when the text does not say. */
export function parseVariation(text: string): BlockVariation | undefined {
  const normalized = normalizeText(text);
  if (VARIATION_ALL.some((pattern) => pattern.test(normalized))) return 'all';
  if (VARIATION_SAME.some((pattern) => pattern.test(normalized))) return 'same';
  return undefined;
}

function parseSlotSeconds(normalized: string): number | null {
  const slotPatterns = [
    /\b(?:series?|ejercicios?|slots?|trabajo|intervalos?)\s+de\s+(\d{2,3})\s*(?:segundos?|segs?|seg|s)\b/,
    /\b(\d{2,3})\s*(?:segundos?|segs?|seg|s)\s+(?:por\s+ejercicio|de\s+trabajo|por\s+serie)\b/,
    /\bslots?\s*(?:de\s*)?(\d{2,3})\s*(?:segundos?|segs?|seg|s)?\b/,
  ];

  for (const pattern of slotPatterns) {
    const match = pattern.exec(normalized);
    if (match) {
      const secs = Number.parseInt(match[1], 10);
      if (Number.isFinite(secs)) {
        return clamp(secs, 20, 120);
      }
    }
  }

  return null;
}

function parseDifficulty(normalized: string): number {
  const explicitLevel =
    /\b(?:nivel|dificultad|intensidad|level|difficulty)\s*(?:de\s*)?(\d{1,2})(?:\s*\/\s*10|\s+de\s+10)?\b/.exec(
      normalized,
    ) ?? /\b(\d{1,2})\s*\/\s*10\b/.exec(normalized);

  if (explicitLevel) {
    const level = Number.parseInt(explicitLevel[1], 10);
    if (Number.isFinite(level)) {
      return clamp(level, 1, 10);
    }
  }

  const spanishDigitWords: Record<string, number> = {
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
  };
  for (const [word, val] of Object.entries(spanishDigitWords)) {
    const regex = new RegExp(
      `\\b(?:nivel|dificultad|intensidad)\\s+${word}\\b`,
      'i',
    );
    if (regex.test(normalized)) {
      return val;
    }
  }

  if (
    /\b(?:extremo|extrema|brutal|insano|insana|maximo|maxima|elite|a\s+tope|mortal|muy\s+dificil|muy\s+duro|muy\s+intenso)\b/.test(
      normalized,
    )
  ) {
    return 9;
  }

  if (
    /\b(?:dificil|avanzado|avanzada|intenso|intensa|duro|dura|canero|canera|exigente|fuerte|potente|pesado|hard|advanced|intense|heavy)\b/.test(
      normalized,
    )
  ) {
    return 8;
  }

  if (
    /\b(?:intermedio|intermedia|moderado|moderada|medio|media\s+intensidad|normal|estandar|intermediate|medium|moderate)\b/.test(
      normalized,
    )
  ) {
    return 6;
  }

  if (
    /\b(?:muy\s+facil|muy\s+suave|recuperacion|movilidad|relajado|relajada|ligero|ligera|very\s+easy|light)\b/.test(
      normalized,
    )
  ) {
    return 2;
  }

  if (
    /\b(?:facil|principiante|principiantes|basico|basica|iniciacion|suave|tranquilo|tranquila|beginner|easy)\b/.test(
      normalized,
    )
  ) {
    return 3;
  }

  return 5;
}

function parseIncludeWarmup(normalized: string): boolean {
  if (
    /\b(?:sin\s+calentamiento|sin\s+calentar|no\s+incluir\s+calentamiento|sin\s+warm\s*[-]?\s*up|no\s+warm\s*[-]?\s*up|skip\s+warm\s*[-]?\s*up|directo\s+al\s+grano|saltar(?:se)?\s+(?:el\s+)?calentamiento)\b/.test(
      normalized,
    )
  ) {
    return false;
  }

  if (
    /\b(?:con\s+calentamiento|incluir\s+calentamiento|incluye\s+calentamiento|calentamiento\s+incluido|con\s+warm\s*[-]?\s*up|with\s+warm\s*[-]?\s*up)\b/.test(
      normalized,
    )
  ) {
    return true;
  }

  return true;
}

const FOCUS_CLAUSE_PATTERNS: RegExp[] = [
  /\b(?:con\s+)?(?:enfoque|foco|prioridad|enfasis)\s+(?:en|a|sobre|hacia)\s+([^,.;]+?)(?=\b(?:que\s+dure|de\s+\d|durante\s+\d|en\s+\d|nivel|dificultad|intensidad|sin\s+calentamiento|con\s+calentamiento|pero|aunque)\b|[,.;]|$)/gi,
  /\b(?:centrad[oa]s?|enfocad[oa]s?|focalizad[oa]s?|priorizando|dando\s+prioridad\s+a|especial\s+hincapie\s+en|sobre\s+todo|principalmente|mas\s+de|focus(?:ed)?\s+on|prioritizing)\s+([^,.;]+?)(?=\b(?:que\s+dure|de\s+\d|durante\s+\d|en\s+\d|nivel|dificultad|intensidad|sin\s+calentamiento|con\s+calentamiento|pero|aunque)\b|[,.;]|$)/gi,
];

const SECONDARY_CLAUSE_PATTERNS: RegExp[] = [
  /\b(?:con\s+algo\s+de|algo\s+de|un\s+poco\s+de|un\s+toque\s+de|acompanad[oa]\s+de|complementando\s+con|secundario\s+de|secundariamente)\s+([^,.;]+?)(?=\b(?:que\s+dure|de\s+\d|durante\s+\d|en\s+\d|nivel|dificultad|intensidad|sin\s+calentamiento|con\s+calentamiento|con\s+enfoque|enfoque)\b|[,.;]|$)/gi,
];

export function parseIntentKeywords(text: string): RoutineIntent {
  const safeText = typeof text === 'string' ? text.slice(0, 500) : '';
  const normalized = normalizeText(safeText);

  const isFullBody = FULL_BODY_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );

  const focusConcepts = extractClauseMatches(normalized, FOCUS_CLAUSE_PATTERNS);
  const secondaryConcepts = extractClauseMatches(
    normalized,
    SECONDARY_CLAUSE_PATTERNS,
  );
  const allMentionedConcepts = matchConceptsInSegment(normalized);

  const focusKeySet = new Set(focusConcepts.map((c) => c.key));
  const secondaryKeySet = new Set(secondaryConcepts.map((c) => c.key));

  const generalConcepts = allMentionedConcepts.filter(
    (c) => !focusKeySet.has(c.key) && !secondaryKeySet.has(c.key),
  );

  const muscleMap = new Map<MuscleId, { role: MuscleRole; weight: number }>();

  const setMuscle = (id: MuscleId, role: MuscleRole, weight: number) => {
    const existing = muscleMap.get(id);
    if (!existing) {
      muscleMap.set(id, { role, weight: clamp(weight, 0, 1) });
      return;
    }
    const nextRole: MuscleRole =
      existing.role === 'primary' || role === 'primary'
        ? 'primary'
        : 'secondary';
    const nextWeight = clamp(Math.max(existing.weight, weight), 0, 1);
    muscleMap.set(id, { role: nextRole, weight: nextWeight });
  };

  let focusLabel = 'Full body';

  if (isFullBody) {
    // Full body: all 15 muscles start as secondary
    for (const id of ALL_MUSCLE_IDS) {
      setMuscle(id, 'secondary', 0.45);
    }

    const primaryConcepts =
      focusConcepts.length > 0 ? focusConcepts : generalConcepts;

    if (primaryConcepts.length > 0) {
      for (const concept of primaryConcepts) {
        for (const id of concept.muscles) {
          setMuscle(id, 'primary', 1.0);
        }
      }
      for (const concept of secondaryConcepts) {
        for (const id of concept.muscles) {
          if (muscleMap.get(id)?.role !== 'primary') {
            setMuscle(id, 'secondary', 0.65);
          }
        }
      }
      focusLabel = `Full body · ${joinLabelsEs(
        primaryConcepts.map((c) => c.label),
      )}`;
    } else {
      for (const id of DEFAULT_FULL_BODY_PRIMARY) {
        setMuscle(id, 'primary', 0.8);
      }
      focusLabel = 'Full body';
    }
  } else if (allMentionedConcepts.length > 0) {
    if (focusConcepts.length > 0) {
      // Explicit focus clause without full body (e.g. "tren superior con enfoque en pecho")
      for (const concept of generalConcepts) {
        for (const id of concept.muscles) {
          setMuscle(id, 'secondary', 0.55);
        }
      }
      for (const concept of secondaryConcepts) {
        for (const id of concept.muscles) {
          setMuscle(id, 'secondary', 0.5);
        }
      }
      for (const concept of focusConcepts) {
        for (const id of concept.muscles) {
          setMuscle(id, 'primary', 1.0);
        }
      }

      const baseLabels = generalConcepts.map((c) => c.label);
      const focusLabels = focusConcepts.map((c) => c.label);
      if (baseLabels.length > 0) {
        focusLabel = `${capitalize(joinLabelsEs(baseLabels))} · ${joinLabelsEs(
          focusLabels,
        )}`;
      } else {
        focusLabel = capitalize(joinLabelsEs(focusLabels));
      }
    } else {
      // Standard mention without separate focus phrase (e.g. "espalda y bíceps")
      generalConcepts.forEach((concept, idx) => {
        const weight = idx === 0 ? 1.0 : 0.85;
        for (const id of concept.muscles) {
          setMuscle(id, 'primary', weight);
        }
      });

      for (const concept of secondaryConcepts) {
        for (const id of concept.muscles) {
          if (muscleMap.get(id)?.role !== 'primary') {
            setMuscle(id, 'secondary', 0.5);
          }
        }
      }

      // If user only wrote "algo de abdomen", ensure at least one primary
      if (generalConcepts.length === 0 && secondaryConcepts.length > 0) {
        for (const concept of secondaryConcepts) {
          for (const id of concept.muscles) {
            setMuscle(id, 'primary', 0.8);
          }
        }
      }

      const primaryLabels =
        generalConcepts.length > 0
          ? generalConcepts.map((c) => c.label)
          : secondaryConcepts.map((c) => c.label);
      const secLabels =
        generalConcepts.length > 0
          ? secondaryConcepts.map((c) => c.label)
          : [];

      focusLabel =
        secLabels.length > 0
          ? `${capitalize(joinLabelsEs(primaryLabels))} · ${joinLabelsEs(
              secLabels,
            )}`
          : capitalize(joinLabelsEs(primaryLabels));
    }
  } else {
    // Fallback when no muscle or group was mentioned at all
    for (const id of ALL_MUSCLE_IDS) {
      const isMain = DEFAULT_FULL_BODY_PRIMARY.includes(id);
      setMuscle(id, isMain ? 'primary' : 'secondary', isMain ? 0.8 : 0.45);
    }
    focusLabel = 'Full body';
  }

  // Ensure at least one primary muscle is always present
  const muscles: RoutineIntentMuscle[] = Array.from(muscleMap.entries()).map(
    ([id, info]) => ({
      id,
      role: info.role,
      weight: Number(info.weight.toFixed(2)),
    }),
  );

  if (muscles.length > 0 && !muscles.some((m) => m.role === 'primary')) {
    muscles[0].role = 'primary';
    muscles[0].weight = Math.max(muscles[0].weight, 0.85);
  }

  const difficulty = parseDifficulty(normalized);
  const targetMinutes = parseTargetMinutes(normalized);
  const slotSeconds = parseSlotSeconds(normalized);
  const includeWarmup = parseIncludeWarmup(normalized);
  const variation = parseVariation(normalized);

  return {
    muscles,
    difficulty,
    targetMinutes,
    slotSeconds,
    includeWarmup,
    focusLabel,
    rounds: parseRounds(normalized),
    exercisesPerRound: parseExercisesPerRound(normalized),
    ...(variation ? { variation } : {}),
  };
}

export function sanitizeRoutineIntent(
  raw: unknown,
  fallbackText = '',
): RoutineIntent {
  const fallback = parseIntentKeywords(fallbackText);
  if (typeof raw !== 'object' || raw === null) {
    return fallback;
  }

  const record = raw as Record<string, unknown>;
  const validMuscleSet = new Set<string>(ALL_MUSCLE_IDS);

  const sanitizedMusclesMap = new Map<MuscleId, RoutineIntentMuscle>();
  if (Array.isArray(record.muscles)) {
    for (const item of record.muscles) {
      if (typeof item !== 'object' || item === null) continue;
      const entry = item as Record<string, unknown>;
      const id = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : '';
      if (!validMuscleSet.has(id)) continue;

      const muscleId = id as MuscleId;
      const role: MuscleRole =
        entry.role === 'primary' || entry.role === 'secondary'
          ? entry.role
          : 'primary';
      const rawWeight =
        typeof entry.weight === 'number' && Number.isFinite(entry.weight)
          ? entry.weight
          : role === 'primary'
            ? 0.9
            : 0.5;
      const weight = Number(clamp(rawWeight, 0.05, 1).toFixed(2));

      const prev = sanitizedMusclesMap.get(muscleId);
      if (!prev) {
        sanitizedMusclesMap.set(muscleId, { id: muscleId, role, weight });
      } else {
        sanitizedMusclesMap.set(muscleId, {
          id: muscleId,
          role:
            prev.role === 'primary' || role === 'primary'
              ? 'primary'
              : 'secondary',
          weight: Math.max(prev.weight, weight),
        });
      }
    }
  }

  let muscles = Array.from(sanitizedMusclesMap.values());
  if (muscles.length === 0) {
    muscles = fallback.muscles;
  } else if (!muscles.some((m) => m.role === 'primary')) {
    muscles.sort((a, b) => b.weight - a.weight);
    muscles[0] = {
      ...muscles[0],
      role: 'primary',
      weight: Math.max(muscles[0].weight, 0.85),
    };
  }

  const difficulty =
    typeof record.difficulty === 'number' && Number.isFinite(record.difficulty)
      ? clamp(Math.round(record.difficulty), 1, 10)
      : fallback.difficulty;

  let targetMinutes: number | null = fallback.targetMinutes;
  if (record.targetMinutes === null) {
    targetMinutes = fallback.targetMinutes;
  } else if (
    typeof record.targetMinutes === 'number' &&
    Number.isFinite(record.targetMinutes) &&
    record.targetMinutes > 0
  ) {
    targetMinutes = clamp(Math.round(record.targetMinutes), 5, 180);
  }

  let slotSeconds: number | null = fallback.slotSeconds;
  if (record.slotSeconds === null) {
    slotSeconds = fallback.slotSeconds;
  } else if (
    typeof record.slotSeconds === 'number' &&
    Number.isFinite(record.slotSeconds) &&
    record.slotSeconds > 0
  ) {
    slotSeconds = clamp(Math.round(record.slotSeconds), 20, 120);
  }

  const includeWarmup =
    typeof record.includeWarmup === 'boolean'
      ? record.includeWarmup
      : fallback.includeWarmup;

  let focusLabel =
    typeof record.focusLabel === 'string' ? record.focusLabel.trim() : '';
  if (!focusLabel) {
    const primaryNames = muscles
      .filter((m) => m.role === 'primary')
      .slice(0, 3)
      .map((m) => MUSCLE_LABELS_ES[m.id]);
    focusLabel =
      fallback.focusLabel || capitalize(joinLabelsEs(primaryNames));
  }
  focusLabel = focusLabel.slice(0, 80);

  // What the model leaves null falls back to what the local parser read in the sentence.
  const count = (value: unknown, max: number, fallbackValue: number | null | undefined) =>
    typeof value === 'number' && Number.isFinite(value) && value >= 1
      ? clamp(Math.round(value), 1, max)
      : (fallbackValue ?? null);
  const rounds = count(record.rounds, MAX_ROUNDS, fallback.rounds);
  const exercisesPerRound = count(
    record.exercisesPerRound,
    MAX_EXERCISES_PER_ROUND,
    fallback.exercisesPerRound,
  );
  const variation: BlockVariation | undefined =
    record.variation === 'same' || record.variation === 'some' || record.variation === 'all'
      ? record.variation
      : fallback.variation;

  return {
    muscles,
    difficulty,
    targetMinutes,
    slotSeconds,
    includeWarmup,
    focusLabel,
    rounds,
    exercisesPerRound,
    ...(variation ? { variation } : {}),
  };
}

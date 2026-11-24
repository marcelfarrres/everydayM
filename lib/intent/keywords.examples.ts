import { parseIntentKeywords } from './keywords';
import type { MuscleId, RoutineIntent } from './types';

export interface KeywordExampleCase {
  phrase: string;
  check: (intent: RoutineIntent) => boolean;
  description: string;
}

function hasPrimary(intent: RoutineIntent, id: MuscleId): boolean {
  return intent.muscles.some((m) => m.id === id && m.role === 'primary');
}

function hasSecondary(intent: RoutineIntent, id: MuscleId): boolean {
  return intent.muscles.some((m) => m.id === id && m.role === 'secondary');
}

export const KEYWORD_EXAMPLES: readonly KeywordExampleCase[] = [
  {
    phrase:
      'quiero una rutina full body con enfoque en brazos y que dure 40 minutos',
    description:
      'Full body (15 músculos) con foco principal en brazos (bíceps, tríceps, antebrazos) y 40 min',
    check: (i) =>
      i.muscles.length === 15 &&
      hasPrimary(i, 'biceps') &&
      hasPrimary(i, 'triceps') &&
      hasPrimary(i, 'antebrazos') &&
      hasSecondary(i, 'pectorales') &&
      hasSecondary(i, 'cuadriceps') &&
      i.targetMinutes === 40 &&
      i.focusLabel === 'Full body · brazos',
  },
  {
    phrase: 'cuerpo completo enfoque en glúteos y abdomen durante media hora',
    description: 'Cuerpo completo con foco en glúteos y abdominales, 30 min',
    check: (i) =>
      i.muscles.length === 15 &&
      hasPrimary(i, 'gluteos') &&
      hasPrimary(i, 'abdominales') &&
      i.targetMinutes === 30,
  },
  {
    phrase: 'rutina intensa de pecho y tríceps en 25 minutos sin calentamiento',
    description: 'Pectorales y tríceps, nivel difícil (8), 25 min, sin warmup',
    check: (i) =>
      hasPrimary(i, 'pectorales') &&
      hasPrimary(i, 'triceps') &&
      i.difficulty === 8 &&
      i.targetMinutes === 25 &&
      i.includeWarmup === false,
  },
  {
    phrase: 'entrenamiento de espalda y bíceps nivel 7 de 45 min',
    description: 'Espalda (dorsales, trapecio, lumbares) y bíceps, nivel 7, 45 min',
    check: (i) =>
      hasPrimary(i, 'dorsales') &&
      hasPrimary(i, 'trapecio') &&
      hasPrimary(i, 'lumbares') &&
      hasPrimary(i, 'biceps') &&
      i.difficulty === 7 &&
      i.targetMinutes === 45,
  },
  {
    phrase: 'pierna completa y glúteos para principiantes, 20 minutos',
    description: 'Piernas + glúteos, dificultad fácil (3), 20 min',
    check: (i) =>
      hasPrimary(i, 'cuadriceps') &&
      hasPrimary(i, 'isquiotibiales') &&
      hasPrimary(i, 'gluteos') &&
      hasPrimary(i, 'gemelos') &&
      hasPrimary(i, 'aductores') &&
      i.difficulty === 3 &&
      i.targetMinutes === 20,
  },
  {
    phrase: 'core y oblicuos nivel intermedio de quince minutos',
    description: 'Core (abdominales, oblicuos, lumbares), dificultad 6, 15 min',
    check: (i) =>
      hasPrimary(i, 'abdominales') &&
      hasPrimary(i, 'oblicuos') &&
      hasPrimary(i, 'lumbares') &&
      i.difficulty === 6 &&
      i.targetMinutes === 15,
  },
  {
    phrase: 'tren superior con prioridad en hombros, 1 hora',
    description: 'Tren superior secundario con foco principal en hombros, 60 min',
    check: (i) =>
      hasPrimary(i, 'hombros') &&
      hasSecondary(i, 'pectorales') &&
      hasSecondary(i, 'dorsales') &&
      i.targetMinutes === 60,
  },
  {
    phrase: 'tren inferior enfocado en isquiotibiales y gemelos, 35 min',
    description: 'Tren inferior con foco en isquios y gemelos, 35 min',
    check: (i) =>
      hasPrimary(i, 'isquiotibiales') &&
      hasPrimary(i, 'gemelos') &&
      hasSecondary(i, 'cuadriceps') &&
      i.targetMinutes === 35,
  },
  {
    phrase: 'rutina de empuje avanzada con series de 50 segundos',
    description: 'Empuje (pectorales, hombros, tríceps), nivel 8, slotSeconds 50',
    check: (i) =>
      hasPrimary(i, 'pectorales') &&
      hasPrimary(i, 'hombros') &&
      hasPrimary(i, 'triceps') &&
      i.difficulty === 8 &&
      i.slotSeconds === 50,
  },
  {
    phrase: 'sesión de tirón con algo de abdomen en 1 hora y cuarto',
    description: 'Tirón principal + abdominales secundario, 75 min',
    check: (i) =>
      hasPrimary(i, 'dorsales') &&
      hasPrimary(i, 'biceps') &&
      hasSecondary(i, 'abdominales') &&
      i.targetMinutes === 75,
  },
  {
    phrase: 'hombros, trapecio y antebrazos dificultad 9 directo al grano',
    description: 'Hombros, trapecio y antebrazos, dificultad 9, sin calentamiento',
    check: (i) =>
      hasPrimary(i, 'hombros') &&
      hasPrimary(i, 'trapecio') &&
      hasPrimary(i, 'antebrazos') &&
      i.difficulty === 9 &&
      i.includeWarmup === false,
  },
  {
    phrase: 'cuádriceps y aductores suave con calentamiento incluido 30 mins',
    description: 'Cuádriceps y aductores, nivel 3, con calentamiento, 30 min',
    check: (i) =>
      hasPrimary(i, 'cuadriceps') &&
      hasPrimary(i, 'aductores') &&
      i.difficulty === 3 &&
      i.includeWarmup === true &&
      i.targetMinutes === 30,
  },
  {
    phrase: 'upper body workout focus on chest and arms 45 minutes hard',
    description: 'Soporte básico en inglés: upper body con foco en pecho y brazos, 45 min, nivel 8',
    check: (i) =>
      hasPrimary(i, 'pectorales') &&
      hasPrimary(i, 'biceps') &&
      hasPrimary(i, 'triceps') &&
      hasSecondary(i, 'dorsales') &&
      i.targetMinutes === 45 &&
      i.difficulty === 8,
  },
  {
    phrase: 'lumbares y espalda baja muy suave de diez minutos',
    description: 'Lumbares, dificultad muy suave (2), 10 min',
    check: (i) =>
      hasPrimary(i, 'lumbares') &&
      i.difficulty === 2 &&
      i.targetMinutes === 10,
  },
  {
    phrase: 'rutina brutal de 50 minutos con ejercicios de 45 segundos',
    description: 'Sin músculo explícito -> Full body por defecto, dificultad 9, 50 min, slot 45s',
    check: (i) =>
      i.muscles.length === 15 &&
      i.difficulty === 9 &&
      i.targetMinutes === 50 &&
      i.slotSeconds === 45 &&
      i.focusLabel === 'Full body',
  },
  {
    phrase: 'quiero hacer glúteo',
    description: 'Sin bloques, series ni variación explícitos: el motor decide',
    check: (i) =>
      hasPrimary(i, 'gluteos') &&
      i.rounds === null &&
      i.exercisesPerRound === null &&
      i.variation === undefined,
  },
  {
    phrase: 'glúteo 3 bloques de 4 series, bloques distintos',
    description: '3 bloques de 4 series, cada bloque con ejercicios distintos',
    check: (i) =>
      hasPrimary(i, 'gluteos') &&
      i.rounds === 3 &&
      i.exercisesPerRound === 4 &&
      i.variation === 'all',
  },
  {
    phrase: 'piernas 30 minutos, cuatro rondas, siempre lo mismo',
    description: '4 bloques idénticos, 30 min',
    check: (i) =>
      hasPrimary(i, 'cuadriceps') &&
      i.targetMinutes === 30 &&
      i.rounds === 4 &&
      i.variation === 'same',
  },
  {
    phrase: 'brazos con 5 ejercicios por ronda y todas las rondas diferentes',
    description: '5 series por bloque, bloques distintos, número de bloques libre',
    check: (i) =>
      hasPrimary(i, 'biceps') &&
      i.rounds === null &&
      i.exercisesPerRound === 5 &&
      i.variation === 'all',
  },
  {
    phrase: 'no quiero siempre lo mismo, espalda 20 minutos con series de 45 segundos',
    description: 'La negación pide variedad; "series de 45 segundos" es la duración, no las series por bloque',
    check: (i) =>
      hasPrimary(i, 'dorsales') &&
      i.variation === 'all' &&
      i.slotSeconds === 45 &&
      i.exercisesPerRound === null &&
      i.targetMinutes === 20,
  },
];

export function validateKeywordExamples(): {
  passed: number;
  total: number;
  failures: string[];
} {
  const failures: string[] = [];
  let passed = 0;

  for (const example of KEYWORD_EXAMPLES) {
    const intent = parseIntentKeywords(example.phrase);
    if (example.check(intent)) {
      passed += 1;
    } else {
      failures.push(
        `FAIL: "${example.phrase}" (${example.description}) -> ${JSON.stringify(
          intent,
        )}`,
      );
    }
  }

  return {
    passed,
    total: KEYWORD_EXAMPLES.length,
    failures,
  };
}

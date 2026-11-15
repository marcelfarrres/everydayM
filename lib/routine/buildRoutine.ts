import { getDifficultyLevel } from '@/lib/difficulty';
import type {
  Exercise,
  MuscleId,
  MuscleSelection,
  RoutineIntent,
  RoutineItem,
  RoutineMeta,
  WorkoutFilters,
} from '@/types/workout';
import {
  MAX_PREP_SECONDS,
  OUTRO_DURATION_SECONDS,
  SUMMARY_DURATION_SECONDS,
  getClipDuration,
  getDefaultSlotSeconds,
  getRestDuration,
} from './duration';
import { solveForMinutes } from './solveForMinutes';
import { buildTimeline } from './timeline';

const MUSCLE_GROUP_LABELS: { label: string; ids: MuscleId[] }[] = [
  {
    label: 'Piernas',
    ids: ['cuadriceps', 'aductores', 'isquiotibiales', 'gemelos'],
  },
  { label: 'Brazos', ids: ['hombros', 'biceps', 'triceps', 'antebrazos'] },
  { label: 'Pecho', ids: ['pectorales'] },
  { label: 'Espalda', ids: ['trapecio', 'dorsales', 'lumbares'] },
  { label: 'Abdominales', ids: ['abdominales', 'oblicuos'] },
  { label: 'Glúteos', ids: ['gluteos'] },
];

const VALID_MUSCLE_IDS = new Set<MuscleId>(
  MUSCLE_GROUP_LABELS.flatMap((g) => g.ids),
);

const LEGACY_MUSCLE_MAP: Partial<Record<string, MuscleId>> = {
  pecho: 'pectorales',
  espalda: 'dorsales',
  piernas: 'cuadriceps',
  brazos: 'biceps',
  core: 'abdominales',
};

export function extractExerciseMuscles(
  value: unknown,
  legacyMuscle?: string | null,
): MuscleSelection[] {
  if (Array.isArray(value)) {
    const selections = value.filter(
      (entry): entry is MuscleSelection =>
        typeof entry === 'object' &&
        entry !== null &&
        'id' in entry &&
        VALID_MUSCLE_IDS.has(entry.id as MuscleId) &&
        'role' in entry &&
        (entry.role === 'primary' || entry.role === 'secondary'),
    );
    if (selections.length > 0) return selections;
  }

  const fallbackId = legacyMuscle
    ? LEGACY_MUSCLE_MAP[legacyMuscle.trim().toLowerCase()]
    : undefined;

  return fallbackId ? [{ id: fallbackId, role: 'primary' }] : [];
}

export function buildFocusLabel(
  muscles: MuscleSelection[],
  explicitLabel?: string,
): string {
  if (explicitLabel && explicitLabel.trim().length > 0) {
    return explicitLabel.trim();
  }

  if (muscles.length === 0) {
    return 'Cuerpo completo';
  }

  const selectedIds = new Set(muscles.map((m) => m.id));
  const primaryIds = new Set(
    muscles.filter((m) => m.role === 'primary').map((m) => m.id),
  );

  const activeGroups = MUSCLE_GROUP_LABELS.filter((group) =>
    group.ids.some((id) => selectedIds.has(id)),
  );
  const primaryGroups = MUSCLE_GROUP_LABELS.filter((group) =>
    group.ids.some((id) => primaryIds.has(id)),
  );

  if (activeGroups.length >= 5) {
    if (primaryGroups.length > 0 && primaryGroups.length <= 3) {
      return `Full body · ${primaryGroups.map((g) => g.label.toLowerCase()).join(' y ')}`;
    }
    return 'Full body';
  }

  const targetGroups = primaryGroups.length > 0 ? primaryGroups : activeGroups;
  return targetGroups.map((g) => g.label).join(' · ');
}

export function isRoutineIntent(
  input: WorkoutFilters | RoutineIntent,
): input is RoutineIntent {
  return 'targetMinutes' in input || 'focusLabel' in input;
}

interface ScoredExercise {
  exercise: Exercise;
  score: number;
  musclePriority: number;
}

function pickWeighted(
  pool: ScoredExercise[],
  excludedIds: Set<string>,
  rng: () => number,
): Exercise | null {
  const available = pool.filter((item) => !excludedIds.has(item.exercise.id));
  if (available.length === 0) return null;

  const totalWeight = available.reduce((acc, curr) => acc + curr.score, 0);
  if (totalWeight <= 0) {
    return available[Math.floor(rng() * available.length)].exercise;
  }

  let randomVal = rng() * totalWeight;
  for (const item of available) {
    if (randomVal < item.score) return item.exercise;
    randomVal -= item.score;
  }
  return available[available.length - 1].exercise;
}

export function buildRoutine(
  allExercises: Exercise[],
  input: WorkoutFilters | RoutineIntent,
  rng: () => number = Math.random,
): { queue: RoutineItem[]; meta: RoutineMeta } {
  const difficulty = Math.min(
    10,
    Math.max(1, Math.round(input.difficulty || 5)),
  );
  const includeWarmup = Boolean(input.includeWarmup);

  const weightedMuscles = isRoutineIntent(input)
    ? input.muscles.map((m) => ({
        id: m.id,
        role: m.role,
        weight: Math.min(1, Math.max(0.05, Number(m.weight) || 0.5)),
      }))
    : input.muscles.map((m) => ({
        id: m.id,
        role: m.role,
        weight: m.role === 'primary' ? 1 : 0.6,
      }));

  const muscles: MuscleSelection[] = weightedMuscles.map(({ id, role }) => ({
    id,
    role,
  }));

  const slotSeconds =
    isRoutineIntent(input) && input.slotSeconds && input.slotSeconds > 0
      ? Math.max(15, Math.round(input.slotSeconds))
      : getDefaultSlotSeconds(difficulty);

  const warmups = allExercises.filter(
    (ex) => ex.type?.toLowerCase() === 'warmup',
  );
  const fillers = allExercises.filter(
    (ex) => ex.type?.toLowerCase() === 'filler',
  );

  let workouts = allExercises.filter((ex) => {
    const type = ex.type?.toLowerCase();
    return type !== 'warmup' && type !== 'intro' && type !== 'filler';
  });
  if (workouts.length === 0) {
    workouts = allExercises.filter((ex) => ex.type?.toLowerCase() !== 'intro');
  }
  if (workouts.length === 0) {
    workouts = [...allExercises];
  }

  const background: Exercise | undefined =
    fillers.length > 0
      ? fillers[0]
      : workouts.length > 0
        ? workouts[Math.floor(rng() * workouts.length)]
        : allExercises[0];

  const primaryTargetIds = new Set(
    weightedMuscles.filter((m) => m.role === 'primary').map((m) => m.id),
  );
  const targetWeightById = new Map(
    weightedMuscles.map((m) => [m.id, m.weight]),
  );

  const scored: ScoredExercise[] = workouts.map((ex) => {
    const exerciseMuscles = extractExerciseMuscles(ex.muscles, ex.muscle);
    const matchesPrimaryTarget = exerciseMuscles.some(
      (em) => em.role === 'primary' && primaryTargetIds.has(em.id),
    );
    const matchesSelectedMuscle = exerciseMuscles.some((em) =>
      targetWeightById.has(em.id),
    );
    const difficultyDifference = Math.abs(
      getDifficultyLevel(ex.difficulty) - difficulty,
    );
    const baseScore = Math.max(1, 1 + (10 - difficultyDifference));

    const matchedWeight = exerciseMuscles.reduce((maxW, em) => {
      const targetWeight = targetWeightById.get(em.id);
      if (targetWeight === undefined) return maxW;
      const roleMultiplier = em.role === 'primary' ? 1 : 0.65;
      return Math.max(maxW, targetWeight * roleMultiplier);
    }, 0);

    const score = baseScore * (1 + matchedWeight * 2);
    const musclePriority =
      weightedMuscles.length === 0
        ? 0
        : matchesPrimaryTarget
          ? 0
          : matchesSelectedMuscle
            ? 1
            : 2;

    return { exercise: ex, score, musclePriority };
  });

  const selectedWarmups =
    includeWarmup && warmups.length > 0 ? warmups.slice(0, 3) : [];
  // No intro clip in the app: the workout starts with the plan. (TikTok exports add their own opening.)
  const introDuration = 0;

  let rounds = 3;
  let exercisesPerRound = 5;

  if (isRoutineIntent(input)) {
    if (input.targetMinutes !== null && input.targetMinutes > 0) {
      const sortedCandidates = [...scored]
        .sort((a, b) =>
          a.musclePriority !== b.musclePriority
            ? a.musclePriority - b.musclePriority
            : b.score - a.score,
        )
        .map((item) => item.exercise);

      const solved = solveForMinutes({
        ...(input.rounds ? { minRounds: input.rounds, maxRounds: input.rounds, maxExercisesPerRound: 20 } : {}),
        targetMinutes: input.targetMinutes,
        difficulty,
        slotSeconds,
        candidateExercises: sortedCandidates,
        warmups: selectedWarmups,
        includeWarmup,
        introSeconds: introDuration,
        summarySeconds: SUMMARY_DURATION_SECONDS,
        outroSeconds: OUTRO_DURATION_SECONDS,
      });
      rounds = solved.rounds;
      exercisesPerRound = solved.exercisesPerRound;
    }
  } else {
    rounds = Math.max(1, Math.round(input.totalRounds || 3));
    exercisesPerRound = Math.max(1, Math.round(input.exercisesPerRound || 5));
  }

  const circuitExercises: Exercise[] = [];
  const usedIds = new Set<string>();

  for (let i = 0; i < exercisesPerRound; i++) {
    const priorityOrder = (i + 1) % 4 === 0 ? [1, 0, 2] : [0, 1, 2];
    const lastPickedId =
      circuitExercises.length > 0 && workouts.length > 1
        ? circuitExercises[circuitExercises.length - 1].id
        : null;

    let picked: Exercise | null = null;

    for (const priority of priorityOrder) {
      const pool = scored.filter((item) => item.musclePriority === priority);
      picked = pickWeighted(pool, usedIds, rng);
      if (picked) break;
    }

    if (!picked) {
      usedIds.clear();
      if (lastPickedId) {
        usedIds.add(lastPickedId);
      }
      for (const priority of priorityOrder) {
        const pool = scored.filter((item) => item.musclePriority === priority);
        picked = pickWeighted(pool, usedIds, rng);
        if (picked) break;
      }
      if (!picked && lastPickedId) {
        usedIds.clear();
        for (const priority of priorityOrder) {
          const pool = scored.filter(
            (item) => item.musclePriority === priority,
          );
          picked = pickWeighted(pool, usedIds, rng);
          if (picked) break;
        }
      }
    }

    if (picked) {
      usedIds.add(picked.id);
      circuitExercises.push(picked);
    }
  }

  if (
    isRoutineIntent(input) &&
    input.targetMinutes !== null &&
    input.targetMinutes > 0 &&
    circuitExercises.length > 0
  ) {
    const refined = solveForMinutes({
      ...(input.rounds ? { minRounds: input.rounds, maxRounds: input.rounds } : {}),
      targetMinutes: input.targetMinutes,
      difficulty,
      slotSeconds,
      candidateExercises: circuitExercises,
      warmups: selectedWarmups,
      includeWarmup,
      introSeconds: introDuration,
      summarySeconds: SUMMARY_DURATION_SECONDS,
      outroSeconds: OUTRO_DURATION_SECONDS,
      minExercisesPerRound: circuitExercises.length,
      maxExercisesPerRound: circuitExercises.length,
    });
    rounds = refined.rounds;
  }

  const focusLabel = buildFocusLabel(
    muscles,
    isRoutineIntent(input) ? input.focusLabel : undefined,
  );

  const meta: RoutineMeta = {
    totalSeconds: 0,
    slotSeconds,
    rounds,
    exercisesPerRound: circuitExercises.length,
    difficulty,
    muscles,
    circuit: circuitExercises,
    warmups: selectedWarmups,
    focusLabel,
    background,
  };

  const restSec = getRestDuration(difficulty);
  const queue: RoutineItem[] = [];
  const fallbackExercise: Exercise =
    background ??
    circuitExercises[0] ??
    allExercises[0] ?? {
      id: 'fallback',
      title: focusLabel,
      type: 'filler',
      video_url: '',
      muscle: 'full body',
      difficulty,
      duration_seconds: slotSeconds,
    };

  if (allExercises.length > 0) {
    queue.push({
      kind: 'summary',
      duration: SUMMARY_DURATION_SECONDS,
      meta,
      exercise: fallbackExercise,
    });
  }

  for (const w of selectedWarmups) {
    queue.push({ kind: 'warmup', exercise: w });
  }

  for (let r = 1; r <= rounds; r++) {
    circuitExercises.forEach((ex, exIdx) => {
      queue.push({
        kind: 'workout',
        exercise: ex,
        round: r,
        totalRounds: rounds,
        exerciseIndexInRound: exIdx + 1,
        totalExercisesPerRound: circuitExercises.length,
      });

      const isLast =
        r === rounds && exIdx === circuitExercises.length - 1;

      if (!isLast) {
        const isEndOfRound = exIdx === circuitExercises.length - 1;
        const nextRound = isEndOfRound ? r + 1 : r;
        const nextExercise = isEndOfRound
          ? circuitExercises[0]
          : circuitExercises[exIdx + 1];

        const clipSeconds = getClipDuration(ex, slotSeconds);
        const prepSeconds = Math.min(MAX_PREP_SECONDS, Math.max(0, slotSeconds - clipSeconds));
        const baseRest = isEndOfRound ? restSec + 10 : restSec;

        queue.push({
          kind: 'rest',
          duration: baseRest + prepSeconds,
          prepSeconds,
          nextExercise,
          nextRound,
          totalRounds: rounds,
          isEndOfRound,
        });
      }
    });
  }

  if (allExercises.length > 0) {
    queue.push({
      kind: 'outro',
      duration: OUTRO_DURATION_SECONDS,
      meta,
      exercise: fallbackExercise,
    });
  }

  const timeline = buildTimeline(queue, slotSeconds);
  meta.totalSeconds = timeline.reduce((sum, seg) => sum + seg.duration, 0);

  return { queue, meta };
}

import { getDifficultyLevel } from '@/lib/difficulty';
import type {
  BuildRoutineOptions,
  Exercise,
  MuscleId,
  MuscleSelection,
  RoutineIntent,
  RoutineItem,
  RoutineMeta,
  WorkoutFilters,
} from '@/types/workout';
import {
  OUTRO_DURATION_SECONDS,
  getDefaultSlotSeconds,
  getLongRestSeconds,
  getRestDuration,
} from './duration';
import { RECENT_PENALTY, pickWeighted, type ScoredExercise } from './select';
import { solveForMinutes } from './solveForMinutes';
import { expectedTalkSeconds, pickTalks, talksSeconds } from './talks';
import { buildTimeline } from './timeline';
import { buildBlocks, resolveVariation } from './variation';

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

// Limits for what the user can ask for explicitly ("10 bloques de 20 series" is already a lot).
const MAX_ROUNDS = 10;
const MAX_EXERCISES_PER_ROUND = 20;
const WARMUP_COUNT = 3;

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

/** A whole number within [min, max], or null when the value is not a usable number. */
function explicitCount(value: unknown, min: number, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) return null;
  return Math.min(max, Math.round(value));
}

/**
 * The routine for a request: warm-up, then blocks of series with short rests between series and
 * a long rest (with talks when there are any) before each block.
 * `rng` is injectable so previews with a fixed seed stay stable; `options.recentExerciseIds`
 * makes exercises from the last routines less likely, so the same request varies over time.
 */
export function buildRoutine(
  allExercises: Exercise[],
  input: WorkoutFilters | RoutineIntent,
  rng: () => number = Math.random,
  options: BuildRoutineOptions = {},
): { queue: RoutineItem[]; meta: RoutineMeta } {
  const difficulty = Math.min(
    10,
    Math.max(1, Math.round(input.difficulty || 5)),
  );
  const includeWarmup = Boolean(input.includeWarmup);
  const recentIds = new Set(options.recentExerciseIds ?? []);
  const recencyWeight = (exercise: Exercise) => (recentIds.has(exercise.id) ? RECENT_PENALTY : 1);

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

    return {
      exercise: ex,
      score,
      weight: score * recencyWeight(ex),
      musclePriority,
      primaryIds: exerciseMuscles.filter((em) => em.role === 'primary').map((em) => em.id),
    };
  });

  // Warm-ups drawn at random too (recent ones less likely), not always the first three rows.
  const selectedWarmups: Exercise[] = [];
  if (includeWarmup) {
    const warmupPool: ScoredExercise[] = warmups.map((ex) => ({
      exercise: ex,
      score: 1,
      weight: recencyWeight(ex),
      musclePriority: 0,
      primaryIds: [],
    }));
    const taken = new Set<string>();
    while (selectedWarmups.length < WARMUP_COUNT) {
      const pick = pickWeighted(warmupPool, taken, rng);
      if (!pick) break;
      taken.add(pick.id);
      selectedWarmups.push(pick);
    }
  }
  // No intro or plan step in the app: the workout starts with the warm-up. (TikTok exports add their own opening.)

  const explicitRounds = isRoutineIntent(input) ? explicitCount(input.rounds, 1, MAX_ROUNDS) : null;
  const explicitPerRound = isRoutineIntent(input)
    ? explicitCount(input.exercisesPerRound, 1, MAX_EXERCISES_PER_ROUND)
    : null;
  const roundLimits = explicitRounds ? { minRounds: explicitRounds, maxRounds: explicitRounds } : {};
  const perRoundLimits = explicitPerRound
    ? { minExercisesPerRound: explicitPerRound, maxExercisesPerRound: explicitPerRound }
    : explicitRounds
      ? { maxExercisesPerRound: MAX_EXERCISES_PER_ROUND }
      : {};
  const targetMinutes =
    isRoutineIntent(input) && input.targetMinutes !== null && input.targetMinutes > 0
      ? input.targetMinutes
      : null;

  const relevant = scored.filter((item) => item.musclePriority < 2);
  const longRestTalkSeconds = expectedTalkSeconds(
    (relevant.length > 0 ? relevant : scored).map((item) => item.exercise),
  );

  let rounds = 3;
  let exercisesPerRound = 5;

  if (isRoutineIntent(input)) {
    if (targetMinutes !== null) {
      const sortedCandidates = [...scored]
        .sort((a, b) =>
          a.musclePriority !== b.musclePriority
            ? a.musclePriority - b.musclePriority
            : b.score - a.score,
        )
        .map((item) => item.exercise);

      const solved = solveForMinutes({
        ...roundLimits,
        ...perRoundLimits,
        targetMinutes,
        difficulty,
        slotSeconds,
        candidateExercises: sortedCandidates,
        warmups: selectedWarmups,
        includeWarmup,
        outroSeconds: OUTRO_DURATION_SECONDS,
        longRestTalkSeconds,
      });
      rounds = solved.rounds;
      exercisesPerRound = solved.exercisesPerRound;
    } else {
      rounds = explicitRounds ?? rounds;
      exercisesPerRound = explicitPerRound ?? exercisesPerRound;
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

  // With the real clips known, settle the number of blocks (unless the user said it).
  if (targetMinutes !== null && explicitRounds === null && circuitExercises.length > 0) {
    const refined = solveForMinutes({
      targetMinutes,
      difficulty,
      slotSeconds,
      candidateExercises: circuitExercises,
      warmups: selectedWarmups,
      includeWarmup,
      outroSeconds: OUTRO_DURATION_SECONDS,
      minExercisesPerRound: circuitExercises.length,
      maxExercisesPerRound: circuitExercises.length,
      longRestTalkSeconds,
    });
    rounds = refined.rounds;
  }

  const focusLabel = buildFocusLabel(
    muscles,
    isRoutineIntent(input) ? input.focusLabel : undefined,
  );

  const variation = resolveVariation(isRoutineIntent(input) ? input.variation : undefined);
  const blocks: Exercise[][] =
    circuitExercises.length > 0 ? buildBlocks(circuitExercises, rounds, variation, scored, rng) : [];

  const meta: RoutineMeta = {
    totalSeconds: 0,
    slotSeconds,
    rounds: blocks.length,
    exercisesPerRound: circuitExercises.length,
    difficulty,
    muscles,
    blocks,
    warmups: selectedWarmups,
    focusLabel,
    background,
  };

  const restSec = getRestDuration(difficulty);
  const totalRounds = blocks.length;
  const usedTalkIds = new Set<string>();
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

  /**
   * The long rest before block `round` (1-based): its talks come from that block's exercises.
   * Rests are always the decided length (a clip lasts what it lasts, and nothing of a short clip's
   * slot is added to the rest after it); only a long rest's talks can stretch it.
   */
  const longRest = (round: number, isEndOfRound: boolean): RoutineItem => {
    const block = blocks[round - 1];
    const talks = pickTalks(block, usedTalkIds, rng);
    return {
      kind: 'rest',
      // Never shorter than a plain long rest, and long enough for every talk to finish after the
      // clouds open (the talks start then: TALK_LEAD_MS into the rest, BLOCK_END_LEAD_MS after a block).
      duration: getLongRestSeconds(restSec, talksSeconds(talks), isEndOfRound),
      prepSeconds: 0,
      nextExercise: block[0],
      nextRound: round,
      totalRounds,
      isEndOfRound,
      restKind: 'long',
      talks,
    };
  };

  for (const w of selectedWarmups) {
    queue.push({ kind: 'warmup', exercise: w });
  }
  if (selectedWarmups.length > 0 && blocks.length > 0) {
    queue.push(longRest(1, false));
  }

  blocks.forEach((block, blockIndex) => {
    const r = blockIndex + 1;
    block.forEach((ex, exIdx) => {
      queue.push({
        kind: 'workout',
        exercise: ex,
        round: r,
        totalRounds,
        exerciseIndexInRound: exIdx + 1,
        totalExercisesPerRound: block.length,
      });

      const isLast = r === totalRounds && exIdx === block.length - 1;
      if (isLast) return;

      const isEndOfRound = exIdx === block.length - 1;

      if (isEndOfRound) {
        queue.push(longRest(r + 1, true));
        return;
      }
      queue.push({
        kind: 'rest',
        duration: restSec,
        prepSeconds: 0,
        nextExercise: block[exIdx + 1],
        nextRound: r,
        totalRounds,
        isEndOfRound: false,
        restKind: 'short',
        talks: [],
      });
    });
  });

  if (allExercises.length > 0) {
    queue.push({
      kind: 'outro',
      duration: OUTRO_DURATION_SECONDS,
      meta,
      exercise: fallbackExercise,
    });
  }

  // The same per-item durations the player and the timeline use, so the total matches exactly.
  const timeline = buildTimeline(queue, slotSeconds);
  meta.totalSeconds = timeline.reduce((sum, seg) => sum + seg.duration, 0);

  return { queue, meta };
}

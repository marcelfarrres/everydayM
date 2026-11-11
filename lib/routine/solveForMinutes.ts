import type { Exercise } from '@/types/workout';
import {
  INTRO_DURATION_SECONDS,
  OUTRO_DURATION_SECONDS,
  SUMMARY_DURATION_SECONDS,
  getClipDuration,
  getDefaultSlotSeconds,
  getRestDuration,
} from './duration';

export interface SolveForMinutesOptions {
  targetMinutes: number;
  difficulty?: number;
  slotSeconds?: number | null;
  candidateExercises?: Exercise[];
  warmups?: Exercise[];
  includeWarmup?: boolean;
  warmupSeconds?: number;
  introSeconds?: number;
  summarySeconds?: number;
  outroSeconds?: number;
  minRounds?: number;
  maxRounds?: number;
  minExercisesPerRound?: number;
  maxExercisesPerRound?: number;
}

export interface SolveForMinutesResult {
  rounds: number;
  exercisesPerRound: number;
  slotSeconds: number;
  estimatedSeconds: number;
}

function estimateCircuitDuration(
  rounds: number,
  exercisesPerRound: number,
  slotSeconds: number,
  restSec: number,
  candidateExercises: Exercise[],
  fixedOverheadSeconds: number,
): number {
  let total = fixedOverheadSeconds;

  for (let r = 1; r <= rounds; r++) {
    for (let i = 0; i < exercisesPerRound; i++) {
      const ex =
        candidateExercises.length > 0
          ? candidateExercises[i % candidateExercises.length]
          : undefined;
      const clipSeconds = ex
        ? getClipDuration(ex, slotSeconds)
        : slotSeconds;
      const isLast = r === rounds && i === exercisesPerRound - 1;

      if (isLast) {
        total += clipSeconds;
      } else {
        const isEndOfRound = i === exercisesPerRound - 1;
        const baseRest = isEndOfRound ? restSec + 10 : restSec;
        const prepSeconds = Math.max(0, slotSeconds - clipSeconds);
        total += clipSeconds + baseRest + prepSeconds;
      }
    }
  }

  return total;
}

export function solveForMinutes(
  optionsOrMinutes: SolveForMinutesOptions | number,
  maybeOptions?: Omit<SolveForMinutesOptions, 'targetMinutes'>,
): SolveForMinutesResult {
  const opts: SolveForMinutesOptions =
    typeof optionsOrMinutes === 'number'
      ? { targetMinutes: optionsOrMinutes, ...maybeOptions }
      : optionsOrMinutes;

  const difficulty = Math.min(10, Math.max(1, Math.round(opts.difficulty ?? 5)));
  const resolvedSlotSeconds =
    opts.slotSeconds && opts.slotSeconds > 0
      ? Math.max(15, Math.round(opts.slotSeconds))
      : getDefaultSlotSeconds(difficulty);
  const restSec = getRestDuration(difficulty);

  const targetSeconds = Math.max(60, Math.round(opts.targetMinutes * 60));
  const includeWarmup = opts.includeWarmup ?? true;

  const warmupTotalSeconds =
    opts.warmupSeconds !== undefined
      ? opts.warmupSeconds
      : includeWarmup && opts.warmups && opts.warmups.length > 0
        ? opts.warmups
            .slice(0, 3)
            .reduce((acc, w) => acc + getClipDuration(w, resolvedSlotSeconds), 0)
        : 0;

  const introSeconds = opts.introSeconds ?? INTRO_DURATION_SECONDS;
  const summarySeconds = opts.summarySeconds ?? SUMMARY_DURATION_SECONDS;
  const outroSeconds = opts.outroSeconds ?? OUTRO_DURATION_SECONDS;
  const fixedOverheadSeconds =
    introSeconds + summarySeconds + outroSeconds + warmupTotalSeconds;

  const minRounds = Math.max(1, opts.minRounds ?? 1);
  const maxRounds = Math.max(minRounds, opts.maxRounds ?? 8);
  const minEx = Math.max(1, opts.minExercisesPerRound ?? 1);
  const maxEx = Math.max(minEx, opts.maxExercisesPerRound ?? 12);
  const candidates = opts.candidateExercises ?? [];

  let bestResult: SolveForMinutesResult = {
    rounds: 3,
    exercisesPerRound: 5,
    slotSeconds: resolvedSlotSeconds,
    estimatedSeconds: estimateCircuitDuration(
      3,
      5,
      resolvedSlotSeconds,
      restSec,
      candidates,
      fixedOverheadSeconds,
    ),
  };
  let bestCost = Number.POSITIVE_INFINITY;

  for (let rounds = minRounds; rounds <= maxRounds; rounds++) {
    for (let exPerRound = minEx; exPerRound <= maxEx; exPerRound++) {
      const estimatedSeconds = estimateCircuitDuration(
        rounds,
        exPerRound,
        resolvedSlotSeconds,
        restSec,
        candidates,
        fixedOverheadSeconds,
      );
      const timeDiff = Math.abs(estimatedSeconds - targetSeconds);

      // Gentle ergonomic preference when two shapes yield almost identical duration:
      // favor 2..5 rounds and 4..8 exercises per round.
      const roundPenalty =
        rounds < 2 ? 6 : rounds > 5 ? (rounds - 5) * 4 : 0;
      const exPenalty =
        exPerRound < 3 ? (3 - exPerRound) * 5 : exPerRound > 8 ? (exPerRound - 8) * 3 : 0;
      const cost = timeDiff + roundPenalty + exPenalty;

      if (cost < bestCost) {
        bestCost = cost;
        bestResult = {
          rounds,
          exercisesPerRound: exPerRound,
          slotSeconds: resolvedSlotSeconds,
          estimatedSeconds,
        };
      }
    }
  }

  return bestResult;
}

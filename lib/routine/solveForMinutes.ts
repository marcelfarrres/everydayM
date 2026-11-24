import type { Exercise } from '@/types/workout';
import {
  MAX_PREP_SECONDS,
  OUTRO_DURATION_SECONDS,
  getClipDuration,
  getDefaultSlotSeconds,
  getLongRestBase,
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
  outroSeconds?: number;
  minRounds?: number;
  maxRounds?: number;
  minExercisesPerRound?: number;
  maxExercisesPerRound?: number;
  /** Expected talk time per long rest: a long rest lasts at least that long. */
  longRestTalkSeconds?: number;
}

export interface SolveForMinutesResult {
  rounds: number;
  exercisesPerRound: number;
  slotSeconds: number;
  estimatedSeconds: number;
}

interface EstimateParams {
  slotSeconds: number;
  restSec: number;
  candidateExercises: Exercise[];
  fixedOverheadSeconds: number;
  hasWarmup: boolean;
  longRestTalkSeconds: number;
}

// Mirrors the queue buildRoutine makes: short rests between series, a long one before each block.
function estimateCircuitDuration(
  rounds: number,
  exercisesPerRound: number,
  { slotSeconds, restSec, candidateExercises, fixedOverheadSeconds, hasWarmup, longRestTalkSeconds }: EstimateParams,
): number {
  const longRest = (base: number) => Math.max(base, Math.ceil(longRestTalkSeconds));
  let total = fixedOverheadSeconds + (hasWarmup ? longRest(getLongRestBase(restSec)) : 0);

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
        const prepSeconds = Math.min(MAX_PREP_SECONDS, Math.max(0, slotSeconds - clipSeconds));
        total += clipSeconds + (isEndOfRound ? longRest(getLongRestBase(restSec) + prepSeconds) : restSec + prepSeconds);
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

  const outroSeconds = opts.outroSeconds ?? OUTRO_DURATION_SECONDS;
  const fixedOverheadSeconds = outroSeconds + warmupTotalSeconds;

  const minRounds = Math.max(1, opts.minRounds ?? 1);
  const maxRounds = Math.max(minRounds, opts.maxRounds ?? 8);
  const minEx = Math.max(1, opts.minExercisesPerRound ?? 1);
  const maxEx = Math.max(minEx, opts.maxExercisesPerRound ?? 12);
  const estimate: EstimateParams = {
    slotSeconds: resolvedSlotSeconds,
    restSec,
    candidateExercises: opts.candidateExercises ?? [],
    fixedOverheadSeconds,
    hasWarmup: warmupTotalSeconds > 0,
    longRestTalkSeconds: Math.max(0, opts.longRestTalkSeconds ?? 0),
  };

  let bestResult: SolveForMinutesResult = {
    rounds: 3,
    exercisesPerRound: 5,
    slotSeconds: resolvedSlotSeconds,
    estimatedSeconds: estimateCircuitDuration(3, 5, estimate),
  };
  let bestCost = Number.POSITIVE_INFINITY;

  for (let rounds = minRounds; rounds <= maxRounds; rounds++) {
    for (let exPerRound = minEx; exPerRound <= maxEx; exPerRound++) {
      const estimatedSeconds = estimateCircuitDuration(rounds, exPerRound, estimate);
      const timeDiff = Math.abs(estimatedSeconds - targetSeconds);

      // Shape matters more than the last seconds: a normal circuit is 3-4 rounds of 4-6 exercises.
      // Penalties are in seconds of time error, so being ~1-2 min off beats 7 rounds of 2.
      const roundPenalty =
        rounds === 1 ? 240 : rounds === 2 ? 60 : rounds > 4 ? (rounds - 4) * 90 : 0;
      const exPenalty =
        exPerRound < 4 ? (4 - exPerRound) * 90 : exPerRound > 6 ? (exPerRound - 6) * 50 : 0;
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

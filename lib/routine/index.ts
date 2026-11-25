export {
  DEFAULT_CLIP_SECONDS,
  LONG_REST_EXTRA_SECONDS,
  OUTRO_DURATION_SECONDS,
  BLOCK_END_EXTRA_MS,
  BLOCK_END_LEAD_MS,
  TALK_LEAD_MS,
  getClipDuration,
  getDefaultSlotSeconds,
  getItemDuration,
  getLongRestBase,
  getRestDuration,
  getBlockEndRestBase,
  getLongRestSeconds,
  getTalkRestSeconds,
} from './duration';

export { buildTimeline } from './timeline';

export {
  solveForMinutes,
  type SolveForMinutesOptions,
  type SolveForMinutesResult,
} from './solveForMinutes';

export {
  buildFocusLabel,
  buildRoutine,
  extractExerciseMuscles,
  isRoutineIntent,
} from './buildRoutine';

export { REST_LINES, cheerFor } from './cheers';

export { uniqueExercises } from './blocks';

export { recentExerciseIds, rememberRoutine } from './history';

export { talksSeconds } from './talks';

export {
  DEFAULT_CLIP_SECONDS,
  LONG_REST_EXTRA_SECONDS,
  OUTRO_DURATION_SECONDS,
  TALK_LEAD_MS,
  getClipDuration,
  getDefaultSlotSeconds,
  getItemDuration,
  getLongRestBase,
  getRestDuration,
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

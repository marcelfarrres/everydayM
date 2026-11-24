import type { RoutineItem, TimelineSegment } from '@/types/workout';
import { getItemDuration } from './duration';

function getItemLabel(item: RoutineItem): string {
  switch (item.kind) {
    case 'warmup':
      return item.exercise.title || 'Calentamiento';
    case 'workout':
      return (
        item.exercise.title ||
        `Ronda ${item.round} · Ejercicio ${item.exerciseIndexInRound}`
      );
    case 'rest':
      return item.isEndOfRound
        ? `Descanso fin de ronda ${Math.max(1, item.nextRound - 1)}`
        : 'Descanso';
    case 'outro':
      return 'Completado';
  }
}

export function buildTimeline(
  queue: RoutineItem[],
  clipSecondsFallback?: number,
): TimelineSegment[] {
  let cursor = 0;

  return queue.map((item, index) => {
    const duration = getItemDuration(item, clipSecondsFallback);
    const segment: TimelineSegment = {
      index,
      kind: item.kind,
      start: cursor,
      duration,
      label: getItemLabel(item),
    };
    cursor += duration;
    return segment;
  });
}

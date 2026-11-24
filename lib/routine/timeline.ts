import type { RoutineItem, TimelineSegment } from '@/types/workout';
import { getItemDuration } from './duration';

function getItemLabel(item: RoutineItem): string {
  switch (item.kind) {
    case 'warmup':
      return item.exercise.title || 'Calentamiento';
    case 'workout':
      return (
        item.exercise.title ||
        `Bloque ${item.round} · Serie ${item.exerciseIndexInRound}`
      );
    case 'rest':
      if (item.isEndOfRound) return `Descanso fin de bloque ${Math.max(1, item.nextRound - 1)}`;
      return item.restKind === 'long' ? `Descanso antes del bloque ${item.nextRound}` : 'Descanso';
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

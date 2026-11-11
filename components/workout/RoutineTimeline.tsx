'use client';

import type { RoutineItem, TimelineSegment } from '@/types/workout';
import { Clock } from 'lucide-react';

export function formatSeconds(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getFallbackDuration(item: RoutineItem): number {
  switch (item.kind) {
    case 'intro':
      return Math.min(10, item.exercise.duration_seconds || 10);
    case 'summary':
    case 'outro':
      return item.duration || 8;
    case 'rest':
      return item.duration || 15;
    case 'warmup':
    case 'workout':
      return item.exercise.duration_seconds || 50;
  }
}

function getFallbackLabel(item: RoutineItem): string {
  switch (item.kind) {
    case 'intro':
      return 'Intro';
    case 'summary':
      return 'Resumen';
    case 'warmup':
      return `Calentamiento · ${item.exercise.title}`;
    case 'workout':
      return `R${item.round} · ${item.exercise.title}`;
    case 'rest':
      return item.isEndOfRound ? 'Descanso de ronda' : 'Descanso';
    case 'outro':
      return 'Completado';
  }
}

export function buildFallbackTimeline(queue: RoutineItem[]): TimelineSegment[] {
  let cursor = 0;
  return queue.map((item, index) => {
    const duration = getFallbackDuration(item);
    const seg: TimelineSegment = {
      index,
      kind: item.kind,
      start: cursor,
      duration,
      label: getFallbackLabel(item),
    };
    cursor += duration;
    return seg;
  });
}

function getSegmentColor(kind: RoutineItem['kind'], isActive: boolean, isDone: boolean) {
  if (isActive) {
    switch (kind) {
      case 'warmup':
        return 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]';
      case 'rest':
        return 'bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.7)]';
      case 'summary':
      case 'intro':
      case 'outro':
        return 'bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.7)]';
      case 'workout':
      default:
        return 'bg-[#4ade80] shadow-[0_0_12px_rgba(74,222,128,0.85)]';
    }
  }
  if (isDone) {
    switch (kind) {
      case 'warmup':
        return 'bg-amber-500/60';
      case 'rest':
        return 'bg-sky-500/50';
      default:
        return 'bg-[#22c55e]/70';
    }
  }
  switch (kind) {
    case 'warmup':
      return 'bg-amber-500/20';
    case 'rest':
      return 'bg-sky-500/15';
    default:
      return 'bg-white/15';
  }
}

interface RoutineTimelineProps {
  queue: RoutineItem[];
  timeline?: TimelineSegment[];
  currentIndex: number;
  timeLeft: number;
  totalItemDuration: number;
  elapsedSeconds?: number;
  totalSeconds?: number;
  variant?: 'desktop' | 'compact';
}

export function RoutineTimeline({
  queue,
  timeline,
  currentIndex,
  timeLeft,
  totalItemDuration,
  elapsedSeconds,
  totalSeconds,
  variant = 'desktop',
}: RoutineTimelineProps) {
  const segments =
    timeline && timeline.length === queue.length && timeline.length > 0
      ? timeline
      : buildFallbackTimeline(queue);

  const computedTotalSeconds =
    typeof totalSeconds === 'number' && totalSeconds > 0
      ? totalSeconds
      : segments.reduce((acc, seg) => acc + seg.duration, 0);

  const currentSeg = segments[currentIndex];
  const itemElapsed = Math.max(
    0,
    Math.min(totalItemDuration, totalItemDuration - timeLeft),
  );

  const computedElapsedSeconds =
    typeof elapsedSeconds === 'number' && elapsedSeconds >= 0
      ? elapsedSeconds
      : (currentSeg?.start ?? 0) + itemElapsed;

  const totalRemainingSeconds = Math.max(
    0,
    computedTotalSeconds - computedElapsedSeconds,
  );

  if (variant === 'compact') {
    return (
      <div className="w-full rounded-2xl border border-[#22c55e]/25 bg-[#111713]/95 px-3.5 py-2.5 shadow-inner">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="font-bold text-neutral-200 truncate max-w-[60%]">
            {currentSeg?.label ?? `Paso ${currentIndex + 1} de ${queue.length}`}
          </span>
          <span className="flex items-center gap-1 font-mono text-xs font-black text-[#4ade80]">
            <Clock className="w-3.5 h-3.5" />
            Restante {formatSeconds(totalRemainingSeconds)}
          </span>
        </div>
        <div
          className="flex h-2 w-full items-center gap-1 overflow-hidden rounded-full bg-black/40 p-0.5"
          role="progressbar"
          aria-valuenow={Math.round(computedElapsedSeconds)}
          aria-valuemin={0}
          aria-valuemax={Math.round(computedTotalSeconds)}
          aria-label="Progreso total de la rutina"
        >
          {segments.map((seg) => {
            const isDone = seg.index < currentIndex;
            const isActive = seg.index === currentIndex;
            const widthWeight = Math.max(8, seg.duration);

            return (
              <div
                key={seg.index}
                style={{ flexGrow: widthWeight }}
                className={`h-full rounded-full transition-all duration-300 ${getSegmentColor(
                  seg.kind,
                  isActive,
                  isDone,
                )}`}
                title={seg.label}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-2xl border border-[#22c55e]/25 bg-[#101612]/95 p-4 shadow-lg">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div>
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-neutral-300 block">
            Línea de tiempo de la rutina
          </span>
          <p className="text-xs font-bold text-white mt-0.5 truncate">
            {currentSeg?.label ?? `Bloque ${currentIndex + 1} de ${queue.length}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300 block">
            Tiempo restante
          </span>
          <span className="font-mono text-base font-black text-[#4ade80]">
            {formatSeconds(totalRemainingSeconds)}
          </span>
        </div>
      </div>

      <div
        className="flex h-3 w-full items-center gap-1 rounded-full bg-black/50 p-1 border border-white/10"
        role="progressbar"
        aria-valuenow={Math.round(computedElapsedSeconds)}
        aria-valuemin={0}
        aria-valuemax={Math.round(computedTotalSeconds)}
        aria-label="Línea de tiempo completa de la rutina"
      >
        {segments.map((seg) => {
          const isDone = seg.index < currentIndex;
          const isActive = seg.index === currentIndex;
          const widthWeight = Math.max(6, seg.duration);

          return (
            <div
              key={seg.index}
              style={{ flexGrow: widthWeight }}
              title={`${seg.label} (${seg.duration}s)`}
              className={`relative h-full rounded-full transition-all duration-300 ${getSegmentColor(
                seg.kind,
                isActive,
                isDone,
              )}`}
            />
          );
        })}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-neutral-300">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> Calentamiento
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Ejercicio
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sky-400" /> Descanso
          </span>
        </div>
        <span className="font-mono text-neutral-300">
          {formatSeconds(computedElapsedSeconds)} / {formatSeconds(computedTotalSeconds)}
        </span>
      </div>
    </div>
  );
}

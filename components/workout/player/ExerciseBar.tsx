'use client';

import { ChevronUp, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { Hilo } from './Hilo';
import type { StepState } from './model';
import { FOCUS, own } from './ui';

/*
 * The bar while exercising. Row 1: the hilo and a chevron that hints it opens. Row 2: name,
 * time, previous, pause, next. During the warm-up the hilo is all grey and the name is
 * "Calentamiento".
 */
export function ExerciseBar({
  hilo,
  name,
  time,
  listId,
  listOpen,
  onToggleList,
  isPaused,
  onTogglePause,
  onPrev,
  canPrev,
  onNext,
}: {
  hilo: StepState[][];
  name: string;
  time: string;
  listId: string;
  listOpen: boolean;
  onToggleList: () => void;
  isPaused: boolean;
  onTogglePause?: () => void;
  onPrev: () => void;
  canPrev: boolean;
  onNext: () => void;
}) {
  const icon = `flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${FOCUS}`;
  return (
    <div className="flex h-full flex-col justify-between">
      {/* row 1: a real button for keyboards and screen readers; a tap anywhere else on the bar does the same.
          44 px tall but laid out as 24: it reaches up to the bar's top edge and 10 px under row 2,
          which is drawn above it, so row 2's buttons keep their own taps. */}
      <button
        type="button"
        onClick={own(onToggleList)}
        aria-expanded={listOpen}
        aria-controls={listId}
        aria-label={listOpen ? 'Cerrar la rutina' : 'Ver la rutina'}
        className={`-mx-1 -my-2.5 flex h-11 items-center gap-3 rounded-md px-1 ${FOCUS}`}
      >
        <Hilo blocks={hilo} className="flex-1" />
        <ChevronUp
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-white/80 transition-transform duration-300 motion-reduce:transition-none ${listOpen ? 'rotate-180' : ''}`}
        />
      </button>

      <div className="relative flex h-11 items-center gap-0.5">
        <p className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-tight">{name}</p>
        <span role="timer" className="shrink-0 px-1.5 text-[21px] font-bold leading-none tabular-nums tracking-[-0.02em]">
          {time}
        </span>
        <button type="button" onClick={own(onPrev)} disabled={!canPrev} aria-label="Anterior" className={`${icon} disabled:opacity-35`}>
          <SkipBack className="h-[18px] w-[18px] fill-current" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={own(() => onTogglePause?.())}
          aria-label={isPaused ? 'Reanudar' : 'Pausar'}
          className={`${icon} bg-white text-ink active:scale-95 motion-reduce:active:scale-100`}
        >
          {isPaused ? <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" /> : <Pause className="h-5 w-5 fill-current" aria-hidden="true" />}
        </button>
        <button type="button" onClick={own(onNext)} aria-label="Siguiente" className={icon}>
          <SkipForward className="h-[18px] w-[18px] fill-current" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

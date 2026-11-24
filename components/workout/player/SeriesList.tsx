'use client';

import { useLayoutEffect, useRef } from 'react';
import type { Block, StepState } from './model';

/*
 * The routine as a list, opened from the bar: "Calentamiento", then each block with its series.
 * Done = struck through and grey, in progress = red, pending = white. Read-only: a row is not a
 * button. It opens scrolled to the serie in progress.
 */

const ROW: Record<StepState, string> = {
  done: 'text-white/60',
  now: 'text-heat font-semibold',
  todo: 'text-white',
};

export function SeriesList({
  id,
  blocks,
  warmup,
  stateOf,
  onScroll,
  bare = false,
}: {
  id: string;
  blocks: Block[];
  warmup: StepState | null; // null: this routine has no warm-up
  stateOf: (queueIndex: number) => StepState;
  onScroll: () => void;
  /** Phone: drawn inside a panel that has its own fill (and the controls under the list). */
  bare?: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);

  // Open on the serie in progress (one read, when the list appears; nothing is measured afterwards).
  useLayoutEffect(() => {
    const box = scroller.current;
    const row = box?.querySelector<HTMLElement>('[data-now]');
    if (!box || !row) return;
    box.scrollTop = Math.max(0, row.offsetTop - (box.clientHeight - row.offsetHeight) / 2);
  }, []);

  return (
    <div
      ref={scroller}
      id={id}
      onScroll={onScroll}
      className={`relative overflow-y-auto overscroll-contain px-4 py-2 text-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
        bare
          ? // with the rocket (112 px) and the controls (56 px) under it, still under half the screen
            'max-h-[max(6rem,min(15.5rem,calc(50dvh-12.5rem)))]'
          : 'max-h-[min(15.5rem,calc(50dvh-7.5rem))] rounded-[22px] bg-[rgb(14_14_14/0.84)]'
      }`}
    >
      <ol aria-label="La rutina" className="flex flex-col">
        {warmup && (
          <li data-now={warmup === 'now' ? '' : undefined} className={`flex min-h-11 items-center text-[16px] ${ROW[warmup]}`}>
            {warmup === 'now' && <span className="sr-only">Ahora: </span>}
            <span className={warmup === 'done' ? 'line-through' : ''}>Calentamiento</span>
          </li>
        )}
        {blocks.map((block) => (
          <li key={block.round} className="flex flex-col">
            <p className="flex min-h-9 items-end pb-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/70">
              Bloque {block.round}
            </p>
            <ol className="flex flex-col">
              {block.series.map((serie) => {
                const state = stateOf(serie.queueIndex);
                return (
                  <li
                    key={serie.queueIndex}
                    data-now={state === 'now' ? '' : undefined}
                    className={`flex min-h-11 items-center gap-3 text-[16px] ${ROW[state]}`}
                  >
                    <span aria-hidden="true" className="w-4 shrink-0 text-[13px] tabular-nums text-white/60">
                      {serie.n}
                    </span>
                    {state === 'now' && <span className="sr-only">Ahora: </span>}
                    <span className={`truncate ${state === 'done' ? 'line-through' : ''}`}>{serie.exercise.title}</span>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}

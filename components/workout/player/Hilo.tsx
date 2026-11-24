import type { StepState } from './model';

/*
 * "El hilo": one short line per serie, grouped by block, with a wider gap between blocks than
 * between series. Done = white, in progress = red, pending = grey. No warm-up segment.
 * The same drawing lives in the player's bar (on video) and on the routine-ready screen (on paper).
 */

const COLOR: Record<'dark' | 'light', Record<StepState, string>> = {
  // over the video: white lines on the bar's dark fill
  dark: { done: 'bg-white', now: 'bg-heat', todo: 'bg-white/30' },
  // on paper: ink is "done", the rest is pale ink
  light: { done: 'bg-ink', now: 'bg-heat', todo: 'bg-ink/20' },
};

// `lg` (the phone's rocket): thick lines across the whole body, wide gaps between blocks, and the
// serie in progress a step thicker than the rest, so done / now / pending read at a glance.
const SIZE = {
  sm: { row: 'gap-2.5', block: 'gap-[3px]', line: { done: 'h-[3px]', now: 'h-[3px]', todo: 'h-[3px]' } },
  lg: { row: 'gap-3', block: 'gap-[3px]', line: { done: 'h-[6px]', now: 'h-[10px]', todo: 'h-[6px]' } },
} as const;

export function Hilo({
  blocks,
  surface = 'dark',
  size = 'sm',
  className = '',
}: {
  blocks: StepState[][];
  surface?: 'dark' | 'light';
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const palette = COLOR[surface];
  const s = SIZE[size];
  return (
    <div aria-hidden="true" className={`flex min-w-0 items-center ${s.row} ${className}`}>
      {blocks.map((series, b) => (
        // each block as wide as its number of series
        <div key={b} className={`flex min-w-0 basis-0 items-center ${s.block}`} style={{ flexGrow: Math.max(1, series.length) }}>
          {series.map((state, i) => (
            <span key={i} data-hilo={state} className={`${s.line[state]} min-w-0 flex-1 rounded-full ${palette[state]}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

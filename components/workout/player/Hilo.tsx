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

export function Hilo({
  blocks,
  surface = 'dark',
  className = '',
}: {
  blocks: StepState[][];
  surface?: 'dark' | 'light';
  className?: string;
}) {
  const palette = COLOR[surface];
  return (
    <div aria-hidden="true" className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      {blocks.map((series, b) => (
        // each block as wide as its number of series
        <div key={b} className="flex min-w-0 basis-0 items-center gap-[3px]" style={{ flexGrow: Math.max(1, series.length) }}>
          {series.map((state, s) => (
            <span key={s} className={`h-[3px] min-w-0 flex-1 rounded-full ${palette[state]}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

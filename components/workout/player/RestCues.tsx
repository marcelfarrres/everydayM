'use client';

/*
 * Phone, two cues of a rest over the stage (the computer keeps its board and its countdown):
 *
 *   RestingLabel  "Descansando…" at the top, under the % badge and "···" (their own row, so it
 *                 never meets them), its three dots blinking one after another (opacity only;
 *                 still with reduced motion). In every rest once the clouds have opened, but not
 *                 while a vídeo hablado is speaking.
 *   FinalCount    the last 3 s of a long rest (a talk or the rest video on stage): a big 3, 2, 1
 *                 in the middle, each popping in. Above the small window of the next exercise
 *                 as it swells. It follows the routine's clock, so a pause holds it (and the
 *                 beeps, useCountdownBeep, stop with it).
 */

const SHADOW = '[text-shadow:0_1px_2px_rgba(0,0,0,0.55),0_2px_14px_rgba(0,0,0,0.45)]';

export function RestingLabel({ show, reduced }: { show: boolean; reduced: boolean }) {
  return (
    <p
      data-rw="resting"
      aria-hidden={!show}
      className={`pointer-events-none fixed left-1/2 top-[max(4.25rem,calc(env(safe-area-inset-top)+3.5rem))] z-40 -translate-x-1/2 whitespace-nowrap text-[clamp(1.75rem,8.5vw,2.5rem)] font-semibold leading-none tracking-[-0.02em] text-white lg:hidden ${SHADOW}`}
      style={{ opacity: show ? 1 : 0, transition: reduced ? 'none' : 'opacity 0.5s ease' }}
    >
      Descansando
      <span aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={reduced ? '' : 'rest-dot'} style={{ animationDelay: `${i * 0.2}s` }}>
            .
          </span>
        ))}
      </span>
    </p>
  );
}

export function FinalCount({ value, reduced }: { value: 1 | 2 | 3 | null; reduced: boolean }) {
  if (value === null) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[55] flex items-center justify-center pb-[8%] lg:hidden">
      <span
        key={value}
        data-rw="final-count"
        className={`inline-block text-[min(48vw,15rem)] font-bold leading-none tracking-[-0.05em] text-white tabular-nums ${SHADOW} ${reduced ? '' : 'fc-pop'}`}
      >
        {value}
      </span>
    </div>
  );
}

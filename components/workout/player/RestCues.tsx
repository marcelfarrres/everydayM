'use client';

/*
 * Phone, two cues of a rest over the stage (the computer keeps its board and its countdown):
 *
 *   RestingLabel  "Descansando…" at the top, under the % badge and "···" (their own row, so it
 *                 never meets them), its three dots blinking one after another (opacity only;
 *                 still with reduced motion). In every rest once the clouds have opened, but not
 *                 while a vídeo hablado is speaking. In a long rest's last seconds (`ready`) it
 *                 crossfades to "Prepárate" with "que empezamos" under it (one line doesn't fit
 *                 at 320 px, nor at 390).
 *   FinalCount    the last 3 s of a long rest: a big 3, 2, 1 in the middle, each popping in, where
 *                 the rest's countdown stood (RestClock 'big' hands over to it at 3), over the next
 *                 exercise grown to the whole screen. It follows the routine's clock, so a pause
 *                 holds it (and the beeps, useCountdownBeep, stop with it).
 */

const SHADOW = '[text-shadow:0_1px_2px_rgba(0,0,0,0.55),0_2px_14px_rgba(0,0,0,0.45)]';

export function RestingLabel({ show, ready = false, reduced }: { show: boolean; ready?: boolean; reduced: boolean }) {
  const fade = reduced ? 'none' : 'opacity 0.5s ease';
  return (
    // (both in one grid cell, so they crossfade in the same place)
    <div
      aria-hidden={!show}
      className={`pointer-events-none fixed left-1/2 top-[max(4.25rem,calc(env(safe-area-inset-top)+3.5rem))] z-40 grid -translate-x-1/2 justify-items-center whitespace-nowrap text-center text-white lg:hidden ${SHADOW}`}
      style={{ opacity: show ? 1 : 0, transition: fade }}
    >
      <p
        data-rw="resting"
        aria-hidden={ready}
        className="col-start-1 row-start-1 text-[clamp(1.75rem,8.5vw,2.5rem)] font-semibold leading-none tracking-[-0.02em]"
        style={{ opacity: ready ? 0 : 1, transition: fade }}
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
      <p data-rw="ready" aria-hidden={!ready} className="col-start-1 row-start-1" style={{ opacity: ready ? 1 : 0, transition: fade }}>
        <span className="block text-[clamp(1.75rem,8.5vw,2.5rem)] font-semibold leading-none tracking-[-0.02em]">Prepárate</span>
        <span className="mt-1.5 block text-[clamp(1.125rem,5.5vw,1.5rem)] font-medium leading-tight text-white/90">que empezamos</span>
      </p>
    </div>
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

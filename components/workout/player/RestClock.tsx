'use client';

import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { WORDS, railLeft } from '@/components/workout/rocketFlight';

/*
 * Phone: the countdown of a rest, one element from the first moment of the rest to its end.
 *
 *   clouds   it comes in with the words of the clouds, big, in their column on the right (the
 *            rocket stands on the left), in ink: the rest is already counting
 *   center   as the clouds open it slides from there to its place in the middle, giant, white on
 *            the dark veil over the next exercise, with "Empiezas en" above it
 *   hidden   a long rest's talks are playing (it is back in the middle when they finish)
 *
 * The slide is a transform from where it stands in the middle (measured once per change, without
 * transforms) to the column of the clouds; the colour changes as a cross-fade of two copies, so
 * only transform and opacity move. On a computer the stage keeps its own countdown (RestCountdown).
 */

const INK = '#131313';
/** Its size in the clouds, px: CloudTransition leaves this much room under "Descanso". */
export const CLOUD_CLOCK_PX = 84;
// where its column starts: under the kicker of the words (CloudTransition's .cl-words)
const COLUMN = { phone: 40, wide: 56, belowTop: 20 } as const;

export type RestClockPhase = 'clouds' | 'center' | 'hidden';

export function RestClock({
  seconds,
  phase,
  cloudTop,
  reduced,
}: {
  seconds: number;
  phase: RestClockPhase;
  /** the rail's height in the clouds, % of the screen (railTop) */
  cloudTop: number;
  reduced: boolean;
}) {
  const value = Math.max(0, Math.round(seconds));
  const number = useRef<HTMLParagraphElement>(null);
  const was = useRef<RestClockPhase | null>(null);

  useLayoutEffect(() => {
    const el = number.current;
    if (!el) return;
    const slide = was.current === 'clouds' && phase === 'center' && !reduced;
    was.current = phase;
    el.style.transition = slide ? 'transform 1s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    if (phase !== 'clouds') {
      el.style.transform = 'none';
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const k = CLOUD_CLOCK_PX / el.offsetHeight;
    const left = railLeft(vw) * vw + (vw >= 640 ? COLUMN.wide : COLUMN.phone);
    const top = (cloudTop / 100) * vh + COLUMN.belowTop;
    el.style.transform = `translate(${Math.round(left - el.offsetLeft)}px, ${Math.round(top - el.offsetTop)}px) scale(${k.toFixed(4)})`;
  }, [phase, value, cloudTop, reduced]);

  const inClouds = phase === 'clouds';
  const fade = reduced ? 'none' : 'opacity 0.6s ease';
  return (
    <div
      aria-hidden={phase === 'hidden'}
      className="pointer-events-none fixed inset-0 z-[62] flex flex-col items-center justify-center px-6 pb-[8%] text-center lg:hidden"
      style={{
        opacity: phase === 'hidden' ? 0 : 1,
        transition: fade,
        // it comes in with the words of the clouds
        animation: inClouds && !reduced ? `rc-in ${WORDS.fadeMs}ms ease-out ${WORDS.phoneDelayMs}ms both` : undefined,
      }}
    >
      <p className="mb-2 text-[clamp(1rem,5.5vw,1.5rem)] font-medium leading-snug text-white/90" style={{ opacity: phase === 'center' ? 1 : 0, transition: fade }}>
        Empiezas en
      </p>
      <p
        ref={number}
        role="timer"
        data-rw="rest-clock"
        className="relative text-[min(40vw,12rem)] font-bold leading-none tracking-[-0.05em] tabular-nums"
        style={{ transformOrigin: '0 0' } as CSSProperties}
      >
        {/* white on the veil; a copy in ink over it while it stands in the clouds */}
        <span key={value} className={`inline-block text-white ${reduced ? '' : 'rc-tick'}`} style={{ opacity: inClouds ? 0 : 1, transition: fade }}>
          {value}
        </span>
        <span aria-hidden="true" className="absolute inset-0" style={{ color: INK, opacity: inClouds ? 1 : 0, transition: fade }}>
          {value}
        </span>
        <span className="sr-only"> segundos de descanso</span>
      </p>
    </div>
  );
}

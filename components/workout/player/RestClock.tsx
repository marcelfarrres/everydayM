'use client';

import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { WORDS, railLeft } from '@/components/workout/rocketFlight';
import { widgetLayout } from '@/components/workout/rocketShape';
import { useRocketWidth } from './hooks';
import { MINI } from './miniHandoff';

/*
 * Phone: the countdown of a rest, one element from the first moment of the rest to its end.
 *
 *   clouds   it comes in with the words of the clouds, big, in their column on the right (the
 *            rocket stands on the left), in ink: the rest is already counting
 *   center   as the clouds open it slides from there to its place in the middle, giant, white on
 *            the dark veil over the next exercise, with "Empiezas en" above it
 *   side     a long rest's talks are playing: it slides and shrinks to the right, just above the
 *            rocket's banner (a pair with the window of the next exercise on the left), white with
 *            a soft shadow, clear of the speaker's face; back to the middle when the talks end
 *   hidden   (not used by the player now; kept for a rest with nothing to count)
 *
 * The slide is a transform from where it stands in the middle (measured once per change, without
 * transforms) to the column of the clouds or the side; the colour changes as a cross-fade of two copies, so
 * only transform and opacity move. On a computer the stage keeps its own countdown (RestCountdown).
 */

const INK = '#131313';
/** Its size in the clouds, px: CloudTransition leaves this much room under "Descanso". */
export const CLOUD_CLOCK_PX = 84;
// where its column starts: under the kicker of the words (CloudTransition's .cl-words)
const COLUMN = { phone: 40, wide: 56, belowTop: 20 } as const;

export type RestClockPhase = 'clouds' | 'side' | 'center' | 'hidden';

/** Its size at the side, px, over the banner's right end. */
export const SIDE_CLOCK_PX = 46;

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
  const width = useRocketWidth();

  useLayoutEffect(() => {
    const el = number.current;
    if (!el) return;
    const moves = (p: RestClockPhase | null) => p === 'clouds' || p === 'side' || p === 'center';
    const slide = was.current !== phase && moves(was.current) && moves(phase) && !reduced;
    was.current = phase;
    el.style.transition = slide ? 'transform 1s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    if (phase !== 'clouds' && phase !== 'side') {
      el.style.transform = 'none';
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left: number;
    let top: number;
    let k: number;
    if (phase === 'clouds') {
      k = CLOUD_CLOCK_PX / el.offsetHeight;
      left = railLeft(vw) * vw + (vw >= 640 ? COLUMN.wide : COLUMN.phone);
      top = (cloudTop / 100) * vh + COLUMN.belowTop;
    } else {
      // over the right end of the banner, as high as the window of the next exercise stands
      const L = widgetLayout(width);
      k = SIDE_CLOCK_PX / el.offsetHeight;
      const bannerTop = vh - MINI.BOTTOM - L.box + L.banner.top;
      left = (vw - L.B) / 2 + L.banner.right - MINI.INSET - el.offsetWidth * k;
      top = bannerTop - MINI.GAP - SIDE_CLOCK_PX;
    }
    el.style.transform = `translate(${Math.round(left - el.offsetLeft)}px, ${Math.round(top - el.offsetTop)}px) scale(${k.toFixed(4)})`;
  }, [phase, value, cloudTop, reduced, width]);

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
        <span
          key={value}
          className={`inline-block text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.45)] ${reduced ? '' : 'rc-tick'}`}
          style={{ opacity: inClouds ? 0 : 1, transition: fade }}
        >
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

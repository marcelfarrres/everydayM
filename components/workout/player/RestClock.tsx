'use client';

import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import { WORDS, railLeft } from '@/components/workout/rocketFlight';
import { PANEL_TIME, panelLayout, widgetLayout } from '@/components/workout/rocketShape';
import { useRocketWidth } from './hooks';
import { MINI } from './miniHandoff';
import { layoutSpot } from './ui';

/*
 * Phone: the countdown of a rest, one element from the first moment of the rest to its end.
 *
 *   clouds   it comes in with the words of the clouds, big, in their column on the right (the
 *            rocket stands on the left), in ink: the rest is already counting
 *   center   as the clouds open it slides from there to its place in the middle, giant, white on
 *            the dark veil over the next exercise, with "Empiezas en" above it
 *   hidden   a long rest's talk and the rocket's panels are not out yet: it fades out as the
 *            clouds open...
 *   side     ...and comes back with the panels, as part of them: in the first one, where its time
 *            would be, in ink (the panel then leaves that place to it), while the talk lasts
 *   big      a long rest once its talk is done (or from the clouds, with none): from where it stood
 *            to the middle, white, as big as the 3, 2, 1 and in its very place (no "Empiezas en":
 *            "Descansando…" is at the top). At 3 it hands over to that 3, 2, 1 (FinalCount, with
 *            its beeps), so the two never show at once and read as one count.
 *
 * The slide is a transform from where it stands in the middle (measured once per change, without
 * transforms) to the column of the clouds or the side; the colour changes as a cross-fade of two copies, so
 * only transform and opacity move. On a computer the stage keeps its own countdown (RestCountdown).
 */

const INK = '#131313';
/** Its size in the clouds, px: CloudTransition leaves this much room under "Descanso". */
export const CLOUD_CLOCK_PX = 84;
// where its column starts: under the kicker of the words (CloudTransition's .cl-words)
const COLUMN = { phone: 40, wide: 56, belowTop: 20, lift: 4 } as const;

export type RestClockPhase = 'clouds' | 'side' | 'center' | 'big' | 'hidden';

/** The size of the 3, 2, 1 of a long rest (FinalCount in RestCues), px, on a `vw`-wide screen: min(48vw, 15rem). */
export function finalCountPx(vw: number, remPx: number): number {
  return Math.min(0.48 * vw, 15 * remPx);
}

/** Its size at the side, px: in the rocket's first panel, as big as the panel's own time. */
export const SIDE_CLOCK_PX = 28;

export function RestClock({
  seconds,
  phase,
  cloudTop,
  reduced,
  next,
}: {
  seconds: number;
  phase: RestClockPhase;
  /** the rail's height in the clouds, % of the screen (railTop) */
  cloudTop: number;
  reduced: boolean;
  /** the next exercise, under the number in the middle */
  next?: string;
}) {
  const value = Math.max(0, Math.round(seconds));
  const number = useRef<HTMLParagraphElement>(null);
  const was = useRef<RestClockPhase | null>(null);
  const width = useRocketWidth();

  useLayoutEffect(() => {
    const el = number.current;
    if (!el) return;
    const moves = (p: RestClockPhase | null) => p === 'clouds' || p === 'side' || p === 'center' || p === 'big';
    const slide = was.current !== phase && moves(was.current) && moves(phase) && !reduced;
    was.current = phase;
    el.style.transition = slide ? 'transform 1s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    if (phase !== 'clouds' && phase !== 'side' && phase !== 'big') {
      el.style.transform = 'none';
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (phase === 'big') {
      // where FinalCount draws its 3, 2, 1: centred above an 8 % (of the width) bottom padding
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const k = finalCountPx(vw, rem) / (parseFloat(getComputedStyle(el).fontSize) || el.offsetHeight);
      const left = vw / 2 - (el.offsetWidth * k) / 2;
      const top = (vh - 0.08 * vw) / 2 - (el.offsetHeight * k) / 2;
      el.style.transform = `translate(${Math.round(left - el.offsetLeft)}px, ${Math.round(top - el.offsetTop)}px) scale(${k.toFixed(4)})`;
      return;
    }
    let left: number;
    let top: number;
    let k: number;
    if (phase === 'clouds') {
      k = CLOUD_CLOCK_PX / el.offsetHeight;
      // the room the clouds leave for it under their kicker (it moves up on a short screen)
      const room = document.querySelector<HTMLElement>('[data-cloud-clock]');
      if (room) {
        const spot = layoutSpot(room);
        left = spot.x;
        top = spot.y - COLUMN.lift;
      } else {
        left = railLeft(vw) * vw + (vw >= 640 ? COLUMN.wide : COLUMN.phone);
        top = (cloudTop / 100) * vh + COLUMN.belowTop;
      }
    } else {
      // in the rocket's first panel, where its own time would be (the rest's panel leaves it that place)
      const L = widgetLayout(width);
      const P = panelLayout(L);
      k = SIDE_CLOCK_PX / el.offsetHeight;
      // centred in that panel, clear of the rocket's fin at its bottom-left (its layout width: the
      // panel's own transforms, rising out of the hull, are vertical)
      const panel = document.querySelector<HTMLElement>('[data-rw="panel-1"]');
      left = panel
        ? (vw - L.B) / 2 + P.left + (panel.offsetWidth - el.offsetWidth * k) / 2
        : (vw - L.B) / 2 + P.left + PANEL_TIME.left;
      top = vh - MINI.BOTTOM - L.box + P.top + PANEL_TIME.top;
    }
    el.style.transform = `translate(${Math.round(left - el.offsetLeft)}px, ${Math.round(top - el.offsetTop)}px) scale(${k.toFixed(4)})`;
  }, [phase, value, cloudTop, reduced, width]);

  const inClouds = phase === 'clouds';
  const side = phase === 'side';
  // (big: from 3 the 3, 2, 1 stands in its place)
  const handed = phase === 'big' && value <= 3;
  // (in ink in the clouds and in the panel, white on the veil)
  const ink = inClouds || side;
  const fade = reduced ? 'none' : 'opacity 0.6s ease';
  // "Empiezas en" and the next exercise come in only once the number has slid (1 s) to the middle:
  // the same style change starts both, so the number never crosses them
  const labelFade = phase === 'center' && !reduced ? 'opacity 0.5s ease 0.75s' : fade;
  return (
    <div
      aria-hidden={phase === 'hidden'}
      className="pointer-events-none fixed inset-0 z-[62] flex flex-col items-center justify-center px-6 pb-[8%] text-center lg:hidden"
      style={{
        opacity: phase === 'hidden' ? 0 : 1,
        transition: side && !reduced ? 'opacity 0.25s ease 0.12s' : fade,
        // it comes in with the words of the clouds
        animation: inClouds && !reduced ? `rc-in ${WORDS.fadeMs}ms ease-out ${WORDS.phoneDelayMs}ms both` : undefined,
      }}
    >
      {/* (mb-6 / mt-6: the digits' glyph box reaches an eighth of their size past their line) */}
      <p className="mb-6 text-[clamp(1rem,5.5vw,1.5rem)] font-medium leading-snug text-white/90" style={{ opacity: phase === 'center' ? 1 : 0, transition: labelFade }}>
        Empiezas en
      </p>
      <p
        ref={number}
        role="timer"
        data-rw="rest-clock"
        className="relative text-[min(40vw,12rem)] font-bold leading-none tracking-[-0.05em] tabular-nums"
        style={{ transformOrigin: '0 0', opacity: handed ? 0 : 1 } as CSSProperties}
      >
        {/* white on the veil; a copy in ink over it while it stands in the clouds */}
        <span
          key={value}
          className={`inline-block text-white [text-shadow:0_2px_14px_rgba(0,0,0,0.45)] ${reduced ? '' : 'rc-tick'}`}
          style={{ opacity: ink ? 0 : 1, transition: side ? 'none' : fade }}
        >
          {value}
        </span>
        <span aria-hidden="true" className="absolute inset-0" style={{ color: INK, opacity: ink ? 1 : 0, transition: side ? 'none' : fade }}>
          {value}
        </span>
        <span className="sr-only"> segundos de descanso</span>
      </p>
      {next && (
        // (as big as "Empiezas en", one line)
        <p
          className="mt-6 w-full max-w-[20rem] truncate text-[clamp(1rem,5.5vw,1.5rem)] font-medium leading-snug text-white/90"
          style={{ opacity: phase === 'center' ? 1 : 0, transition: labelFade }}
        >
          {next}
        </p>
      )}
    </div>
  );
}

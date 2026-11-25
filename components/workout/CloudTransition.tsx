'use client';

import { useCallback, useEffect, useRef } from 'react';
import { stagger, useAnimate, useReducedMotion } from 'motion/react';
import { Rocket } from '@/components/workout/Rocket';
import { startCloudClock, stopCloudClock, useCloudPainter } from '@/components/workout/cloudClock';
import { CLOUD_CLOCK_PX } from '@/components/workout/player/RestClock';
import { useRocketWidth } from '@/components/workout/player/hooks';
import { MINI } from '@/components/workout/player/miniHandoff';
import { widgetLayout } from '@/components/workout/rocketShape';
import { CLOUDS, CLOUD_TIMING, badgeAt, cloudsOpenAt, luegoFade, railTop, sentenceAt, sentenceFade, wordsAt } from '@/components/workout/rocketFlight';

/*
 * When a rest begins, real clouds close in from both sides and then part outwards (like
 * searching for a village in Clash of Clans). Inside them a line-drawn rocket flies up and stops
 * at the height of the routine you have done, with the words by its nose; then it blasts off as
 * the clouds open. Clouds: Unsplash photos with the sky keyed out and a soft oval edge baked in
 * (/textures/nube-1..4.webp, see scripts/optimize-textures.mjs).
 *
 * Built to stay smooth on a mid-range phone while a video mounts underneath:
 * - four cloud layers, sized from the screen so they cover it without being enormous;
 * - only `transform` and `opacity` are animated, always as full keyframes with a start value,
 *   so motion hands them to the compositor (WAAPI) and nothing reads layout during the flight;
 * - no blur, masks or blend modes.
 *
 * Timing, from the moment `playKey` changes (see CLOUDS for the two moments the player uses):
 *   0.0-0.9 s  the banks drift in (the old moment is still underneath) and the rocket rises
 *   0.9-3.8 s  everything holds, long enough to read the words; the rest screen mounts behind
 *   3.8-5.4 s  the rocket shoots off the top while the banks open outwards
 * On a phone this layer draws no rocket: the widget's own rocket (RocketWidget) goes to its place
 * on the rail as the clouds close, waits there and takes off from there (`phone`; timing and its
 * place in rocketFlight.ts), and the words come in sooner. On a computer it plays as it always has.
 */

export type Journey = {
  progress: number; // 0..1, where the routine is now
  total: string; // "20 min"
  note?: string; // "Llevas 8 de 20 min"
  marks: { at: number; label: string }[]; // where each section starts (0..1)
};

// The timing lives in rocketFlight.ts, shared with the phone's rocket widget and the engine.
export { CLOUDS };
const CLOSE_MS = CLOUD_TIMING.closeMs;
const STAGGER_S = CLOUD_TIMING.staggerMs / 1000;
const HOLD_MS = CLOUD_TIMING.holdMs;
const OPEN_S = CLOUD_TIMING.openMs / 1000;
const LIFT_LEAD_MS = CLOUD_TIMING.liftLeadMs;

type Layer = { src: string; side: 'l' | 'r'; top: string; left: string; flip?: boolean };

// Two banks per side. Sized from the screen (the larger of 110% of its width and 135% of its
// height), so tall phones and wide computers are both covered when the banks meet.
const LAYERS: Layer[] = [
  { src: '/textures/nube-2.webp', side: 'l', top: '-14%', left: '-30%' },
  { src: '/textures/nube-1.webp', side: 'l', top: '38%', left: '-38%' },
  { src: '/textures/nube-3.webp', side: 'r', top: '-8%', left: '26%', flip: true },
  { src: '/textures/nube-4.webp', side: 'r', top: '44%', left: '30%', flip: true },
];
const OFF = { l: 'translateX(-120%) scale(1.45)', r: 'translateX(120%) scale(1.45)' } as const;
const SHUT = 'translateX(0%) scale(1)';
const DRIFT = { l: 'translateX(4%) scale(1)', r: 'translateX(-4%) scale(1)' } as const;
const GONE = { l: 'translateX(-120%) scale(1.2)', r: 'translateX(120%) scale(1.2)' } as const;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The calm version's fades (reduced motion): its background in and out, s. */
const CALM_FADE_S = 0.4;
// (The rail, railTop, runs from 66% (start) to 22% (done) of the screen height: even at the start
// most of the rocket is on screen.)
const INK = '#131313';
/**
 * The hole for the % badge in "Llevas el NN % completado.": the badge (44 px tall) grows 1.4 times
 * into it, `clear` px from its lines above and below (the glyphs of a line reach a little past it).
 */
export const PERCENT_SLOT = { w: 104, h: 70, clear: 4 } as const;
/**
 * Room around the countdown in the column: the digits' glyph box (Geist: 1.25 times the font
 * size) reaches past their line box by an eighth of it each way, and RestClock lifts them 4 px.
 */
const CLOCK_ROOM_MARGIN = { top: 8, bottom: 16 } as const;

export function CloudTransition({
  playKey,
  title,
  sub,
  kicker,
  color = INK,
  journey,
  phone = false,
  extraMs = 0,
  blockEnd,
}: {
  playKey: number;
  title?: string;
  sub?: string;
  kicker?: string;
  color?: string;
  journey?: Journey;
  /** Phone: the widget's rocket is the rocket of the clouds (see the comment at the top). */
  phone?: boolean;
  /** how much longer they stay closed (the rest after a block) */
  extraMs?: number;
  /**
   * The rest after a block: three sentences instead of the title (see BLOCK_END), one in the place
   * of the other, then `sub` (phone: in its own row under them). With `slot`, the second leaves a
   * hole for the number: the % badge of the corner comes to it with that sentence and is out of
   * the column before the third comes in (paintPercent in WorkoutPlayer, from the same clock).
   */
  blockEnd?: { first: string; second: { before: string; after: string }; third: string; percent: number; slot: boolean };
}) {
  const reduced = useReducedMotion();
  const [scope, animate] = useAnimate();
  // plays only when the key really changes (not on mount, not when other deps settle)
  const lastKey = useRef(playKey);
  const run = useRef(0);
  const progress = journey?.progress ?? 0.5;
  const top = railTop(progress);
  const current = journey?.marks.filter((m) => m.at <= progress + 0.001).at(-1);
  const width = useRocketWidth();
  const clockHost = useRef<HTMLSpanElement>(null);
  const words = useRef<HTMLDivElement>(null);
  const sentences = useRef<HTMLDivElement>(null);
  const luego = useRef<HTMLParagraphElement>(null);
  const railTotal = useRef<HTMLParagraphElement>(null);
  const hasBlockEnd = Boolean(blockEnd);
  const travels = Boolean(blockEnd?.slot);

  // Everything written on the clouds, from their one clock (cloudClock.ts), in the same frame:
  // the words come in and go; of a block's sentences exactly one is visible (the others keep
  // their room, hidden); "Luego: …" has its own row on a phone; the rail's "N min", in the left
  // edge's lane, steps aside while the % badge goes down and up that lane (badgeAt).
  const paint = useCallback(
    (t: number | null) => {
      const w = words.current;
      if (!w) return;
      const at = t === null ? { in: 0, out: 1 } : wordsAt(t, phone, extraMs);
      w.style.opacity = (at.in * (1 - at.out)).toFixed(3);
      // (on a computer they still slide a little; on a phone they only fade: the countdown is
      // placed by layout in their column, so the column never moves under it)
      if (!phone) w.style.transform = `translateY(${(12 * (1 - at.in) - 8 * at.out).toFixed(2)}px)`;
      if (hasBlockEnd && sentences.current) {
        const step = t === null ? 1 : sentenceAt(t, !phone);
        sentences.current.querySelectorAll<HTMLElement>('[data-sentence]').forEach((el) => {
          const on = Number(el.dataset.sentence) === step;
          el.style.visibility = on ? 'visible' : 'hidden';
          el.style.opacity = on && t !== null ? sentenceFade(t, step).toFixed(3) : on ? '1' : '0';
        });
        if (luego.current) {
          const o = t === null ? 0 : luegoFade(t);
          luego.current.style.visibility = o > 0 ? 'visible' : 'hidden';
          luego.current.style.opacity = o.toFixed(3);
        }
      }
      if (railTotal.current) {
        railTotal.current.style.visibility = travels && t !== null && badgeAt(t).leg !== 'home' ? 'hidden' : 'visible';
        // (phone: it goes with the words, before "Descansando…" comes in at the top as the clouds open)
        if (phone) railTotal.current.style.opacity = t === null ? '' : (1 - at.out).toFixed(3);
      }
    },
    [phone, extraMs, hasBlockEnd, travels],
  );
  useCloudPainter(paint);
  // (the player closes: no clock goes on)
  useEffect(() => stopCloudClock, []);

  useEffect(() => {
    if (lastKey.current === playKey) return;
    lastKey.current = playKey;
    if (reduced) {
      // Reduced motion: no clouds, nothing flies. Only after a block on a phone, a calm version:
      // the same sentences, one at a time, fading on a still background (the clouds' white),
      // on the same clock and for as long as the clouds would have lasted.
      if (!phone || !blockEnd) return;
      const id = ++run.current;
      const total = CLOUDS.clearMs + extraMs;
      const openAt = cloudsOpenAt(extraMs);
      const calm = async () => {
        if (clockHost.current) startCloudClock(clockHost.current, playKey, total);
        animate(scope.current, { visibility: 'visible' }, { duration: 0 });
        animate('.cl-flight', { opacity: [1, 1] }, { duration: 0 });
        animate('.cl-rail', { opacity: [0, 1] }, { duration: CALM_FADE_S });
        animate('.cl-fog', { opacity: [0, 1] }, { duration: CALM_FADE_S });
        await wait(Math.max(0, openAt));
        if (id !== run.current) return;
        const out = Math.max(0.1, Math.min(CALM_FADE_S, (total - openAt) / 1000));
        animate('.cl-fog', { opacity: [1, 0] }, { duration: out });
        animate('.cl-flight', { opacity: [1, 0] }, { duration: out });
        await wait(Math.max(0, total - openAt));
        if (id !== run.current) return;
        animate(scope.current, { visibility: 'hidden' }, { duration: 0 });
      };
      void calm();
      return;
    }
    const id = ++run.current;
    // the rocket's box is as tall as the screen, so a percentage moves it by screen heights:
    // start with the nose just under the bottom edge
    const below = `translateY(${(100 - top + 1).toFixed(2)}%)`;

    // (on a phone this layer has no rocket: the widget's rocket is the rocket of the clouds)
    const root = scope.current as HTMLElement;

    const play = async () => {
      if (clockHost.current) startCloudClock(clockHost.current, playKey, CLOUDS.clearMs + extraMs);
      animate(scope.current, { visibility: 'visible' }, { duration: 0 });
      // the flame flickers while it flies
      const flame = root.querySelector('.rocket-flame')
        ? animate('.rocket-flame', { transform: ['scale(0.94, 0.9)', 'scale(1.03, 1.06)'] }, { duration: 0.12, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' })
        : null;
      animate('.cl-flight', { opacity: [1, 1] }, { duration: 0 });
      if (!phone) animate('.cl-rocket', { transform: [below, 'translateY(0%)'] }, { duration: 1.7, ease: [0.4, 0, 0.15, 1] });
      animate('.cl-rail', { opacity: [0, 1] }, { duration: 0.5, delay: 0.7 });
      // (the words, the sentences and the % badge run on the clouds' one clock: see paint below)
      await Promise.all([
        animate('.cl-l', { transform: [OFF.l, SHUT] }, { duration: CLOSE_MS / 1000, ease: [0.4, 0, 0.2, 1], delay: stagger(STAGGER_S) }),
        animate('.cl-r', { transform: [OFF.r, SHUT] }, { duration: CLOSE_MS / 1000, ease: [0.4, 0, 0.2, 1], delay: stagger(STAGGER_S) }),
        animate('.cl-fog', { opacity: [0, 1] }, { duration: 0.5, delay: 0.3 }),
      ]);
      if (id !== run.current) return;
      // while closed, the clouds keep drifting a little
      animate('.cl-l', { transform: [SHUT, DRIFT.l] }, { duration: (HOLD_MS + extraMs) / 1000, ease: 'linear' });
      animate('.cl-r', { transform: [SHUT, DRIFT.r] }, { duration: (HOLD_MS + extraMs) / 1000, ease: 'linear' });
      await wait(HOLD_MS + extraMs - LIFT_LEAD_MS);
      if (id !== run.current) return;
      // lift-off: the rocket shoots off the top (the words go now too, by the clock), the clouds part
      // (on a phone the widget's rocket takes off from here on its own timeline)
      if (!phone) animate('.cl-rocket', { transform: ['translateY(0%)', 'translateY(-130%)'] }, { duration: 1.1, ease: [0.55, 0, 0.9, 0.45] });
      await wait(LIFT_LEAD_MS);
      if (id !== run.current) return;
      await Promise.all([
        animate('.cl-l', { transform: [DRIFT.l, GONE.l] }, { duration: OPEN_S, ease: [0.22, 1, 0.36, 1], delay: stagger(0.05) }),
        animate('.cl-r', { transform: [DRIFT.r, GONE.r] }, { duration: OPEN_S, ease: [0.22, 1, 0.36, 1], delay: stagger(0.05) }),
        animate('.cl-fog', { opacity: [1, 0] }, { duration: 0.9 }),
        animate('.cl-flight', { opacity: [1, 0] }, { duration: 0.4, delay: 0.7 }),
      ]);
      flame?.stop();
      if (id !== run.current) return;
      animate(scope.current, { visibility: 'hidden' }, { duration: 0 });
    };
    void play();
    // (the moment's words and length are read when its key changes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, reduced, animate, scope, top, phone]);

  return (
    <div ref={scope} aria-hidden="true" className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" style={{ visibility: 'hidden' }}>
      {/* the clouds' one clock runs on this (cloudClock.ts): nothing to see */}
      <span ref={clockHost} className="absolute left-0 top-0 h-px w-px opacity-0" />
      {/* soft white core, so no gap shows where the banks meet */}
      <div
        className="cl-fog absolute inset-0 opacity-0"
        style={{ background: 'radial-gradient(80% 70% at 50% 55%, #ffffff 0%, #eef4fb 45%, #cfe0f3 80%, #b8d2ee 100%)' }}
      />
      {LAYERS.map((layer, i) => (
        <div
          key={i}
          className={`cl-${layer.side} absolute`}
          style={{ top: layer.top, left: layer.left, width: 'max(110vw, 135vh)', zIndex: i + 1, transform: OFF[layer.side] }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- decorative layers, preloaded once */}
          <img
            src={layer.src}
            alt=""
            draggable={false}
            decoding="async"
            className={`block w-full select-none ${layer.flip ? '-scale-x-100' : ''}`}
          />
        </div>
      ))}

      {/* THE FLIGHT: a faint rail with the routine, the rocket on it, the words by its nose */}
      <div className="cl-flight absolute inset-0 z-[8] opacity-0">
        <div className="absolute left-[34%] top-0 h-full w-0 sm:left-[42%]">
          {journey && (
            <div className="cl-rail opacity-0">
              <div className="absolute bottom-[26%] top-[18%] w-px bg-[#131313]/15" />
              <p
                ref={railTotal}
                className="absolute right-3 top-[18%] -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-[#131313]/60"
              >
                {journey.total}
              </p>
              {journey.marks.map((mark) => (
                <p
                  key={mark.label}
                  className="absolute right-3 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap text-[11px] uppercase tracking-[0.12em]"
                  style={{ top: `${railTop(mark.at)}%`, color: INK, opacity: mark === current ? 0.8 : 0.45, fontWeight: mark === current ? 600 : 400 }}
                >
                  <span className="hidden sm:inline">{mark.label}</span>
                  <span className="h-px w-[9px] translate-x-[12px] bg-current" />
                </p>
              ))}
            </div>
          )}
          {/* the rocket: its nose is where you are. Its box is the screen's height (see `below`). */}
          <div className="cl-rocket absolute left-0 top-0 h-full w-0">
            {/* (on a phone the widget's own rocket comes to this place: see RocketWidget) */}
            {!phone && <Rocket className="cl-ship absolute h-[min(58vh,36rem)] w-auto max-w-none -translate-x-1/2" style={{ top: `${top}%` }} />}
          </div>
          {/* the words, beside the nose. Their top is by the nose, unless they would run off the
              bottom of a short screen: then the space above them gives way (the spacer shrinks). */}
          {/* (phone: the column ends above the widget's box, whatever its panels are doing) */}
          <div
            className="absolute left-10 top-0 flex w-[calc(66vw-3.5rem)] flex-col sm:left-14 sm:w-[min(50vw,24rem)]"
            style={{ bottom: phone ? MINI.BOTTOM + widgetLayout(width).box : 0 }}
          >
            <div aria-hidden="true" className="min-h-0 shrink" style={{ flexBasis: `calc(${top}dvh - 0.75rem)` }} />
            {/* One column, top to bottom, each in its own row of the layout (nothing stands on
                another): the kicker, the countdown's room, the sentences, "Luego: …", the note. */}
            <div ref={words} className="cl-words relative shrink-0 pb-4" style={{ opacity: 0 }}>
              {kicker && (
                <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#131313]">
                  <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                  {kicker}
                </p>
              )}
              {/* phone: room for the rest's countdown (RestClock stands here), and the title a step smaller */}
              {phone && <div aria-hidden="true" data-cloud-clock="" style={{ height: CLOUD_CLOCK_PX, marginTop: CLOCK_ROOM_MARGIN.top, marginBottom: CLOCK_ROOM_MARGIN.bottom }} />}
              {blockEnd ? (
                <>
                  {/* after a block: the sentences' zone. All of them are laid out in the same cell, so
                      it is as tall as the tallest, but only the one of the clock's moment is visible
                      (sentenceAt; on a computer "Luego: …" is its fourth, as before). */}
                  <div
                    ref={sentences}
                    className={`grid font-[family-name:var(--font-display)] font-semibold leading-[1.15] tracking-[-0.02em] text-[#131313] [overflow-wrap:anywhere] ${
                      phone ? 'mt-1 text-[1.4rem]' : 'text-[clamp(1.75rem,3.6vw,2.75rem)]'
                    }`}
                  >
                    <p data-sentence="1" className="[grid-area:1/1]">
                      {blockEnd.first}
                    </p>
                    <p data-sentence="2" className="[grid-area:1/1]" style={{ visibility: 'hidden' }}>
                      {blockEnd.second.before}{' '}
                      {blockEnd.slot ? (
                        // (the hole the % badge comes to, as tall as it grows, on a line of its own:
                        // nothing stands to its left, so the badge comes in from the left edge over nothing)
                        <span data-cloud-slot="" className="block" style={{ width: PERCENT_SLOT.w, height: PERCENT_SLOT.h }} />
                      ) : (
                        <span className="whitespace-nowrap">{blockEnd.percent}&#8239;%</span>
                      )}{' '}
                      {blockEnd.second.after}
                    </p>
                    <p data-sentence="3" className="[grid-area:1/1]" style={{ visibility: 'hidden' }}>
                      {blockEnd.third}
                    </p>
                    {!phone && (
                      // (a long exercise name: three lines at most)
                      <p data-sentence="4" className="line-clamp-3 [grid-area:1/1]" style={{ visibility: 'hidden' }}>
                        {sub}
                      </p>
                    )}
                  </div>
                  {/* phone: "Luego: …" in a row of its own, under the sentences, from BLOCK_END.afterMs */}
                  {phone && sub && (
                    <p
                      ref={luego}
                      className="mt-2 line-clamp-3 font-[family-name:var(--font-display)] text-lg font-medium text-[#2b2f36] [overflow-wrap:anywhere]"
                      style={{ visibility: 'hidden' }}
                    >
                      {sub}
                    </p>
                  )}
                </>
              ) : (
                <>
                  {title && (
                    <p
                      className={`font-[family-name:var(--font-display)] font-semibold leading-[1] tracking-[-0.035em] text-[#131313] ${
                        phone ? 'mt-1 text-[1.75rem]' : 'text-[clamp(2.25rem,7vw,4.25rem)]'
                      }`}
                    >
                      {title}
                    </p>
                  )}
                  {sub && <p className="mt-2 line-clamp-2 font-[family-name:var(--font-display)] text-lg font-medium text-[#2b2f36] [overflow-wrap:anywhere]">{sub}</p>}
                </>
              )}
              {journey?.note && (
                <p className="mt-3 text-[13px] font-semibold uppercase tracking-[0.1em] text-[#131313]/65">
                  {current ? `${current.label} · ` : ''}
                  {journey.note}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

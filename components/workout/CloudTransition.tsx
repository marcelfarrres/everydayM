'use client';

import { useEffect, useRef } from 'react';
import { stagger, useAnimate, useReducedMotion } from 'motion/react';
import { Rocket } from '@/components/workout/Rocket';
import { CLOUD_CLOCK_PX } from '@/components/workout/player/RestClock';
import { BLOCK_END, CLOUDS, CLOUD_TIMING, WORDS, railTop } from '@/components/workout/rocketFlight';

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
// (The rail, railTop, runs from 66% (start) to 22% (done) of the screen height: even at the start
// most of the rocket is on screen.)
const INK = '#131313';
/** The hole for the % badge in "Llevas el NN % completado.": the badge (44 px tall) grows 1.4 times into it. */
export const PERCENT_SLOT = { w: 104, h: 62 } as const;

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
   * The rest after a block: three sentences instead of the title (see BLOCK_END), then `sub`. With
   * `slot`, the second leaves a hole for the number (the % badge of the corner comes to it).
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

  useEffect(() => {
    if (lastKey.current === playKey) return;
    lastKey.current = playKey;
    if (reduced) return;
    const id = ++run.current;
    // the rocket's box is as tall as the screen, so a percentage moves it by screen heights:
    // start with the nose just under the bottom edge
    const below = `translateY(${(100 - top + 1).toFixed(2)}%)`;

    // (on a phone this layer has no rocket: the widget's rocket is the rocket of the clouds)
    const root = scope.current as HTMLElement;

    const play = async () => {
      animate(scope.current, { visibility: 'visible' }, { duration: 0 });
      // the flame flickers while it flies
      const flame = root.querySelector('.rocket-flame')
        ? animate('.rocket-flame', { transform: ['scale(0.94, 0.9)', 'scale(1.03, 1.06)'] }, { duration: 0.12, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' })
        : null;
      animate('.cl-flight', { opacity: [1, 1] }, { duration: 0 });
      if (!phone) animate('.cl-rocket', { transform: [below, 'translateY(0%)'] }, { duration: 1.7, ease: [0.4, 0, 0.15, 1] });
      animate('.cl-rail', { opacity: [0, 1] }, { duration: 0.5, delay: 0.7 });
      animate('.cl-words', { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0px)'] }, { duration: phone ? WORDS.fadeMs / 1000 : 0.5, delay: phone ? WORDS.phoneDelayMs / 1000 : 1.2, ease: [0.22, 1, 0.36, 1] });
      if (root.querySelector('.cl-be1')) {
        // after a block, one sentence after another (each in with a short fade and slide)
        const swap = BLOCK_END.swapMs / 1000;
        const moments = [BLOCK_END.secondMs, BLOCK_END.thirdMs, BLOCK_END.afterMs];
        for (let i = 2; i <= 4; i++) animate(`.cl-be${i}`, { opacity: 0 }, { duration: 0 });
        animate('.cl-be1', { opacity: 1, transform: 'translateY(0px)' }, { duration: 0 });
        moments.forEach((at, i) => {
          animate(`.cl-be${i + 1}`, { opacity: [1, 0], transform: ['translateY(0px)', 'translateY(-10px)'] }, { duration: swap * 0.8, delay: at / 1000, ease: [0.4, 0, 1, 1] });
          animate(`.cl-be${i + 2}`, { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0px)'] }, { duration: swap, delay: at / 1000 + swap * 0.5, ease: [0.22, 1, 0.36, 1] });
        });
      }
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
      // lift-off: the words go, the rocket shoots off the top, the clouds part
      animate('.cl-words', { opacity: [1, 0], transform: ['translateY(0px)', 'translateY(-8px)'] }, { duration: 0.25 });
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
              <p className="absolute right-3 top-[18%] -translate-y-1/2 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] text-[#131313]/60">
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
          {/* the words, beside the nose */}
          <div
            className="cl-words absolute left-10 w-[calc(66vw-3.5rem)] opacity-0 sm:left-14 sm:w-[min(50vw,24rem)]"
            style={{ top: `calc(${top}% - 0.75rem)` }}
          >
            {kicker && (
              <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-[#131313]">
                <span className="h-2 w-2 rounded-full" style={{ background: color }} />
                {kicker}
              </p>
            )}
            {/* phone: room for the rest's countdown (RestClock stands here), and the title a step smaller */}
            {phone && <div aria-hidden="true" style={{ height: CLOUD_CLOCK_PX }} />}
            {blockEnd ? (
              // after a block: the three sentences, one in the place of the other, then where to
              <div
                className={`grid font-[family-name:var(--font-display)] font-semibold leading-[1.15] tracking-[-0.02em] text-[#131313] ${
                  phone ? 'mt-1 text-[1.4rem]' : 'text-[clamp(1.75rem,3.6vw,2.75rem)]'
                }`}
              >
                <p className="cl-be1 [grid-area:1/1]">{blockEnd.first}</p>
                <p className="cl-be2 [grid-area:1/1]" style={{ opacity: 0 }}>
                  {blockEnd.second.before}{' '}
                  {blockEnd.slot ? (
                    // (the hole the % badge comes to: as tall as it grows)
                    <span data-cloud-slot="" className="inline-block align-middle" style={{ width: PERCENT_SLOT.w, height: PERCENT_SLOT.h }} />
                  ) : (
                    <span className="whitespace-nowrap">{blockEnd.percent}&#8239;%</span>
                  )}{' '}
                  {blockEnd.second.after}
                </p>
                <p className="cl-be3 [grid-area:1/1]" style={{ opacity: 0 }}>
                  {blockEnd.third}
                </p>
                <p className="cl-be4 [grid-area:1/1]" style={{ opacity: 0 }}>
                  {sub}
                </p>
              </div>
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
                {sub && <p className="mt-2 font-[family-name:var(--font-display)] text-lg font-medium text-[#2b2f36]">{sub}</p>}
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
  );
}

'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronUp, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import {
  FLIGHT,
  PAM_KEYFRAMES,
  PARKED,
  RETURN_KEYFRAMES,
  SETTLE_KEYFRAMES,
  TAKEOFF_KEYFRAMES,
  arrival,
  ignitionLevel,
  launchesAfter,
  nextFlight,
  parkedFrom,
  phaseAt,
  type Flight,
} from '@/components/workout/rocketFlight';
import { playbackUrl, retryWithOriginal } from '@/lib/media';
import type { RoutineItem } from '@/types/workout';
import { Hilo } from './Hilo';
import { SeriesList } from './SeriesList';
import { useTapGuard } from './hooks';
import { blocksOf, clock, isExercise, serieState, warmupState, type StepState } from './model';
import { ROCKET, flamePaths, rocketGeometry, type RocketGeometry } from './rocketShape';
import { HOVER_ON_DARK, PRESSABLE, own } from './ui';

/*
 * Phone: the widget at the bottom IS the rocket (the drawing of Rocket.tsx lying on its side,
 * nose to the right), and it goes with you through the whole routine.
 *
 *   serie     inside the body: the hilo and, under it, the name and the time; the porthole is
 *             pause/resume. Tapping the body opens the list above it (with Anterior, Pausa and
 *             Siguiente), as the bar did.
 *   last 3 s  before a rest or the end the engine lights: the flame grows each second, more and
 *             more exhaust, and it trembles.
 *   rest      "Descanso" and "Saltar" and it fills with water as the rest goes by. With talks it
 *             keeps the time (in the porthole) and "Luego", and the next exercise peeks above it.
 *   flights   it takes off as each rest begins (the big rocket of the clouds is the same one: they
 *             are never on screen together), comes back from the depth when the clouds open and
 *             parks with a squash; at the end of a rest, a small "¡pam!". It arrives when the
 *             routine starts and takes off one last time before the end screen.
 *
 * Where it is comes from `Flight` (rocketFlight.ts), a pure function of the clock: every flight is
 * put on the browser's animation timeline at once (Web Animations with delays, no chained timers),
 * so a skip, a pause, a hidden tab or a jump of the fixture always lands it in a defined pose.
 * Only transform and opacity move. Nothing in it can be pressed while it is away.
 */

const INK = '#131313';
const CLOSE_AFTER_MS = 5000;
const TAP_GUARD_MS = 700;

// Water: light enough that ink text reads on it and on the white body alike.
const WATER = { front: '#c8daff', back: '#a6c1ff', line: '#2f6bff' } as const;

export function RocketWidget({
  queue,
  currentIndex,
  displayIndex,
  cloudKey,
  timeLeft,
  isPaused,
  totalItemDuration,
  onTogglePause,
  onPrev,
  canPrev,
  onNext,
  listOpen,
  onListOpenChange,
  restCountdown,
  talkPreview,
  reduced,
}: {
  queue: RoutineItem[];
  currentIndex: number;
  displayIndex: number; // what the screen shows (it changes behind the clouds, and after the last takeoff)
  cloudKey: number; // changes each time the clouds play
  timeLeft: number;
  totalItemDuration: number;
  isPaused: boolean;
  onTogglePause?: () => void;
  onPrev: () => void;
  canPrev: boolean;
  onNext: () => void;
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
  restCountdown: boolean;
  talkPreview: boolean;
  reduced: boolean;
}) {
  const listId = useId();
  const item = queue[currentIndex];
  const ending = item?.kind === 'outro';
  const resting = item?.kind === 'rest';

  // ---- size: the rocket is drawn in screen pixels, as wide as its box
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 380 : Math.min(576, window.innerWidth - 10)));
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const g = useMemo(() => rocketGeometry(width), [width]);

  // ---- the flight
  const root = useRef<HTMLDivElement>(null);
  const flightEl = useRef<HTMLDivElement>(null);
  const squashEl = useRef<HTMLDivElement>(null);
  const flameEl = useRef<HTMLDivElement>(null);
  const waterEl = useRef<HTMLDivElement>(null);
  const textEl = useRef<HTMLDivElement>(null);
  useRocketFlight({ root, flightEl, squashEl, flameEl, contentEls: [waterEl, textEl], cloudKey, ending, queue, currentIndex, reduced });

  // ---- the list's 5 s: restarted by any touch, wheel or scroll inside the widget
  const [touch, setTouch] = useState(0);
  const bump = () => setTouch((n) => n + 1);
  const open = listOpen && !resting && !ending;
  useEffect(() => {
    if (!listOpen) return;
    const t = setTimeout(() => onListOpenChange(false), CLOSE_AFTER_MS);
    return () => clearTimeout(t);
  }, [listOpen, touch, onListOpenChange]);

  // a second tap on "Siguiente" must not land on "Saltar" of the rest that just appeared
  const blocked = useTapGuard(currentIndex, TAP_GUARD_MS);
  const guarded = (fn: () => void) => () => {
    if (!blocked()) fn();
  };

  const blocks = blocksOf(queue);
  const shown = queue[displayIndex];
  const live = displayIndex === currentIndex;
  const time = clock(live ? timeLeft : 0);
  const level = !reduced && live && isExercise(shown) && launchesAfter(queue, displayIndex) ? ignitionLevel(timeLeft) : 0;
  const preview = talkPreview && shown?.kind === 'rest' ? shown.nextExercise : undefined;
  const bodyBox = { left: g.x0, top: ROCKET.F, width: g.tip - g.x0, height: ROCKET.T };
  const c = g.content;
  const contentBox: CSSProperties = { left: c.left, top: c.top, width: c.right - c.left, height: c.bottom - c.top };
  const toggleList = () => onListOpenChange(!listOpen);

  return (
    <div
      ref={root}
      onPointerDownCapture={bump}
      onWheelCapture={bump}
      onKeyDownCapture={bump}
      className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(4px,env(safe-area-inset-left))] right-[max(6px,env(safe-area-inset-right))] z-[61] font-[family-name:var(--font-display)] text-ink"
    >
      <div ref={box} className="relative mx-auto w-full max-w-[36rem]" style={{ height: g.H }}>
        {/* the list, above the rocket */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="list"
              initial={reduced ? { opacity: 1 } : { opacity: 0, transform: 'translateY(16px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: 'translateY(16px)' }}
              transition={{ duration: reduced ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto absolute inset-x-0 bottom-full mb-2 overflow-hidden rounded-[22px] bg-[rgb(14_14_14/0.84)] text-white"
              style={{ marginLeft: g.x0 - 6 }}
            >
              <SeriesList
                id={listId}
                bare
                blocks={blocks}
                warmup={warmupState(queue, currentIndex)}
                stateOf={(i) => serieState(i, currentIndex)}
                onScroll={bump}
              />
              <ListControls isPaused={isPaused} onTogglePause={onTogglePause} onPrev={guarded(onPrev)} canPrev={canPrev} onNext={guarded(onNext)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* THE ROCKET: flight (where it is) > squash (settle, ¡pam!) > tremble (ignition) */}
        <div ref={flightEl} className="absolute inset-0">
          <div ref={squashEl} className="absolute inset-0" style={{ transformOrigin: `50% ${ROCKET.F + ROCKET.T}px` }}>
            <div
              className={`absolute inset-0 ${level > 0 && !isPaused ? 'rw-shake' : ''}`}
              style={{ '--rw-amp': SHAKE[level] } as CSSProperties}
            >
              <IgnitionFlame g={g} level={level} />
              <FlightFlame g={g} flameRef={flameEl} />
              <RocketBack g={g} />
              <Exhaust g={g} level={level} paused={isPaused} />
              <div ref={waterEl} className="absolute inset-0">
                {shown?.kind === 'rest' && (
                  <Water
                    key={displayIndex}
                    g={g}
                    level={live && totalItemDuration > 0 ? (totalItemDuration - timeLeft + 1) / totalItemDuration : 0}
                    reduced={reduced}
                  />
                )}
              </div>
              <RocketFront g={g} glint={shown?.kind === 'rest' && (restCountdown || !live)} />

              {/* what it carries */}
              <div ref={textEl} className="absolute inset-0">
                {isExercise(shown) && (
                  <>
                    {/* a tap anywhere on the body opens the list, as the bar did */}
                    <div
                      data-bar=""
                      onClick={toggleList}
                      className="pointer-events-auto absolute cursor-pointer"
                      style={{ ...bodyBox, borderRadius: 6 }}
                    />
                    <div className="absolute flex flex-col" style={contentBox}>
                      {/* a real button for keyboards and screen readers */}
                      <button
                        type="button"
                        onClick={own(toggleList)}
                        aria-expanded={open}
                        aria-controls={listId}
                        aria-label={open ? 'Cerrar la rutina' : 'Ver la rutina'}
                        className="pointer-events-auto mt-[8px] flex h-4 cursor-pointer items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        <Hilo
                          surface="light"
                          className="flex-1"
                          blocks={blocks.map((block) => block.series.map((serie): StepState => serieState(serie.queueIndex, displayIndex)))}
                        />
                        <ChevronUp
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 shrink-0 text-ink/70 transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                        />
                      </button>
                      <div className="mb-[9px] mt-auto flex h-[30px] items-center gap-1.5">
                        <p data-rw="name" className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-[1.25] min-[375px]:text-[17px]">
                          {shown.kind === 'warmup' ? 'Calentamiento' : shown.exercise.title}
                        </p>
                        <span data-rw="time" role="timer" className="shrink-0 text-[19px] font-bold leading-none tabular-nums tracking-[-0.02em] min-[375px]:text-[21px]">
                          {time}
                        </span>
                      </div>
                    </div>
                    {/* the porthole: pause / resume (a 44 px target round a smaller window) */}
                    <button
                      type="button"
                      data-rw="porthole"
                      onClick={own(() => onTogglePause?.())}
                      aria-label={isPaused ? 'Reanudar' : 'Pausar'}
                      className="pointer-events-auto absolute flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-ink active:scale-95 motion-reduce:active:scale-100"
                      style={{ left: g.porthole.cx - 22, top: g.porthole.cy - 22 }}
                    >
                      {isPaused ? (
                        <Play className="ml-0.5 h-[13px] w-[13px] fill-current" aria-hidden="true" />
                      ) : (
                        <Pause className="h-[13px] w-[13px] fill-current" aria-hidden="true" />
                      )}
                    </button>
                  </>
                )}

                {shown?.kind === 'rest' && (
                  <>
                    {restCountdown || !live ? (
                      <div className="absolute flex items-center gap-2" style={contentBox}>
                        <p data-rw="rest" className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-tight">
                          Descanso
                        </p>
                        <SkipButton onSkip={guarded(onNext)} />
                      </div>
                    ) : (
                      <div className="absolute flex flex-col" style={contentBox}>
                        <p data-rw="next" className="mt-[6px] h-[18px] truncate text-[14px] font-medium leading-[18px] text-ink/80">
                          Luego: {shown.nextExercise.title}
                        </p>
                        <div className="mb-[5px] mt-auto flex items-center gap-2">
                          <p data-rw="rest" className="min-w-0 flex-1 truncate text-[17px] font-semibold leading-tight">
                          Descanso
                        </p>
                          <SkipButton onSkip={guarded(onNext)} />
                        </div>
                      </div>
                    )}
                    {/* long rest with talks: the seconds in the porthole */}
                    {!restCountdown && live && (
                      <span
                        role="timer"
                        aria-label={`${time} de descanso`}
                        className={`absolute flex h-11 w-11 items-center justify-center font-bold tabular-nums leading-none ${timeLeft >= 60 ? 'text-[11px]' : 'text-[15px]'}`}
                        style={{ left: g.porthole.cx - 22, top: g.porthole.cy - 22 }}
                      >
                        {timeLeft >= 60 ? time : Math.max(0, Math.round(timeLeft))}
                      </span>
                    )}
                    {/* the first serie of the coming block, standing on the body, right of the fin */}
                    {preview && (
                      <video
                        key={preview.id}
                        data-rw="preview"
                        src={playbackUrl(preview)}
                        poster={preview.poster_url ?? undefined}
                        autoPlay
                        loop
                        muted
                        playsInline
                        aria-hidden="true"
                        onError={(e) => retryWithOriginal(e.currentTarget, preview)}
                        className="pointer-events-none absolute h-[106px] w-[60px] rounded-[12px] bg-black object-cover ring-2 ring-white"
                        style={{ left: Math.max(c.left, g.finReach + 10), top: ROCKET.F - 8 - 106 }}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The flight on the animation timeline

function useRocketFlight({
  root,
  flightEl,
  squashEl,
  flameEl,
  contentEls,
  cloudKey,
  ending,
  queue,
  currentIndex,
  reduced,
}: {
  root: RefObject<HTMLDivElement | null>;
  flightEl: RefObject<HTMLDivElement | null>;
  squashEl: RefObject<HTMLDivElement | null>;
  flameEl: RefObject<HTMLDivElement | null>;
  contentEls: RefObject<HTMLDivElement | null>[];
  cloudKey: number;
  ending: boolean;
  queue: RoutineItem[];
  currentIndex: number;
  reduced: boolean;
}) {
  const flight = useRef<Flight>(PARKED);
  const seen = useRef<{ cloudKey: number; ending: boolean; queue: RoutineItem[]; item: RoutineItem | undefined } | null>(null);
  const unblock = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const contents = useRef(contentEls);

  useLayoutEffect(() => {
    const now = performance.now();
    const prev = seen.current;
    const item = queue[currentIndex];
    seen.current = { cloudKey, ending, queue, item };

    let next: Flight;
    if (!prev) next = arrival(now);
    else if (ending && !prev.ending) next = nextFlight(flight.current, 'end', now);
    else if (!ending && cloudKey !== prev.cloudKey && !reduced) next = nextFlight(flight.current, 'clouds', now);
    else if (!ending && (prev.ending || queue !== prev.queue)) next = nextFlight(flight.current, 'show', now);
    else {
      // the end of a rest: no clouds, a small "¡pam!" as the serie comes in
      const squash = squashEl.current;
      const parked = phaseAt(flight.current, now) === 'parked';
      if (squash && parked && prev.item?.kind === 'rest' && isExercise(item)) {
        if (reduced) contents.current.forEach((r) => r.current?.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 200 }));
        else squash.animate(PAM_KEYFRAMES, { duration: FLIGHT.pamMs });
      }
      return;
    }
    if (next === flight.current) return;
    flight.current = next;

    const els = {
      flight: flightEl.current,
      squash: squashEl.current,
      flame: flameEl.current,
      contents: contents.current.map((r) => r.current).filter((el): el is HTMLDivElement => el !== null),
    };
    if (!els.flight || !els.squash || !els.flame) return;
    playFlight(next, now, reduced, { flight: els.flight, squash: els.squash, flame: els.flame, contents: els.contents });

    // nothing in it can be pressed until it is parked again
    const node = root.current;
    clearTimeout(unblock.current);
    if (node) {
      const until = parkedFrom(next);
      node.toggleAttribute('inert', until > now);
      if (until > now && Number.isFinite(until)) unblock.current = setTimeout(() => node.toggleAttribute('inert', false), until - now);
    }
  }, [cloudKey, ending, queue, currentIndex, reduced, root, flightEl, squashEl, flameEl]);

  // Back from the background (where timers run late): controls follow where the rocket really is.
  useEffect(() => {
    const onVisible = () => {
      const node = root.current;
      if (document.visibilityState !== 'visible' || !node) return;
      const parkedAt = parkedFrom(flight.current);
      if (performance.now() >= parkedAt) {
        clearTimeout(unblock.current);
        node.toggleAttribute('inert', false);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(unblock.current);
    };
  }, [root]);
}

/** Puts the whole of a flight on the timeline, from now: leaving (if it does), and coming back (if it does). */
function playFlight(
  f: Flight,
  now: number,
  reduced: boolean,
  el: { flight: HTMLElement; squash: HTMLElement; flame: HTMLElement; contents: HTMLElement[] },
) {
  // where it is right now, for a fade from mid-flight
  const style = getComputedStyle(el.flight);
  const from = { transform: style.transform === 'none' ? 'none' : style.transform, opacity: Number(style.opacity) };
  [el.flight, el.squash, el.flame, ...el.contents].forEach((node) => node.getAnimations().forEach((a) => a.cancel()));
  if (f.leftAt === null) return;

  const leaves = Number.isFinite(f.leftAt);
  const delay = (t: number) => t - now;
  // Anchored to the clock: a page in the background doesn't start its animations until it is
  // shown again, which would push the whole flight late. With its start time set, it is wherever
  // it should be by now the moment the page is seen.
  const run = (node: HTMLElement, keys: Keyframe[], options: KeyframeAnimationOptions) => {
    node.animate(keys, options).startTime = now;
  };
  const contentTo = (keys: Keyframe[], options: KeyframeAnimationOptions) => el.contents.forEach((node) => run(node, keys, options));

  if (leaves) {
    const at = delay(f.leftAt);
    if (f.how === 'takeoff' && !reduced) {
      run(el.flight, TAKEOFF_KEYFRAMES, { duration: FLIGHT.takeoffMs, delay: at, fill: 'forwards' });
      // full flame from the first push
      run(el.flame, 
        [
          { opacity: 0, transform: 'scale(0.35, 0.8)' },
          { opacity: 1, transform: 'scale(0.6, 0.95)', offset: FLIGHT.anticipationMs / FLIGHT.takeoffMs },
          { opacity: 1, transform: 'scale(1, 1)', offset: 0.5 },
          { opacity: 1, transform: 'scale(1, 1)' },
        ],
        { duration: FLIGHT.takeoffMs, delay: at, fill: 'forwards' },
      );
      contentTo([{ opacity: 1 }, { opacity: 0 }], { duration: FLIGHT.contentOutMs, delay: at, fill: 'forwards', easing: 'ease-out' });
    } else {
      // an interrupted flight, or reduced motion: it fades where it is
      run(el.flight, 
        [
          { transform: from.transform, opacity: from.opacity },
          { transform: from.transform, opacity: 0 },
        ],
        { duration: FLIGHT.fadeMs, delay: at, fill: 'forwards' },
      );
      contentTo([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });
    }
  }

  if (f.returnAt === null) {
    if (!leaves) run(el.flight, [{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });
    return;
  }
  // coming back: while it waits, the leaving animation holds it away; with none, the return's own first frame does
  const fill: FillMode = leaves ? 'forwards' : 'both';
  const at = delay(f.returnAt);
  const parkedAt = at + FLIGHT.returnMs;
  if (reduced) {
    run(el.flight, [{ transform: 'none', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 250, delay: at, fill });
    contentTo([{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: at, fill });
    return;
  }
  run(el.flight, RETURN_KEYFRAMES, { duration: FLIGHT.returnMs, delay: at, fill });
  // the flame burns on the way in and dies as it settles
  run(el.flame, 
    [
      { opacity: 1, transform: 'scale(0.8, 0.95)' },
      { opacity: 1, transform: 'scale(1, 1)', offset: 0.2 },
      { opacity: 1, transform: 'scale(0.7, 0.9)', offset: 0.7 },
      { opacity: 0.8, transform: 'scale(0.25, 0.6)', offset: 0.9 },
      { opacity: 0, transform: 'scale(0.05, 0.4)' },
    ],
    { duration: FLIGHT.returnMs, delay: at, fill },
  );
  run(el.squash, SETTLE_KEYFRAMES, { duration: FLIGHT.settleMs, delay: parkedAt - FLIGHT.settleMs * 0.35 });
  contentTo([{ opacity: 0 }, { opacity: 1 }], { duration: FLIGHT.contentInMs, delay: parkedAt, fill, easing: 'ease-out' });
}

// ---------------------------------------------------------------------------------------------
// The drawing

/** Fins, nozzle, body and nose: white with the ink line (under the water). */
function RocketBack({ g }: { g: RocketGeometry }) {
  return (
    <svg
      data-rocket="back"
      aria-hidden="true"
      width={g.W}
      height={g.H}
      viewBox={`0 0 ${g.W} ${g.H}`}
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      fill="#fff"
      stroke={INK}
      strokeWidth={ROCKET.STROKE}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d={g.finTop} />
      <path d={g.finBottom} />
      <path d={g.nozzle} />
      <path d={g.nozzleLine} strokeWidth={1.25} />
      <rect x={g.body.x} y={g.body.y} width={g.body.w} height={g.body.h} rx={2.5} />
      <path d={g.nose} />
    </svg>
  );
}

/** What is drawn over the water: the bands, the line of the nose's base, the edge-on fin, the porthole. */
function RocketFront({ g, glint }: { g: RocketGeometry; glint: boolean }) {
  const { F, T } = ROCKET;
  const { cx, cy, r } = g.porthole;
  return (
    <svg
      data-rocket="front"
      aria-hidden="true"
      width={g.W}
      height={g.H}
      viewBox={`0 0 ${g.W} ${g.H}`}
      className="pointer-events-none absolute left-0 top-0 overflow-visible"
      fill="#fff"
      stroke={INK}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      {g.bands.map((x) => (
        <path key={x} d={`M${x} ${F} L${x} ${F + T}`} strokeWidth={1.4} />
      ))}
      <path d={`M${g.x1} ${F} L${g.x1} ${F + T}`} strokeWidth={ROCKET.STROKE} />
      <path d={g.edgeFin} strokeWidth={ROCKET.STROKE} />
      <circle cx={cx} cy={cy} r={r} strokeWidth={ROCKET.STROKE} />
      {glint && <path d={`M${cx - r * 0.52} ${cy - r * 0.31} A${r * 0.59} ${r * 0.59} 0 0 1 ${cx + r * 0.16} ${cy - r * 0.59}`} fill="none" strokeWidth={1.2} />}
    </svg>
  );
}

const FLAME = flamePaths();

function FlameDrawing() {
  return (
    <svg viewBox={`0 0 ${FLAME.w} ${FLAME.h}`} className="rw-flicker block h-full w-full overflow-visible">
      <path d={FLAME.outer} fill="#ff3b30" />
      <path d={FLAME.core} fill="#fff" />
    </svg>
  );
}

const flameBox = (g: RocketGeometry): CSSProperties => ({
  left: g.xe + 3 - FLAME.w,
  top: g.cy - FLAME.h / 2,
  width: FLAME.w,
  height: FLAME.h,
  transformOrigin: '100% 50%',
});

/** The flame of the flight: hidden unless a flight animation shows it. */
function FlightFlame({ g, flameRef }: { g: RocketGeometry; flameRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={flameRef} aria-hidden="true" className="pointer-events-none absolute" style={{ ...flameBox(g), opacity: 0 }}>
      <FlameDrawing />
    </div>
  );
}

// Each step of the ignition: flame length and thickness, and how many puffs.
const IGNITION = [
  { sx: 0, sy: 0.5 },
  { sx: 0.16, sy: 0.62 },
  { sx: 0.25, sy: 0.78 },
  { sx: 0.34, sy: 0.92 },
] as const;
// Exhaust: puffs born in the nozzle that billow out round the tail, mostly upwards (drawn over the
// tail, never as far as the content); one more pair each second.
const PUFFS = [
  { dx: -8, dy: -44, delay: 0, s: 1.1 },
  { dx: 8, dy: 34, delay: 0.45, s: 1.15 },
  { dx: -2, dy: -66, delay: 0.25, s: 1.2 },
  { dx: 18, dy: -50, delay: 0.7, s: 1 },
  { dx: 24, dy: -72, delay: 0.55, s: 1.25 },
  { dx: -10, dy: 42, delay: 0.9, s: 1.05 },
] as const;
// The tremble grows with the flame.
const SHAKE = [0, 0.6, 1, 1.5] as const;

/** The engine lighting up in the last 3 s: the flame grows each second (behind the nozzle)... */
function IgnitionFlame({ g, level }: { g: RocketGeometry; level: 0 | 1 | 2 | 3 }) {
  const step = IGNITION[level];
  return (
    <div
        aria-hidden="true"
        className="pointer-events-none absolute transition-[transform,opacity] duration-[450ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{ ...flameBox(g), opacity: level > 0 ? 1 : 0, transform: `scale(${step.sx}, ${step.sy})` }}
      >
      <FlameDrawing />
    </div>
  );
}

/** ...with more and more exhaust round the tail. */
function Exhaust({ g, level, paused }: { g: RocketGeometry; level: 0 | 1 | 2 | 3; paused: boolean }) {
  return (
    <>
      {PUFFS.slice(0, level * 2).map((puff, i) => (
        <div
          key={i}
          aria-hidden="true"
          className="rw-puff pointer-events-none absolute"
          style={
            {
              left: g.xe - 10,
              top: g.cy - 9,
              width: 26,
              height: 18,
              '--rw-dx': `${puff.dx}px`,
              '--rw-dy': `${puff.dy}px`,
              '--rw-puff-delay': `${puff.delay}s`,
              '--rw-puff-s': `${puff.s}s`,
              animationPlayState: paused ? 'paused' : 'running',
            } as CSSProperties
          }
        >
          <svg viewBox="0 0 26 18" className="block h-full w-full overflow-visible" fill="#fff" stroke={INK} strokeWidth={1.4} strokeLinejoin="round">
            <path d="M5 15 A4.5 4.5 0 0 1 4.5 6.4 A6 6 0 0 1 15.5 4.2 A5 5 0 0 1 22.6 9.6 A3.8 3.8 0 0 1 20.5 15 Z" />
          </svg>
        </div>
      ))}
    </>
  );
}

// Bubbles: where they rise (fraction of the water's width), size, and timing.
const BUBBLES = [
  { x: 0.14, r: 2.5, s: 2.4, delay: 0 },
  { x: 0.33, r: 2, s: 2.9, delay: 1.1 },
  { x: 0.5, r: 3, s: 2.2, delay: 0.5 },
  { x: 0.68, r: 2, s: 3.1, delay: 1.7 },
  { x: 0.84, r: 2.5, s: 2.6, delay: 0.8 },
] as const;
const WAVE_PERIOD = 40;

/**
 * The rest fills the whole silhouette (body and nose) with water from the bottom up. Two wave
 * layers slide at different speeds, a few bubbles rise, and the surface calms near the top.
 * Only transforms move: the level (once a second), the waves (sideways) and the bubbles.
 */
function Water({ g, level, reduced }: { g: RocketGeometry; level: number; reduced: boolean }) {
  const { F, T } = ROCKET;
  const l = Math.min(1, Math.max(0, level));
  const calm = l < 0.7 ? 1 : Math.max(0.2, (1 - l) / 0.3);
  const width = g.W - g.x0;
  const strip = Math.ceil(width / WAVE_PERIOD + 1) * WAVE_PERIOD * 2;
  const run = Array.from({ length: strip / WAVE_PERIOD }, () => 'q10 -6 20 0 t20 0').join(' ');
  const move = reduced ? 'none' : 'transform 1s linear';
  const wave = (cls: string, base: number, fill: string, line?: string) => (
    <div className="absolute left-0 overflow-hidden" style={{ top: -9, height: 10, width: strip, transformOrigin: '50% 100%', transform: `scaleY(${calm})`, transition: move }}>
      <svg width={strip} height={10} viewBox={`0 0 ${strip} 10`} className={`block ${reduced ? '' : cls}`}>
        <path d={`M0 ${base} ${run} V10 H0 Z`} fill={fill} />
        {line && <path d={`M0 ${base} ${run}`} fill="none" stroke={line} strokeWidth={1.5} />}
      </svg>
    </div>
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ clipPath: `path('${g.inside}')` }}>
      <div
        data-rw="water"
        className="absolute"
        style={{ left: g.x0, top: F, width, height: T, transform: `translateY(${((1 - l) * 100).toFixed(2)}%)`, transition: move }}
      >
        <div className="absolute left-0" style={{ top: -3, width: strip }}>
          {wave('rw-wave-back', 4, WATER.back)}
        </div>
        <div className="absolute left-0" style={{ top: 0, width: strip }}>
          {wave('rw-wave-front', 5, WATER.front, WATER.line)}
        </div>
        <div className="absolute inset-x-0 bottom-0 top-[1px]" style={{ background: WATER.front }} />
        {!reduced &&
          BUBBLES.map((b, i) => (
            <span
              key={i}
              className="rw-bubble absolute rounded-full border-[1.25px] bg-white/50"
              style={
                {
                  left: b.x * width,
                  top: T - 2 * b.r - 3,
                  width: 2 * b.r,
                  height: 2 * b.r,
                  borderColor: WATER.line,
                  '--rw-rise': `${-(T - 14)}px`,
                  '--rw-bubble-s': `${b.s}s`,
                  '--rw-bubble-delay': `${b.delay}s`,
                } as CSSProperties
              }
            />
          ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Controls

function SkipButton({ onSkip }: { onSkip: () => void }) {
  return (
    <button
      type="button"
      data-rw="skip"
      onClick={own(onSkip)}
      // drawn 34 px tall; the target reaches 44 px
      className={`pointer-events-auto relative flex h-[34px] shrink-0 cursor-pointer items-center rounded-full bg-white px-3 text-[15px] min-[360px]:px-4 font-semibold ring-[1.5px] ring-ink ring-inset transition-colors duration-150 before:absolute before:-inset-x-1 before:-inset-y-[5px] before:content-[''] hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:scale-95 motion-reduce:active:scale-100`}
    >
      Saltar
    </button>
  );
}

/** Under the list: Anterior, Pausa, Siguiente (they don't fit in the rocket). */
function ListControls({
  isPaused,
  onTogglePause,
  onPrev,
  canPrev,
  onNext,
}: {
  isPaused: boolean;
  onTogglePause?: () => void;
  onPrev: () => void;
  canPrev: boolean;
  onNext: () => void;
}) {
  const icon = `flex h-11 w-11 items-center justify-center rounded-full ${PRESSABLE} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`;
  return (
    <div className="flex items-center justify-center gap-6 border-t border-white/12 py-1.5">
      <button type="button" onClick={own(onPrev)} disabled={!canPrev} aria-label="Anterior" className={`${icon} ${HOVER_ON_DARK} disabled:opacity-35`}>
        <SkipBack className="h-[18px] w-[18px] fill-current" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={own(() => onTogglePause?.())}
        aria-label={isPaused ? 'Reanudar' : 'Pausar'}
        className={`${icon} bg-white text-ink hover:bg-white/80 active:scale-95 motion-reduce:active:scale-100`}
      >
        {isPaused ? <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" /> : <Pause className="h-5 w-5 fill-current" aria-hidden="true" />}
      </button>
      <button type="button" onClick={own(onNext)} aria-label="Siguiente" className={`${icon} ${HOVER_ON_DARK}`}>
        <SkipForward className="h-[18px] w-[18px] fill-current" aria-hidden="true" />
      </button>
    </div>
  );
}

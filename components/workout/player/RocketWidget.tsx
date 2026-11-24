'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronUp, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import {
  FLIGHT,
  PAM_KEYFRAMES,
  PARKED,
  POD,
  POD_BUMP_KEYFRAMES,
  RETURN_KEYFRAMES,
  SETTLE_KEYFRAMES,
  SINK,
  SPUTTER,
  SPUTTER_FLAME_KEYFRAMES,
  SPUTTER_KEYFRAMES,
  TAKEOFF_KEYFRAMES,
  UPRIGHT,
  arrival,
  controlsLiveAt,
  controlsLiveFrom,
  ignitionLevel,
  launchesAfter,
  nextFlight,
  phaseAt,
  podPopKeyframes,
  podRetractKeyframes,
  sinkAt,
  sinkTransform,
  springBackKeyframes,
  sputterPuffKeyframes,
  sputtersBetween,
  type Flight,
  type Sink,
} from '@/components/workout/rocketFlight';
import { playbackUrl, retryWithOriginal } from '@/lib/media';
import type { RoutineItem } from '@/types/workout';
import { Hilo } from './Hilo';
import { SeriesList } from './SeriesList';
import { useTapGuard } from './hooks';
import { blocksOf, clock, isExercise, serieState, warmupState, type StepState } from './model';
import { POD as POD_SHAPE, ROCKET, flamePaths, rocketGeometry, type Box, type RocketGeometry } from './rocketShape';
import { own } from './ui';

/*
 * Phone: the widget at the bottom IS the rocket (the drawing of Rocket.tsx lying on its side,
 * nose to the right), and it goes with you through the whole routine.
 *
 *   serie     inside the body the hilo (big, across the whole body) and the name; the time in the
 *             short, rounded nose. Under the belly hangs the control pod: Anterior, Pausa,
 *             Siguiente. Tapping the body opens the list above it.
 *   warm-up   the same; between one clip and the next it tries to take off and can't (a sputter,
 *             a hop, and it settles back).
 *   last 3 s  before a rest or the end the engine lights: the flame grows each second, more and
 *             more exhaust, and it trembles.
 *   rest      "Descanso" in the body and "Saltar" in the pod. It fills with water as the rest goes
 *             by, and gets heavy: it sinks a little, tail down. When the rest ends, "¡pam!": the
 *             water is gone and it springs back upright. With talks the time is in the nose, and
 *             the next exercise peeks above the body.
 *   flights   it takes off as each rest begins (the pod goes back into its belly first), leaves the
 *             screen, and only a beat later does the big rocket of the clouds come up (the same
 *             one: they are never on screen together); once that one has gone, a beat, and it
 *             comes back from the left and parks with a squash; then the pod pops out. It arrives
 *             when the routine starts and takes off one last time before the end screen.
 *
 * Where it is comes from `Flight` (rocketFlight.ts), a pure function of the clock: every flight is
 * put on the browser's animation timeline at once (Web Animations with delays, no chained timers),
 * so a skip, a pause, a hidden tab or a jump of the fixture always lands it in a defined pose.
 * Only transform and opacity move. Nothing in it can be pressed while it is away (`inert`, kept in
 * step with the flight by one effect that owns its timer, see useInertWhileAway).
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

  const shown = queue[displayIndex];
  const live = displayIndex === currentIndex;

  // ---- the rest's weight: it sinks as the water rises (a transform, set once a second)
  const level = shown?.kind === 'rest' && live && totalItemDuration > 0 ? (totalItemDuration - timeLeft + 1) / totalItemDuration : 0;
  const sink = !reduced && shown?.kind === 'rest' ? sinkAt(level) : UPRIGHT;
  const lastSink = useRef<Sink>(UPRIGHT);
  useEffect(() => {
    lastSink.current = sink;
  }, [sink]);

  // ---- the flight
  const root = useRef<HTMLDivElement>(null);
  const flightEl = useRef<HTMLDivElement>(null);
  const sinkEl = useRef<HTMLDivElement>(null);
  const squashEl = useRef<HTMLDivElement>(null);
  const flameEl = useRef<HTMLDivElement>(null);
  const puffsEl = useRef<HTMLDivElement>(null);
  const podEl = useRef<HTMLDivElement>(null);
  const waterEl = useRef<HTMLDivElement>(null);
  const textEl = useRef<HTMLDivElement>(null);
  const flight = useRocketFlight({
    els: { flightEl, sinkEl, squashEl, flameEl, puffsEl, podEl, contentEls: [waterEl, textEl] },
    lastSink,
    podHidden: g.pod.hidden,
    cloudKey,
    ending,
    queue,
    currentIndex,
    reduced,
  });
  useInertWhileAway(root, flight, cloudKey, ending, queue, currentIndex, reduced);

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
  const time = clock(live ? timeLeft : 0);
  const ignition = !reduced && live && isExercise(shown) && launchesAfter(queue, displayIndex) ? ignitionLevel(timeLeft) : 0;
  const preview = talkPreview && shown?.kind === 'rest' ? shown.nextExercise : undefined;
  const bodyBox: CSSProperties = { left: g.x0, top: ROCKET.F, width: g.tip - g.x0, height: ROCKET.T };
  const contentBox = boxStyle(g.content);
  const toggleList = () => onListOpenChange(!listOpen);
  const showTime = isExercise(shown) || (shown?.kind === 'rest' && !restCountdown && live);

  return (
    <div
      ref={root}
      data-rw="root"
      onPointerDownCapture={bump}
      onWheelCapture={bump}
      onKeyDownCapture={bump}
      className="pointer-events-none fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(4px,env(safe-area-inset-left))] right-[max(6px,env(safe-area-inset-right))] z-[61] font-[family-name:var(--font-display)] text-ink"
    >
      <div ref={box} className="relative mx-auto w-full max-w-[36rem]" style={{ height: g.box }}>
        {/* the list, above the rocket (its controls are the pod's, under the rocket) */}
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* THE ROCKET: flight (where it is) > pod (under the belly, behind it) and
            sink (the rest's weight) > squash (settle, ¡pam!, sputter) > tremble (ignition) */}
        <div ref={flightEl} className="absolute inset-0">
          <div ref={podEl} data-rw="pod" className="absolute inset-0" style={{ transformOrigin: `${g.pod.cx}px ${g.pod.top}px` }}>
            {shown?.kind === 'rest' ? (
              <Pod g={g} box={g.pod.skip}>
                <button
                  type="button"
                  data-rw="skip"
                  onClick={own(guarded(onNext))}
                  className="pointer-events-auto flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full text-[18px] font-semibold transition-colors duration-150 hover:bg-ink/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink active:scale-95 motion-reduce:active:scale-100"
                >
                  Saltar
                  <SkipForward className="h-[18px] w-[18px] fill-current" aria-hidden="true" />
                </button>
              </Pod>
            ) : (
              <Pod g={g} box={g.pod.controls}>
                <PodButton rw="prev" label="Anterior" onClick={guarded(onPrev)} disabled={!canPrev}>
                  <SkipBack className="h-[20px] w-[20px] fill-current" aria-hidden="true" />
                </PodButton>
                <PodButton rw="pause" label={isPaused ? 'Reanudar' : 'Pausar'} onClick={() => onTogglePause?.()} strong>
                  {isPaused ? (
                    <Play className="ml-0.5 h-[20px] w-[20px] fill-current" aria-hidden="true" />
                  ) : (
                    <Pause className="h-[20px] w-[20px] fill-current" aria-hidden="true" />
                  )}
                </PodButton>
                <PodButton rw="next" label="Siguiente" onClick={guarded(onNext)}>
                  <SkipForward className="h-[20px] w-[20px] fill-current" aria-hidden="true" />
                </PodButton>
              </Pod>
            )}
          </div>

          <div
            ref={sinkEl}
            data-rw="sink"
            className="absolute inset-0"
            style={{
              transform: sinkTransform(sink),
              transformOrigin: `${g.pod.pivot.x}px ${g.pod.pivot.y}px`,
              transition: resting && !reduced ? 'transform 1s linear' : 'none',
            }}
          >
            <div ref={squashEl} className="absolute inset-0" style={{ transformOrigin: `50% ${ROCKET.F + ROCKET.T}px` }}>
              <div
                className={`absolute inset-0 ${ignition > 0 && !isPaused ? 'rw-shake' : ''}`}
                style={{ '--rw-amp': SHAKE[ignition] } as CSSProperties}
              >
                <IgnitionFlame g={g} level={ignition} />
                <FlightFlame g={g} flameRef={flameEl} />
                <RocketBack g={g} />
                <Exhaust g={g} level={ignition} paused={isPaused} />
                <SputterPuffs g={g} puffsRef={puffsEl} />
                <div ref={waterEl} className="absolute inset-0">
                  {shown?.kind === 'rest' && <Water key={displayIndex} g={g} level={level} reduced={reduced} />}
                </div>
                <RocketFront g={g} />

                {/* what it carries */}
                <div ref={textEl} className="absolute inset-0">
                  {isExercise(shown) && (
                    <>
                      {/* a tap anywhere on the body opens the list */}
                      <div data-bar="" onClick={toggleList} className="pointer-events-auto absolute cursor-pointer" style={{ ...bodyBox, borderRadius: 6 }} />
                      <div className="absolute flex flex-col" style={contentBox}>
                        {/* a real button for keyboards and screen readers */}
                        <button
                          type="button"
                          onClick={own(toggleList)}
                          aria-expanded={open}
                          aria-controls={listId}
                          aria-label={open ? 'Cerrar la rutina' : 'Ver la rutina'}
                          className="pointer-events-auto mt-[9px] flex h-[16px] cursor-pointer items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                        >
                          <Hilo
                            surface="light"
                            size="lg"
                            className="flex-1"
                            blocks={blocks.map((block) => block.series.map((serie): StepState => serieState(serie.queueIndex, displayIndex)))}
                          />
                        </button>
                        <div className="mb-[8px] mt-auto flex h-[30px] items-center gap-1.5">
                          <p data-rw="name" className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-[1.3] min-[360px]:text-[20px]">
                            {shown.kind === 'warmup' ? 'Calentamiento' : shown.exercise.title}
                          </p>
                          <ChevronUp
                            aria-hidden="true"
                            // (on the narrowest phones the name needs its room more than the hint)
                            className={`hidden h-4 w-4 shrink-0 text-ink/70 transition-transform min-[340px]:block duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {shown?.kind === 'rest' &&
                    (restCountdown || !live ? (
                      <div className="absolute flex items-center" style={contentBox}>
                        <p data-rw="rest" className="min-w-0 flex-1 truncate text-[22px] font-semibold leading-tight">
                          Descanso
                        </p>
                      </div>
                    ) : (
                      <div className="absolute flex flex-col" style={contentBox}>
                        <p data-rw="later" className="mt-[9px] h-[20px] truncate text-[15px] font-medium leading-[20px] text-ink/80">
                          Luego: {shown.nextExercise.title}
                        </p>
                        <p data-rw="rest" className="mb-[8px] mt-auto truncate text-[21px] font-semibold leading-[28px]">
                          Descanso
                        </p>
                      </div>
                    ))}

                  {/* the time, big, in the nose (a rest with the giant countdown on the video doesn't repeat it) */}
                  {showTime && (
                    <span
                      data-rw="time"
                      role="timer"
                      aria-label={shown?.kind === 'rest' ? `${time} de descanso` : undefined}
                      className="pointer-events-none absolute flex items-center justify-center text-[27px] font-bold leading-none tabular-nums tracking-[-0.02em] min-[360px]:text-[30px]"
                      style={boxStyle(g.time)}
                    >
                      {time}
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
                      style={{ left: Math.max(g.content.left, g.finReach + 10), top: ROCKET.F - 8 - 106 }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const boxStyle = (b: Box): CSSProperties => ({ left: b.left, top: b.top, width: b.right - b.left, height: b.bottom - b.top });

// ---------------------------------------------------------------------------------------------
// The flight on the animation timeline

interface FlightEls {
  flightEl: RefObject<HTMLDivElement | null>;
  sinkEl: RefObject<HTMLDivElement | null>;
  squashEl: RefObject<HTMLDivElement | null>;
  flameEl: RefObject<HTMLDivElement | null>;
  puffsEl: RefObject<HTMLDivElement | null>;
  podEl: RefObject<HTMLDivElement | null>;
  contentEls: RefObject<HTMLDivElement | null>[];
}

function useRocketFlight({
  els,
  lastSink,
  podHidden,
  cloudKey,
  ending,
  queue,
  currentIndex,
  reduced,
}: {
  els: FlightEls;
  lastSink: RefObject<Sink>;
  podHidden: number;
  cloudKey: number;
  ending: boolean;
  queue: RoutineItem[];
  currentIndex: number;
  reduced: boolean;
}): RefObject<Flight> {
  const flight = useRef<Flight>(PARKED);
  const seen = useRef<{ cloudKey: number; ending: boolean; queue: RoutineItem[]; item: RoutineItem | undefined } | null>(null);
  const refs = useRef(els);
  const hidden = useRef(podHidden);
  useLayoutEffect(() => {
    hidden.current = podHidden;
  }, [podHidden]);

  useLayoutEffect(() => {
    const now = performance.now();
    const prev = seen.current;
    const item = queue[currentIndex];
    seen.current = { cloudKey, ending, queue, item };
    const r = refs.current;
    const el = {
      flight: r.flightEl.current,
      sink: r.sinkEl.current,
      squash: r.squashEl.current,
      flame: r.flameEl.current,
      puffs: r.puffsEl.current,
      pod: r.podEl.current,
      contents: r.contentEls.map((x) => x.current).filter((x): x is HTMLDivElement => x !== null),
    };
    if (!el.flight || !el.sink || !el.squash || !el.flame || !el.pod || !el.puffs) return;

    let next: Flight;
    if (!prev) next = arrival(now);
    else if (ending && !prev.ending) next = nextFlight(flight.current, 'end', now);
    else if (!ending && cloudKey !== prev.cloudKey && !reduced) next = nextFlight(flight.current, 'clouds', now);
    else if (!ending && (prev.ending || queue !== prev.queue)) next = nextFlight(flight.current, 'show', now);
    else {
      // No flight: the moment changed with the rocket in its place.
      if (phaseAt(flight.current, now) !== 'parked') return;
      if (prev.item?.kind === 'rest' && isExercise(item)) {
        // the end of a rest: "¡pam!", the water is gone, and it springs back upright
        if (reduced) {
          [...el.contents, el.pod].forEach((node) => node.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 200 }));
        } else {
          el.squash.animate(PAM_KEYFRAMES, { duration: FLIGHT.pamMs });
          el.sink.animate(springBackKeyframes(lastSink.current), { duration: SINK.springMs });
          el.pod.animate(POD_BUMP_KEYFRAMES, { duration: 360 });
        }
      } else if (!reduced && sputtersBetween(prev.item, item)) {
        // one warm-up clip to the next: it tries to take off and can't
        el.squash.animate(SPUTTER_KEYFRAMES, { duration: SPUTTER.ms });
        el.flame.animate(SPUTTER_FLAME_KEYFRAMES, { duration: SPUTTER.ms });
        Array.from(el.puffs.children).forEach((puff, i) =>
          (puff as HTMLElement).animate(sputterPuffKeyframes(i ? 14 : -10, i ? 26 : -34), {
            duration: 760,
            delay: i ? 330 : 160,
            easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)',
          }),
        );
      }
      return;
    }
    if (next === flight.current) return;
    flight.current = next;
    playFlight(next, now, reduced, hidden.current, {
      flight: el.flight,
      squash: el.squash,
      flame: el.flame,
      pod: el.pod,
      contents: el.contents,
    });
  }, [cloudKey, ending, queue, currentIndex, reduced, lastSink]);

  return flight;
}

/**
 * The widget is `inert` exactly while the rocket is not parked. One effect owns the timer that
 * hands control back: it runs after every flight and again whenever it mounts (React's dev double
 * mount included), and on coming back to the tab, so the timer can never be lost. (It used to be
 * set by the flight and cleared by another effect's cleanup: the dev double mount cleared it and
 * left the widget inert from the start of the routine until the first rest.)
 */
function useInertWhileAway(root: RefObject<HTMLDivElement | null>, flight: RefObject<Flight>, ...moment: [number, boolean, RoutineItem[], number, boolean]) {
  const [cloudKey, ending, queue, currentIndex, reduced] = moment;
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(timer);
      const now = performance.now();
      node.toggleAttribute('inert', !controlsLiveAt(flight.current, now));
      const at = controlsLiveFrom(flight.current, now);
      if (at !== null) timer = setTimeout(sync, at - now + 16);
    };
    sync();
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // (the moment's parts aren't read here: they are what can start a flight, so it re-syncs after each)
  }, [root, flight, cloudKey, ending, queue, currentIndex, reduced]);
}

/** Puts the whole of a flight on the timeline, from now: leaving (if it does), and coming back (if it does). */
function playFlight(
  f: Flight,
  now: number,
  reduced: boolean,
  podHidden: number,
  el: { flight: HTMLElement; squash: HTMLElement; flame: HTMLElement; pod: HTMLElement; contents: HTMLElement[] },
) {
  // where it is right now, for a fade from mid-flight
  const style = getComputedStyle(el.flight);
  const from = { transform: style.transform === 'none' ? 'none' : style.transform, opacity: Number(style.opacity) };
  const podOpacity = Number(getComputedStyle(el.pod).opacity);
  [el.flight, el.squash, el.flame, el.pod, ...el.contents].forEach((node) => node.getAnimations().forEach((a) => a.cancel()));
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
  const podIn = [{ opacity: 0, transform: `translateY(${-podHidden}px)` }];

  if (leaves) {
    const at = delay(f.leftAt);
    if (f.how === 'takeoff' && !reduced) {
      // the pod goes back into the belly as the rocket gathers itself
      run(el.pod, podRetractKeyframes(podHidden), { duration: POD.outMs, delay: at, fill: 'forwards' });
      run(el.flight, TAKEOFF_KEYFRAMES, { duration: FLIGHT.takeoffMs, delay: at, fill: 'forwards' });
      // full flame from the first push
      run(
        el.flame,
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
      run(
        el.flight,
        [
          { transform: from.transform, opacity: from.opacity },
          { transform: from.transform, opacity: 0 },
        ],
        { duration: FLIGHT.fadeMs, delay: at, fill: 'forwards' },
      );
      if (reduced) run(el.pod, [{ opacity: podOpacity }, { opacity: 0 }], { duration: FLIGHT.fadeMs, delay: at, fill: 'forwards' });
      else run(el.pod, [...podIn, ...podIn], { duration: 1, fill: 'forwards' });
      contentTo([{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });
    }
  }

  if (f.returnAt === null) {
    if (!leaves) {
      run(el.flight, [{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });
      run(el.pod, [...podIn, ...podIn], { duration: 1, fill: 'forwards' });
    }
    return;
  }
  // coming back: while it waits, the leaving animation holds it away; with none, the return's own first frame does
  const fill: FillMode = leaves ? 'forwards' : 'both';
  const at = delay(f.returnAt);
  const parkedAt = at + FLIGHT.returnMs;
  if (reduced) {
    run(el.flight, [{ transform: 'none', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 250, delay: at, fill });
    contentTo([{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: at, fill });
    run(el.pod, [{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: at, fill });
    return;
  }
  run(el.flight, RETURN_KEYFRAMES, { duration: FLIGHT.returnMs, delay: at, fill });
  // the flame burns on the way in and dies as it settles
  run(
    el.flame,
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
  // once it has settled, the pod pops out from under it (held in until then: by its going in, or
  // with none, by this one's first frame; a backward fill here would hide it before it goes in)
  run(el.pod, podPopKeyframes(podHidden), { duration: POD.inMs, delay: parkedAt + POD.inDelayMs, fill });
}

// ---------------------------------------------------------------------------------------------
// The drawing

/** Fins, nozzle, and the body with its rounded nose: white with the ink line (under the water). */
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
      <path d={g.hull} />
    </svg>
  );
}

/** What is drawn over the water: the tail's bands, the seam of the nose section, the edge-on fin. */
function RocketFront({ g }: { g: RocketGeometry }) {
  const { F, T } = ROCKET;
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
      {g.bands.map((x, i) => (
        <path key={x} d={`M${x} ${F} L${x} ${F + T}`} strokeWidth={i === 2 ? ROCKET.STROKE : 1.4} />
      ))}
      <path d={g.edgeFin} strokeWidth={ROCKET.STROKE} />
    </svg>
  );
}

/** The control pod: hung from the belly by a short neck, white with the ink line. */
function Pod({ g, box, children }: { g: RocketGeometry; box: Box; children: React.ReactNode }) {
  const neckTop = ROCKET.F + ROCKET.T - POD_SHAPE.NECK_HIDDEN;
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute border-x-2 border-ink bg-white"
        style={{ left: g.pod.cx - POD_SHAPE.NECK_W / 2, top: neckTop, width: POD_SHAPE.NECK_W, height: box.top - neckTop + 2 }}
      />
      <div
        className="absolute flex items-center justify-between rounded-full border-2 border-ink bg-white px-[2px]"
        style={boxStyle(box)}
      >
        {children}
      </div>
    </>
  );
}

function PodButton({
  rw,
  label,
  onClick,
  disabled = false,
  strong = false,
  children,
}: {
  rw: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  strong?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      data-rw={rw}
      onClick={own(onClick)}
      disabled={disabled}
      aria-label={label}
      className={`pointer-events-auto flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:scale-95 disabled:cursor-default disabled:opacity-30 motion-reduce:active:scale-100 ${
        strong ? 'bg-ink text-white hover:bg-ink/85' : 'text-ink hover:bg-ink/8 disabled:hover:bg-transparent'
      }`}
    >
      {children}
    </button>
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

/** The flame of the flight (and of the warm-up's sputter): hidden unless an animation shows it. */
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

const PuffDrawing = () => (
  <svg viewBox="0 0 26 18" className="block h-full w-full overflow-visible" fill="#fff" stroke={INK} strokeWidth={1.4} strokeLinejoin="round">
    <path d="M5 15 A4.5 4.5 0 0 1 4.5 6.4 A6 6 0 0 1 15.5 4.2 A5 5 0 0 1 22.6 9.6 A3.8 3.8 0 0 1 20.5 15 Z" />
  </svg>
);

const puffBox = (g: RocketGeometry): CSSProperties => ({ left: g.xe - 10, top: g.cy - 9, width: 26, height: 18 });

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
              ...puffBox(g),
              '--rw-dx': `${puff.dx}px`,
              '--rw-dy': `${puff.dy}px`,
              '--rw-puff-delay': `${puff.delay}s`,
              '--rw-puff-s': `${puff.s}s`,
              animationPlayState: paused ? 'paused' : 'running',
            } as CSSProperties
          }
        >
          <PuffDrawing />
        </div>
      ))}
    </>
  );
}

/** Two puffs of gas for the warm-up's sputter: hidden unless the sputter shows them. */
function SputterPuffs({ g, puffsRef }: { g: RocketGeometry; puffsRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={puffsRef} aria-hidden="true" className="pointer-events-none absolute inset-0">
      {[0, 1].map((i) => (
        <div key={i} className="absolute" style={{ ...puffBox(g), opacity: 0 }}>
          <PuffDrawing />
        </div>
      ))}
    </div>
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

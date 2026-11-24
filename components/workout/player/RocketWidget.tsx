'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronUp, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { FlameDrawing, RocketShip, boxStyle, flameBox } from '@/components/workout/RocketShip';
import { BANNER, SHIP, widgetLayout, type ShipGeometry } from '@/components/workout/rocketShape';
import {
  ANTICIPATION_AT,
  FLIGHT,
  FOLD_AT,
  PAM_KEYFRAMES,
  PARKED,
  POD,
  POD_BUMP_KEYFRAMES,
  POD_FOLDED,
  RETURN_KEYFRAMES,
  SETTLE_KEYFRAMES,
  SHAKE,
  SINK,
  SPUTTER,
  SPUTTER_FLAME_KEYFRAMES,
  SPUTTER_KEYFRAMES,
  TAKEOFF_KEYFRAMES,
  UPRIGHT,
  UPRIGHT_AT,
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
import { arrivalDelay } from '@/components/workout/rocketHandoff';
import { playbackUrl, retryWithOriginal } from '@/lib/media';
import type { RoutineItem } from '@/types/workout';
import { SeriesList } from './SeriesList';
import { useRocketWidth, useTapGuard } from './hooks';
import { blocksOf, clock, isExercise, serieState, warmupState } from './model';
import { own } from './ui';

/*
 * Phone: the widget at the bottom IS the rocket (RocketShip: slim, lying on its side, nose to the
 * right), low against the bottom of the screen, and it goes with you through the whole routine.
 * Its body carries only the hilo. Above it, on a short mast, a banner: the name (a tap opens the
 * list), the time left, and Anterior / Pausa / Siguiente ("Descanso", the time and "Saltar" in a
 * rest).
 *
 *   warm-up   between one clip and the next it tries to take off and can't (a cough, a hop with
 *             its nose up, a shake, and it drops back).
 *   last 3 s  before a rest or the end the engine lights: the flame grows each second, more and
 *             more exhaust, and the rocket shakes harder each second; the banner's text too.
 *   rest      it fills with water and gets heavy: it sinks and tilts, tail down, until the tail
 *             dips off the bottom of the screen, bobbing as it goes; the water stays level. The
 *             banner stays put ("Saltar" is always under the finger). When the rest ends,
 *             "¡pam!": the water is gone and it springs back upright with a hard squash.
 *   flights   when a rest begins the banner folds into the body, then the rocket crouches, turns
 *             its nose up and climbs straight out of the top of the screen; only a beat later does
 *             the big rocket of the clouds (the same drawing, bigger) come up from below. Once that
 *             one has gone, a beat, and it comes back from the left and lands with a squash; half a
 *             second later the banner springs out. It arrives when the routine starts and takes
 *             off one last time before the end screen.
 *
 * Where it is comes from `Flight` (rocketFlight.ts), a pure function of the clock: every flight is
 * put on the browser's animation timeline at once (Web Animations with delays, no chained timers),
 * so a skip, a pause, a hidden tab or a jump of the fixture always lands it in a defined pose.
 * Only transform and opacity move. Nothing in it can be pressed until its banner is coming out
 * (`inert`, kept in step with the flight by one effect that owns its timer, see useInertWhileAway).
 */

const INK = '#131313';
const CLOSE_AFTER_MS = 5000;
const TAP_GUARD_MS = 700;

// Water: light enough that the hilo reads on it and on the white body alike.
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

  // ---- size: drawn in screen pixels, from the screen's width (the clouds' rocket uses the same)
  const width = useRocketWidth();
  const L = useMemo(() => widgetLayout(width), [width]);
  const { g } = L;

  const shown = queue[displayIndex];
  const live = displayIndex === currentIndex;
  const shownRest = shown?.kind === 'rest';

  // ---- the rest's weight: it sinks as the water rises (a transform, set once a second)
  const level = shownRest && live && totalItemDuration > 0 ? (totalItemDuration - timeLeft + 1) / totalItemDuration : 0;
  const sink = !reduced && shownRest ? sinkAt(level) : UPRIGHT;
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
  const flight = useRocketFlight({
    els: { flightEl, sinkEl, squashEl, flameEl, puffsEl, podEl, waterEl },
    lastSink,
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
  const hilo = blocks.map((block) => block.series.map((serie) => serieState(serie.queueIndex, displayIndex)));
  const time = clock(live ? timeLeft : 0);
  const ignition = !reduced && live && isExercise(shown) && launchesAfter(queue, displayIndex) ? ignitionLevel(timeLeft) : 0;
  const shaking = ignition > 0 && !isPaused;
  const shake = (amp: number) => ({ '--rw-amp': amp, '--rw-shake-s': `${SHAKE.period[ignition]}s` }) as CSSProperties;
  const preview = talkPreview && shown?.kind === 'rest' ? shown.nextExercise : undefined;
  const toggleList = () => onListOpenChange(!listOpen);
  const showRestTime = shown?.kind === 'rest' && !restCountdown && live;
  const pivot = `${L.pivot.x}px ${L.pivot.y}px`;
  const bannerW = L.banner.right - L.banner.left;
  const name = shown?.kind === 'warmup' ? 'Calentamiento' : shown?.kind === 'workout' ? shown.exercise.title : '';

  return (
    <div
      ref={root}
      data-rw="root"
      onPointerDownCapture={bump}
      onWheelCapture={bump}
      onKeyDownCapture={bump}
      className="pointer-events-none fixed bottom-[max(6px,env(safe-area-inset-bottom))] left-[max(6px,env(safe-area-inset-left))] right-[max(6px,env(safe-area-inset-right))] z-[61] font-[family-name:var(--font-display)] text-ink"
    >
      <div className="relative mx-auto" style={{ width: L.B, height: L.box }}>
        {/* the list, above the banner */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="list"
              initial={reduced ? { opacity: 1 } : { opacity: 0, transform: 'translateY(16px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: 'translateY(16px)' }}
              transition={{ duration: reduced ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto absolute bottom-full mb-2 overflow-hidden rounded-[20px] bg-[rgb(14_14_14/0.84)] text-white"
              style={{ left: L.banner.left, width: bannerW }}
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

        {/* THE ROCKET: flight (where it is) > the banner on its mast (behind the rocket), and
            sink (the rest's weight) > bob > squash (settle, ¡pam!, cough) > shake (ignition) */}
        <div ref={flightEl} className="absolute inset-0" style={{ transformOrigin: `${L.center.x}px ${L.center.y}px` }}>
          <div ref={podEl} data-rw="pod" className="absolute inset-0" style={{ transformOrigin: `${L.fold.x}px ${L.fold.y}px` }}>
            {/* the mast: from behind the banner down into the body */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute border-x-2 border-ink bg-white"
              style={{ left: L.mast.x - BANNER.MAST_W / 2, top: L.mast.top, width: BANNER.MAST_W, height: L.mast.bottom - L.mast.top }}
            />
            <div
              data-rw="banner"
              className="absolute flex items-center gap-0.5 rounded-[18px] border-2 border-ink bg-white pl-3 pr-[3px]"
              style={boxStyle(L.banner)}
            >
              {isExercise(shown) && (
                <>
                  {/* the name (a tap anywhere here opens the list) and the time left */}
                  <div
                    data-bar=""
                    onClick={toggleList}
                    className="pointer-events-auto flex min-w-0 flex-1 cursor-pointer flex-col justify-center self-stretch"
                  >
                    <div className={`flex min-w-0 flex-col ${shaking ? 'rw-jitter' : ''}`} style={shake(SHAKE.text[ignition])}>
                      <button
                        type="button"
                        onClick={own(toggleList)}
                        aria-expanded={open}
                        aria-controls={listId}
                        aria-label={`${name}. ${open ? 'Cerrar la rutina' : 'Ver la rutina'}`}
                        className="flex min-w-0 max-w-full cursor-pointer items-center gap-1 self-start rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        <span data-rw="name" className="min-w-0 truncate text-[15px] font-semibold leading-[18px]">
                          {name}
                        </span>
                        <ChevronUp
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 shrink-0 text-ink/55 transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                        />
                      </button>
                      <span data-rw="time" role="timer" className="text-[28px] font-bold leading-[28px] tabular-nums tracking-[-0.02em]">
                        {time}
                      </span>
                    </div>
                  </div>
                  <BannerButton rw="prev" label="Anterior" onClick={guarded(onPrev)} disabled={!canPrev}>
                    <SkipBack className="h-[19px] w-[19px] fill-current" aria-hidden="true" />
                  </BannerButton>
                  <BannerButton rw="pause" label={isPaused ? 'Reanudar' : 'Pausar'} onClick={() => onTogglePause?.()} strong>
                    {isPaused ? (
                      <Play className="ml-0.5 h-[19px] w-[19px] fill-current" aria-hidden="true" />
                    ) : (
                      <Pause className="h-[19px] w-[19px] fill-current" aria-hidden="true" />
                    )}
                  </BannerButton>
                  <BannerButton rw="next" label="Siguiente" onClick={guarded(onNext)}>
                    <SkipForward className="h-[19px] w-[19px] fill-current" aria-hidden="true" />
                  </BannerButton>
                </>
              )}

              {shown?.kind === 'rest' && (
                <>
                  <div className="flex min-w-0 flex-1 flex-col justify-center">
                    {showRestTime ? (
                      <>
                        <p data-rw="rest" className="truncate text-[15px] font-semibold leading-[18px]">
                          Descanso
                          <span data-rw="later" className="font-medium text-ink/60">
                            {' '}
                            · Luego: {shown.nextExercise.title}
                          </span>
                        </p>
                        <span
                          data-rw="time"
                          role="timer"
                          aria-label={`${time} de descanso`}
                          className="text-[28px] font-bold leading-[28px] tabular-nums tracking-[-0.02em]"
                        >
                          {time}
                        </span>
                      </>
                    ) : (
                      // the giant countdown is on the video: the banner doesn't repeat it
                      <p data-rw="rest" className="truncate text-[20px] font-semibold leading-tight">
                        Descanso
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    data-rw="skip"
                    onClick={own(guarded(onNext))}
                    className="pointer-events-auto flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-ink pl-4 pr-3.5 text-[16px] font-semibold text-white transition-colors duration-150 hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:scale-95 motion-reduce:active:scale-100"
                  >
                    Saltar
                    <SkipForward className="h-[17px] w-[17px] fill-current" aria-hidden="true" />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="absolute" style={{ left: L.ship.left, top: L.ship.top, width: g.W, height: g.H }}>
            <div
              ref={sinkEl}
              data-rw="sink"
              className="absolute inset-0"
              style={{
                transform: sinkTransform(sink),
                transformOrigin: pivot,
                transition: resting && !reduced ? 'transform 1s linear' : 'none',
              }}
            >
              <div
                className={`absolute inset-0 ${shownRest && !reduced ? 'rw-bob' : ''}`}
                style={{ transformOrigin: pivot, animationPlayState: isPaused ? 'paused' : 'running' }}
              >
                <div ref={squashEl} className="absolute inset-0" style={{ transformOrigin: `${(g.x0 + g.tip) / 2}px ${SHIP.F + SHIP.T}px` }}>
                  <div className={`absolute inset-0 ${shaking ? 'rw-shake' : ''}`} style={shake(SHAKE.rocket[ignition])}>
                    <RocketShip
                      g={g}
                      hilo={hilo}
                      className="absolute left-0 top-0"
                      behind={
                        <>
                          <IgnitionFlame g={g} level={ignition} />
                          <FlightFlame g={g} flameRef={flameEl} />
                          <Exhaust g={g} level={ignition} paused={isPaused} />
                          <SputterPuffs g={g} puffsRef={puffsEl} />
                        </>
                      }
                      inside={
                        // (the water is only seen with the rocket parked: the flights hide it)
                        <div ref={waterEl} className="absolute inset-0">
                          {shownRest && <Water key={displayIndex} g={g} level={level} tilt={sink.rz} reduced={reduced} />}
                        </div>
                      }
                    />
                    {/* a tap on the body opens the list too */}
                    {isExercise(shown) && (
                      <div data-bar="" onClick={toggleList} className="pointer-events-auto absolute cursor-pointer" style={{ ...boxStyle(L.body), borderRadius: 6 }} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* the first serie of the coming block, standing on the banner's left end */}
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
            style={{ left: L.banner.left + 10, top: -8 - 106 }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The flight on the animation timeline

interface FlightEls {
  flightEl: RefObject<HTMLDivElement | null>;
  sinkEl: RefObject<HTMLDivElement | null>;
  squashEl: RefObject<HTMLDivElement | null>;
  flameEl: RefObject<HTMLDivElement | null>;
  puffsEl: RefObject<HTMLDivElement | null>;
  podEl: RefObject<HTMLDivElement | null>;
  waterEl: RefObject<HTMLDivElement | null>;
}

function useRocketFlight({
  els,
  lastSink,
  cloudKey,
  ending,
  queue,
  currentIndex,
  reduced,
}: {
  els: FlightEls;
  lastSink: RefObject<Sink>;
  cloudKey: number;
  ending: boolean;
  queue: RoutineItem[];
  currentIndex: number;
  reduced: boolean;
}): RefObject<Flight> {
  const flight = useRef<Flight>(PARKED);
  const seen = useRef<{ cloudKey: number; ending: boolean; queue: RoutineItem[]; item: RoutineItem | undefined } | null>(null);
  const refs = useRef(els);

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
      water: r.waterEl.current,
    };
    if (!el.flight || !el.sink || !el.squash || !el.flame || !el.pod || !el.puffs || !el.water) return;

    let next: Flight;
    // (coming from "Empezar", it arrives once the creator's rocket has gone: see rocketHandoff)
    if (!prev) next = arrival(now + arrivalDelay(now));
    else if (ending && !prev.ending) next = nextFlight(flight.current, 'end', now);
    else if (!ending && cloudKey !== prev.cloudKey && !reduced) next = nextFlight(flight.current, 'clouds', now);
    else if (!ending && (prev.ending || queue !== prev.queue)) next = nextFlight(flight.current, 'show', now);
    else {
      // No flight: the moment changed with the rocket in its place.
      if (phaseAt(flight.current, now) !== 'parked') return;
      if (prev.item?.kind === 'rest' && isExercise(item)) {
        // the end of a rest: "¡pam!", the water is gone, and it springs back upright
        if (reduced) {
          el.pod.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 200 });
        } else {
          el.squash.animate(PAM_KEYFRAMES, { duration: FLIGHT.pamMs });
          el.sink.animate(springBackKeyframes(lastSink.current), { duration: SINK.springMs });
          el.pod.animate(POD_BUMP_KEYFRAMES, { duration: 380 });
        }
      } else if (!reduced && sputtersBetween(prev.item, item)) {
        // one warm-up clip to the next: it tries to take off and can't
        el.squash.animate(SPUTTER_KEYFRAMES, { duration: SPUTTER.ms });
        el.flame.animate(SPUTTER_FLAME_KEYFRAMES, { duration: SPUTTER.ms });
        Array.from(el.puffs.children).forEach((puff, i) =>
          (puff as HTMLElement).animate(sputterPuffKeyframes(i ? -30 : -18, i ? 16 : -20), {
            duration: 820,
            delay: i ? 300 : 120,
            easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)',
          }),
        );
      }
      return;
    }
    if (next === flight.current) return;
    flight.current = next;
    playFlight(next, now, reduced, { flight: el.flight, squash: el.squash, flame: el.flame, pod: el.pod, water: el.water });
  }, [cloudKey, ending, queue, currentIndex, reduced, lastSink]);

  return flight;
}

/**
 * The widget is `inert` exactly while its controls can't be used (see controlsLiveAt). One effect
 * owns the timer that hands control back: it runs after every flight and again whenever it mounts
 * (React's dev double mount included), and on coming back to the tab, so the timer can never be
 * lost. (It used to be set by the flight and cleared by another effect's cleanup: the dev double
 * mount cleared it and left the widget inert from the start of the routine until the first rest.)
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
  el: { flight: HTMLElement; squash: HTMLElement; flame: HTMLElement; pod: HTMLElement; water: HTMLElement },
) {
  // where it is right now, for a fade from mid-flight
  const style = getComputedStyle(el.flight);
  const from = { transform: style.transform === 'none' ? 'none' : style.transform, opacity: Number(style.opacity) };
  const podOpacity = Number(getComputedStyle(el.pod).opacity);
  [el.flight, el.squash, el.flame, el.pod, el.water].forEach((node) => node.getAnimations().forEach((a) => a.cancel()));
  if (f.leftAt === null) return;

  const leaves = Number.isFinite(f.leftAt);
  const delay = (t: number) => t - now;
  // Anchored to the clock: a page in the background doesn't start its animations until it is
  // shown again, which would push the whole flight late. With its start time set, it is wherever
  // it should be by now the moment the page is seen.
  const run = (node: HTMLElement, keys: Keyframe[], options: KeyframeAnimationOptions) => {
    node.animate(keys, options).startTime = now;
  };
  const podIn = [{ opacity: 0, transform: POD_FOLDED }];
  // The water of a rest is only seen with the rocket parked: the rest begins as it takes off, and
  // a rocket flying nose up with water along its side would read wrong. It shows again once landed.
  const dry = [{ opacity: 0 }, { opacity: 0 }];

  if (leaves) {
    const at = delay(f.leftAt);
    run(el.water, dry, { duration: 1, delay: at, fill: 'forwards' });
    if (f.how === 'takeoff' && !reduced) {
      // the banner folds into the body first; then the rocket crouches, turns its nose up and climbs
      run(el.pod, podRetractKeyframes(), { duration: POD.outMs, delay: at, fill: 'forwards' });
      run(el.flight, TAKEOFF_KEYFRAMES, { duration: FLIGHT.takeoffMs, delay: at, fill: 'forwards' });
      run(
        el.flame,
        [
          { opacity: 0, transform: 'scale(0.3, 0.7)' },
          { opacity: 1, transform: 'scale(0.45, 0.85)', offset: FOLD_AT },
          { opacity: 1, transform: 'scale(0.75, 0.95)', offset: ANTICIPATION_AT },
          { opacity: 1, transform: 'scale(1.15, 1.05)', offset: UPRIGHT_AT },
          { opacity: 1, transform: 'scale(1.35, 1.08)' },
        ],
        { duration: FLIGHT.takeoffMs, delay: at, fill: 'forwards' },
      );
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
  run(el.water, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: parkedAt, fill });
  if (reduced) {
    run(el.flight, [{ transform: 'none', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 250, delay: at, fill });
    run(el.pod, [{ transform: 'none', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 250, delay: parkedAt + POD.inDelayMs, fill });
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
  // half a second after it has landed, the banner springs out of the body (held in until then: by
  // its folding in, or with none, by this one's first frame)
  run(el.pod, podPopKeyframes(), { duration: POD.inMs, delay: parkedAt + POD.inDelayMs, fill });
}

// ---------------------------------------------------------------------------------------------
// The banner's buttons

function BannerButton({
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

// ---------------------------------------------------------------------------------------------
// Flames, exhaust and water (behind and inside the drawing)

/** The flame of the flight (and of the warm-up's cough): hidden unless an animation shows it. */
function FlightFlame({ g, flameRef }: { g: ShipGeometry; flameRef: RefObject<HTMLDivElement | null> }) {
  return (
    <div ref={flameRef} aria-hidden="true" className="pointer-events-none absolute" style={{ ...flameBox(g), opacity: 0 }}>
      <FlameDrawing />
    </div>
  );
}

// Each step of the ignition: flame length and thickness.
const IGNITION = [
  { sx: 0, sy: 0.5 },
  { sx: 0.32, sy: 0.7 },
  { sx: 0.58, sy: 0.86 },
  { sx: 0.88, sy: 1 },
] as const;
// Exhaust: puffs born in the nozzle that billow out behind the tail, up and down; one more pair each second.
const PUFFS = [
  { dx: -24, dy: -18, delay: 0, s: 1.05 },
  { dx: -20, dy: 18, delay: 0.4, s: 1.1 },
  { dx: -38, dy: -26, delay: 0.2, s: 1.15 },
  { dx: -34, dy: 10, delay: 0.65, s: 0.95 },
  { dx: -46, dy: -8, delay: 0.5, s: 1.2 },
  { dx: -28, dy: 28, delay: 0.85, s: 1 },
] as const;

/** The engine lighting up in the last 3 s: the flame grows each second (behind the nozzle)... */
function IgnitionFlame({ g, level }: { g: ShipGeometry; level: 0 | 1 | 2 | 3 }) {
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
  <svg viewBox="0 0 26 18" className="block h-full w-full overflow-visible" fill="#fff" stroke={INK} strokeWidth={1.6} strokeLinejoin="round">
    <path d="M5 15 A4.5 4.5 0 0 1 4.5 6.4 A6 6 0 0 1 15.5 4.2 A5 5 0 0 1 22.6 9.6 A3.8 3.8 0 0 1 20.5 15 Z" />
  </svg>
);

const puffBox = (g: ShipGeometry): CSSProperties => ({ left: g.xe - 9, top: g.cy - 6.5, width: 19, height: 13 });

/** ...with more and more exhaust round the tail. */
function Exhaust({ g, level, paused }: { g: ShipGeometry; level: 0 | 1 | 2 | 3; paused: boolean }) {
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

/** Two puffs of gas for the warm-up's cough: hidden unless the cough shows them. */
function SputterPuffs({ g, puffsRef }: { g: ShipGeometry; puffsRef: RefObject<HTMLDivElement | null> }) {
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

// Bubbles: where they rise (fraction of the body's length), size, and timing.
const BUBBLES = [
  { x: 0.12, r: 1.75, s: 2.2, delay: 0 },
  { x: 0.3, r: 1.5, s: 2.7, delay: 1.1 },
  { x: 0.48, r: 2, s: 2, delay: 0.5 },
  { x: 0.66, r: 1.5, s: 2.9, delay: 1.7 },
  { x: 0.8, r: 1.75, s: 2.4, delay: 0.8 },
] as const;
const WAVE_PERIOD = 28;
// the water reaches this far past the body's ends and below it, so it still fills it when it turns
const SPILL = 40;

/**
 * The rest fills the whole silhouette (body and nose) with water from the bottom up. Two wave
 * layers slide at different speeds, a few bubbles rise, the surface calms near the top, and it
 * stays level as the rocket tilts (it turns the other way). Only transforms move: the level and
 * the tilt (once a second), the waves (sideways) and the bubbles.
 */
function Water({ g, level, tilt, reduced }: { g: ShipGeometry; level: number; tilt: number; reduced: boolean }) {
  const { F, T } = SHIP;
  const l = Math.min(1, Math.max(0, level));
  const calm = l < 0.7 ? 1 : Math.max(0.2, (1 - l) / 0.3);
  const length = g.tip - g.x0;
  const width = length + 2 * SPILL;
  const strip = Math.ceil(width / WAVE_PERIOD + 1) * WAVE_PERIOD * 2;
  const run = Array.from({ length: strip / WAVE_PERIOD }, () => `q${WAVE_PERIOD / 4} -4 ${WAVE_PERIOD / 2} 0 t${WAVE_PERIOD / 2} 0`).join(' ');
  const move = reduced ? 'none' : 'transform 1s linear';
  const wave = (cls: string, base: number, fill: string, line?: string) => (
    <div className="absolute left-0 overflow-hidden" style={{ top: -7, height: 8, width: strip, transformOrigin: '50% 100%', transform: `scaleY(${calm})`, transition: move }}>
      <svg width={strip} height={8} viewBox={`0 0 ${strip} 8`} className={`block ${reduced ? '' : cls}`}>
        <path d={`M0 ${base} ${run} V8 H0 Z`} fill={fill} />
        {line && <path d={`M0 ${base} ${run}`} fill="none" stroke={line} strokeWidth={1.25} />}
      </svg>
    </div>
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ clipPath: `path('${g.inside}')` }}>
      <div className="absolute inset-0" style={{ transform: `rotate(${-tilt}deg)`, transformOrigin: `${(g.x0 + g.tip) / 2}px ${g.cy}px`, transition: move }}>
        <div
          data-rw="water"
          className="absolute"
          style={{ left: g.x0 - SPILL, top: F, width, height: T + SPILL, transform: `translateY(${((1 - l) * T).toFixed(2)}px)`, transition: move }}
        >
          <div className="absolute left-0" style={{ top: -2, width: strip }}>
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
                    left: SPILL + b.x * length,
                    top: T - 2 * b.r - 3,
                    width: 2 * b.r,
                    height: 2 * b.r,
                    borderColor: WATER.line,
                    '--rw-rise': `${-(T - 8)}px`,
                    '--rw-bubble-s': `${b.s}s`,
                    '--rw-bubble-delay': `${b.delay}s`,
                  } as CSSProperties
                }
              />
            ))}
        </div>
      </div>
    </div>
  );
}

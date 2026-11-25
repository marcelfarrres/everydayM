'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronUp, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { FlameDrawing, RocketShip, boxStyle, flameBox, type Piece } from '@/components/workout/RocketShip';
import { dropBetween, rocketStack } from '@/components/workout/rocketStack';
import { BANNER, SHIP, stackGeometry, widgetLayout, type ShipGeometry, type Stack, type WidgetLayout } from '@/components/workout/rocketShape';
import {
  CLOUD_LEAVE_MS,
  FLIGHT,
  PAM_KEYFRAMES,
  PARKED,
  PRELAUNCH,
  PRELAUNCH_KEYFRAMES,
  POD,
  POD_BUMP_KEYFRAMES,
  POD_FOLDED,
  RETURN_KEYFRAMES,
  SETTLE_KEYFRAMES,
  SHAKE,
  SPUTTER,
  SPUTTER_FLAME_KEYFRAMES,
  SPUTTER_KEYFRAMES,
  STANDS,
  UPRIGHT_AT,
  arrival,
  cloudFlameKeyframes,
  cloudKeyframes,
  controlsLiveAt,
  controlsLiveFrom,
  engineShake,
  ignitionLevel,
  launchesAfter,
  nextFlight,
  phaseAt,
  podPopKeyframes,
  railLeft,
  parkedFrom,
  podRetractKeyframes,
  springBackKeyframes,
  sputterPuffKeyframes,
  sputtersBetween,
  warningFlame,
  warningLevel,
  takeoffKeyframes,
  type CloudSpot,
  type Flight,
} from '@/components/workout/rocketFlight';
import { arrivalDelay } from '@/components/workout/rocketHandoff';
import type { RoutineItem } from '@/types/workout';
import { RepairCrew } from './RepairCrew';
import { SeriesList } from './SeriesList';
import { useLagged, useRocketWidth, useTapGuard } from './hooks';
import { blocksOf, clock, isExercise, serieState, warmupState, type StepState } from './model';
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
 *   last 1 s  it pulls back towards its tail and compresses, more and more, and its banner folds
 *             in; at 0 it shoots off from that crouch ("Siguiente" before that: a quick crouch).
 *   rest      it is "being repaired" (RepairCrew): two mechanics set it on stands and work on it,
 *             and run off just before the end. The banner stays put ("Saltar" is always under the
 *             finger). When the rest ends, "¡pam!": it drops into its place with a hard squash.
 *   flights   when a rest begins (from that crouch) it turns
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

// the blue of the rests (the warning flame, the mechanics' caps)
const REST_BLUE = '#2f6bff';

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
  clockTab,
  cloudTop,
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
  /** the rest's clock is a tab on the banner (a rest with talks): the banner doesn't repeat it */
  clockTab: boolean;
  /** where its nose stands in the clouds, % of the screen's height (railTop) */
  cloudTop: number;
  reduced: boolean;
}) {
  const listId = useId();
  const item = queue[currentIndex];
  const ending = item?.kind === 'outro';
  const resting = item?.kind === 'rest';

  // ---- size: drawn in screen pixels, from the screen's width (the clouds' rocket uses the same)
  const width = useRocketWidth();
  // The rocket's stage: a segment per block still to finish, and the boosters while the warm-up
  // lasts. What is drawn changes in the clouds, when a part comes off (after the rocket has stood
  // there a moment); where it stands, centred, changes only once it is away, before it comes back.
  const entering = item?.kind === 'rest' && !reduced;
  const drawnAt = useLagged(currentIndex, entering ? FLIGHT.dropMs : 0);
  const centredAt = useLagged(currentIndex, entering ? FLIGHT.returnStartMs : 0);
  const drawn = useMemo(() => rocketStack(queue, drawnAt), [queue, drawnAt]);
  const centred = useMemo(() => rocketStack(queue, centredAt), [queue, centredAt]);
  const L = useMemo(() => widgetLayout(width, centred), [width, centred]);
  const g = useMemo(() => stackGeometry({ width: L.frame, ...drawn }), [L.frame, drawn]);

  // a part that has just come off falls away, turning slowly (in the clouds)
  const [shownStack, setShownStack] = useState<Stack>(drawn);
  const [falling, setFalling] = useState<{ key: number; g: ShipGeometry; piece: Piece; x: number } | null>(null);
  if (shownStack !== drawn) {
    const off = dropBetween(shownStack, drawn);
    if (off && entering) {
      const before = stackGeometry({ width: L.frame, ...shownStack });
      setFalling({
        key: (falling?.key ?? 0) + 1,
        g: before,
        piece: off === 'segment' ? `seg-${shownStack.first}` : 'boosters',
        x: off === 'segment' ? before.segments[0].end : (before.boosters?.x0 ?? before.x0),
      });
    }
    setShownStack(drawn);
  }

  const shown = queue[displayIndex];
  const live = displayIndex === currentIndex;
  const shownRest = shown?.kind === 'rest';

  // ---- the rest's repair crew: it stays a moment after the rest has ended early, to run off
  const restHere = shownRest && live ? displayIndex : -1;
  const crewAt = useLagged(restHere, restHere >= 0 ? 0 : 350);
  const crewRest = queue[crewAt];
  const crewOn = crewAt >= 0 && crewRest?.kind === 'rest';

  // ---- the flight
  const root = useRef<HTMLDivElement>(null);
  const flightEl = useRef<HTMLDivElement>(null);
  const liftEl = useRef<HTMLDivElement>(null);
  const squashEl = useRef<HTMLDivElement>(null);
  const flameEl = useRef<HTMLDivElement>(null);
  const puffsEl = useRef<HTMLDivElement>(null);
  const podEl = useRef<HTMLDivElement>(null);
  const sparkleEl = useRef<HTMLDivElement>(null);
  const flight = useRocketFlight({
    els: { flightEl, liftEl, squashEl, flameEl, puffsEl, podEl, sparkleEl },
    spotOf: () => cloudSpot(root.current, L, cloudTop),
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
  // From 10 s left (before a takeoff) a small blue flame and a soft tremble, growing; from 3 s the
  // red ignition and the hard shake take over: one build-up.
  const launching = !reduced && live && isExercise(shown) && launchesAfter(queue, displayIndex);
  const ignition = launching ? ignitionLevel(timeLeft) : 0;
  const warning = launching ? warningLevel(timeLeft) : 0;
  const warned = launching && timeLeft <= FLIGHT.warningS && ignition === 0;
  const engine = launching ? engineShake(timeLeft) : { amp: 0, period: SHAKE.period[0] };
  const shaking = engine.amp > 0 && !isPaused;
  const shake = (amp: number) => ({ '--rw-amp': amp, '--rw-shake-s': `${engine.period}s` }) as CSSProperties;
  const toggleList = () => onListOpenChange(!listOpen);
  const showRestTime = shown?.kind === 'rest' && !restCountdown && !clockTab && live;
  // the last second before a takeoff: it crouches, more and more, and its banner folds in
  const crouching = launching && timeLeft <= PRELAUNCH.leadS && timeLeft > 0;
  usePrelaunch(crouching, displayIndex, isPaused, flightEl, podEl);

  // where the crew enters and leaves: the screen's edges, in the rocket's own px
  const shipLeft = 6 + (width - L.B) / 2 + L.ship.left + L.ship.shift;
  const view = { left: -shipLeft, right: width + 12 - shipLeft };
  // when the crew starts (the rocket parked) and how long until the rest ends from then
  const crewTiming = () => {
    const f = flight.current;
    const now = performance.now();
    const parked = Number.isFinite(parkedFrom(f)) ? Math.max(now, parkedFrom(f)) : now;
    // From when it began, if the clock agrees (no pause since); otherwise from the clock's
    // whole seconds, erring early (they must be gone by the "¡pam!").
    const byClock = now + timeLeft * 1000;
    const fromLeaving = f.how === 'clouds' && f.leftAt !== null && Number.isFinite(f.leftAt) ? f.leftAt + totalItemDuration * 1000 : NaN;
    const end = fromLeaving <= byClock && fromLeaving > byClock - 1000 ? fromLeaving : byClock - 1000;
    return { startAt: parked, parkedMs: end - parked };
  };
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
                    <div className={`flex min-w-0 flex-col ${shaking && ignition > 0 ? 'rw-jitter' : ''}`} style={shake(SHAKE.text[ignition])}>
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
                    {clockTab && !restCountdown ? (
                      // (the clock is the tab at its corner)
                      <p data-rw="rest" className="text-[15px] font-semibold leading-[18px]">
                        Descanso
                        <span data-rw="later" className="block truncate font-medium text-ink/60">
                          Luego: {shown.nextExercise.title}
                        </span>
                      </p>
                    ) : showRestTime ? (
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

          {/* (what is left of the rocket stands centred: its drawing moves by the missing half) */}
          <div className="absolute" style={{ left: L.ship.left, top: L.ship.top, width: g.W, height: g.H, transform: `translateX(${L.ship.shift}px)` }}>
            {/* the lift: on the stands of a rest (and its jolts) */}
            <div ref={liftEl} data-rw="lift" className="absolute inset-0" style={{ transformOrigin: `${(g.x0 + g.tip) / 2}px ${SHIP.F + SHIP.T}px` }}>
              <div className="absolute inset-0">
                {falling && <FallingPiece key={falling.key} g={falling.g} piece={falling.piece} x={falling.x} hilo={hilo} onDone={() => setFalling(null)} />}
                <div ref={squashEl} className="absolute inset-0" style={{ transformOrigin: `${(g.x0 + g.tip) / 2}px ${SHIP.F + SHIP.T}px` }}>
                  <div className={`absolute inset-0 ${shaking ? 'rw-shake' : ''}`} style={shake(engine.amp)}>
                    <RocketShip
                      g={g}
                      hilo={hilo}
                      className="absolute left-0 top-0"
                      behind={
                        <>
                          <WarningFlame g={g} level={warning} on={warned} />
                          <IgnitionFlame g={g} level={ignition} />
                          <FlightFlame g={g} flameRef={flameEl} />
                          <Exhaust g={g} level={ignition} paused={isPaused} />
                          <SputterPuffs g={g} puffsRef={puffsEl} />
                        </>
                      }
                    />
                    {/* a tap on the body opens the list too */}
                    {isExercise(shown) && (
                      <div
                        data-bar=""
                        onClick={toggleList}
                        className="pointer-events-auto absolute cursor-pointer"
                        style={{ ...boxStyle({ left: g.x0, right: g.tip, top: SHIP.F, bottom: SHIP.F + SHIP.T }), borderRadius: 6 }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
            {crewOn && (
              <RepairCrew
                // (its places are taken once it is on: anew if the rocket changes in the clouds)
                key={`${crewAt}:${g.first}:${g.boosters ? 1 : 0}:${L.ship.shift}`}
                g={g}
                timing={crewTiming}
                calm={crewRest.talks.length > 0}
                paused={isPaused}
                reduced={reduced}
                bail={crewAt !== restHere}
                view={view}
                liftRef={liftEl}
              />
            )}
            {/* "listo": a sparkle on the nose as it drops into its place */}
            <div ref={sparkleEl} aria-hidden="true" className="pointer-events-none absolute" style={{ left: g.tip - 22, top: SHIP.F - 14, width: 16, height: 16, opacity: 0 }}>
              <svg viewBox="-8 -8 16 16" className="block h-full w-full overflow-visible" fill="#fff" stroke={INK} strokeWidth={1.3} strokeLinejoin="round">
                <path d="M0 -8 L1.8 -1.8 L8 0 L1.8 1.8 L0 8 L-1.8 1.8 L-8 0 L-1.8 -1.8 Z" />
              </svg>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The flight on the animation timeline

interface FlightEls {
  flightEl: RefObject<HTMLDivElement | null>;
  liftEl: RefObject<HTMLDivElement | null>;
  squashEl: RefObject<HTMLDivElement | null>;
  flameEl: RefObject<HTMLDivElement | null>;
  puffsEl: RefObject<HTMLDivElement | null>;
  podEl: RefObject<HTMLDivElement | null>;
  sparkleEl: RefObject<HTMLDivElement | null>;
}

/** The crouch of the last second and its banner folding in, as the animations' ids. */
const CROUCH_ID = 'rw-crouch';
const FOLD_ID = 'rw-crouch-fold';
const prelaunchOf = (...nodes: (HTMLElement | null)[]) =>
  nodes.flatMap((node) => node?.getAnimations().filter((a) => a.id === CROUCH_ID || a.id === FOLD_ID) ?? []);

/**
 * The last second of a serie before a takeoff: the rocket crouches (over the second that is left,
 * paused with the routine) and its banner folds in for the last third of it. The takeoff then goes
 * from there: the flight (whose effect runs first) reads how far it got and takes over. If no
 * takeoff came (a rewind, "Anterior"), it stands up again.
 */
function usePrelaunch(on: boolean, at: number, paused: boolean, flightEl: RefObject<HTMLDivElement | null>, podEl: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const node = flightEl.current;
    const banner = podEl.current;
    if (!node || !banner) return;
    if (!on) {
      prelaunchOf(node, banner).forEach((a) => a.cancel());
      return;
    }
    if (prelaunchOf(node).length) return;
    const ms = PRELAUNCH.leadS * 1000;
    node.animate(PRELAUNCH_KEYFRAMES, { id: CROUCH_ID, duration: ms, fill: 'forwards' });
    banner.animate(podRetractKeyframes(), { id: FOLD_ID, duration: POD.outMs, delay: ms - PRELAUNCH.foldLeadS * 1000, fill: 'forwards' });
  }, [on, at, flightEl, podEl]);
  useLayoutEffect(() => {
    prelaunchOf(flightEl.current, podEl.current).forEach((a) => {
      if (a.playState === 'finished') return;
      if (paused) a.pause();
      else a.play();
    });
  }, [paused, on, flightEl, podEl]);
}

function useRocketFlight({
  els,
  spotOf,
  cloudKey,
  ending,
  queue,
  currentIndex,
  reduced,
}: {
  els: FlightEls;
  /** its place in the clouds, measured now */
  spotOf: () => CloudSpot;
  cloudKey: number;
  ending: boolean;
  queue: RoutineItem[];
  currentIndex: number;
  reduced: boolean;
}): RefObject<Flight> {
  const flight = useRef<Flight>(PARKED);
  const seen = useRef<{ cloudKey: number; ending: boolean; queue: RoutineItem[]; item: RoutineItem | undefined } | null>(null);
  const refs = useRef(els);
  const spot = useRef(spotOf);
  useLayoutEffect(() => {
    spot.current = spotOf;
  });

  useLayoutEffect(() => {
    const now = performance.now();
    const prev = seen.current;
    const item = queue[currentIndex];
    seen.current = { cloudKey, ending, queue, item };
    const r = refs.current;
    const el = {
      flight: r.flightEl.current,
      lift: r.liftEl.current,
      squash: r.squashEl.current,
      flame: r.flameEl.current,
      puffs: r.puffsEl.current,
      pod: r.podEl.current,
      sparkle: r.sparkleEl.current,
    };
    if (!el.flight || !el.lift || !el.squash || !el.flame || !el.pod || !el.puffs || !el.sparkle) return;

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
        // the end of a rest: "¡pam!", it drops off its stands into its place, and it is ready
        if (reduced) {
          el.pod.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 200 });
        } else {
          const lifted = getComputedStyle(el.lift).transform;
          const y = lifted === 'none' ? 0 : new DOMMatrix(lifted).m42;
          el.lift.getAnimations().forEach((a) => a.cancel());
          el.squash.animate(PAM_KEYFRAMES, { duration: FLIGHT.pamMs });
          if (y < -0.5) el.lift.animate(springBackKeyframes({ y, rz: 0 }), { duration: STANDS.springMs });
          el.pod.animate(POD_BUMP_KEYFRAMES, { duration: 380 });
          el.sparkle.animate(
            [
              { opacity: 0, transform: 'scale(0.2) rotate(0deg)' },
              { opacity: 1, transform: 'scale(1.25) rotate(45deg)', offset: 0.35 },
              { opacity: 1, transform: 'scale(0.9) rotate(70deg)', offset: 0.6 },
              { opacity: 0, transform: 'scale(0.4) rotate(90deg)' },
            ],
            { duration: 620, delay: 120, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)', fill: 'backwards' },
          );
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
    // from the crouch of its last second, if it got that far (otherwise a quick one first)
    const c = el.flight.getAnimations().find((a) => a.id === CROUCH_ID);
    const crouched = c ? c.playState === 'finished' || (c.effect?.getComputedTiming().progress ?? 0) > 0.25 : false;
    playFlight(next, now, reduced, crouched, { flight: el.flight, lift: el.lift, squash: el.squash, flame: el.flame, pod: el.pod }, () => spot.current());
  }, [cloudKey, ending, queue, currentIndex, reduced]);

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
  crouched: boolean,
  el: { flight: HTMLElement; lift: HTMLElement; squash: HTMLElement; flame: HTMLElement; pod: HTMLElement },
  spotOf: () => CloudSpot,
) {
  // where it is right now, for a fade from mid-flight
  const style = getComputedStyle(el.flight);
  const from = { transform: style.transform === 'none' ? 'none' : style.transform, opacity: Number(style.opacity) };
  const podOpacity = Number(getComputedStyle(el.pod).opacity);
  // (a banner already folded in by the last second stays folded)
  const folded = crouched && podOpacity < 0.5;
  [el.flight, el.lift, el.squash, el.flame, el.pod].forEach((node) => node.getAnimations().forEach((a) => a.cancel()));
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
  // the banner folds in as it goes (quickly, with the quick crouch), unless it already has
  const foldIn = (at: number) =>
    folded
      ? run(el.pod, [...podIn, ...podIn], { duration: 1, fill: 'forwards' })
      : run(el.pod, podRetractKeyframes(), { duration: PRELAUNCH.quickMs, delay: at, fill: 'forwards' });

  if (leaves) {
    const at = delay(f.leftAt);
    if (f.how === 'clouds' && !reduced) {
      // into the clouds, straight from its crouch, waits there, and takes off once from there
      if (!f.placed) foldIn(at);
      else run(el.pod, [...podIn, ...podIn], { duration: 1, fill: 'forwards' });
      run(el.flight, cloudKeyframes(spotOf(), f.placed, crouched), { duration: CLOUD_LEAVE_MS, delay: at, fill: 'forwards' });
      run(el.flame, cloudFlameKeyframes(f.placed, crouched), { duration: CLOUD_LEAVE_MS, delay: at, fill: 'forwards' });
    } else if (f.how === 'takeoff' && !reduced) {
      // from its crouch it turns its nose up and climbs straight out of the top
      foldIn(at);
      const quick = crouched ? 0 : PRELAUNCH.quickMs / FLIGHT.takeoffMs;
      run(el.flight, takeoffKeyframes(crouched), { duration: FLIGHT.takeoffMs, delay: at, fill: 'forwards' });
      run(
        el.flame,
        [
          { opacity: crouched ? 1 : 0, transform: crouched ? 'scale(0.8, 1)' : 'scale(0.3, 0.7)' },
          ...(quick ? [{ opacity: 1, transform: 'scale(0.7, 0.95)', offset: quick }] : []),
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
// Flames and exhaust (behind the drawing)

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

/** From 10 s left: a small blue flame (the blue of the rest), growing until the ignition takes over. */
function WarningFlame({ g, level, on }: { g: ShipGeometry; level: number; on: boolean }) {
  const step = warningFlame(level);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute transition-[transform,opacity] duration-[450ms] ease-out"
      style={{ ...flameBox(g), opacity: on ? 1 : 0, transform: `scale(${step.sx}, ${step.sy})` }}
    >
      <FlameDrawing color={REST_BLUE} />
    </div>
  );
}

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

/**
 * Its place in the clouds, from where it is parked: the nose on the rail of the routine (`top` %
 * of the screen's height) by the words, nose up, as big as the clouds' rocket always was (about
 * half the screen's height). Measured from the widget's own box, so safe areas count.
 */
function cloudSpot(root: HTMLElement | null, L: WidgetLayout, top: number): CloudSpot {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const k = Math.min(0.52 * vh, 544) / L.g.W;
  const rect = root?.getBoundingClientRect() ?? { left: 6, top: vh - 6 - L.box, width: vw - 12 };
  const parked = { x: rect.left + (rect.width - L.B) / 2 + L.center.x, y: rect.top + L.center.y };
  const half = ((L.g.tip - L.g.xe) / 2) * k;
  return {
    dx: Math.round(railLeft(vw) * vw - parked.x),
    dy: Math.round((top / 100) * vh + half - parked.y),
    k: Math.round(k * 1000) / 1000,
  };
}

/**
 * A part that has just come off (a block's segment, or the boosters after the warm-up): a puff of
 * smoke at the joint, and it falls away from the rocket, turning slowly, out of the screen. (In
 * the clouds the rocket stands on its tail, so falling is towards its tail.)
 */
function FallingPiece({ g, piece, x, hilo, onDone }: { g: ShipGeometry; piece: Piece; x: number; hilo: StepState[][]; onDone: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  const puffs = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    const fall = node.animate(
      [
        { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(0.3, 0, 0.6, 0.4)' },
        { transform: 'translate(-8px, 2px) rotate(-1.5deg)', opacity: 1, offset: 0.14, easing: 'cubic-bezier(0.45, 0, 0.9, 0.6)' },
        { transform: 'translate(-760px, 40px) rotate(-24deg)', opacity: 1, offset: 0.96 },
        { transform: 'translate(-800px, 42px) rotate(-25deg)', opacity: 0 },
      ],
      { duration: FLIGHT.dropFallMs, fill: 'forwards' },
    );
    fall.onfinish = onDone;
    Array.from(puffs.current?.children ?? []).forEach((puff, i) =>
      (puff as HTMLElement).animate(sputterPuffKeyframes(i ? -14 : 6, i ? 16 : -18), { duration: 900, delay: i * 120, easing: 'cubic-bezier(0.2, 0.6, 0.4, 1)', fill: 'both' }),
    );
    return () => fall.cancel();
    // (once, as it comes off)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const box = piece === 'boosters' ? { a: g.boosters?.x0 ?? g.x0, b: g.boosters?.x1 ?? g.x0 } : { a: g.segments[0].start, b: g.segments[0].end };
  return (
    <>
      <div ref={el} className="pointer-events-none absolute inset-0" style={{ transformOrigin: `${(box.a + box.b) / 2}px ${g.cy}px` }}>
        <RocketShip g={g} only={[piece]} hilo={hilo} className="absolute left-0 top-0" />
      </div>
      <div ref={puffs} aria-hidden="true" className="pointer-events-none absolute inset-0">
        {[0, 1].map((i) => (
          <div key={i} className="absolute" style={{ left: x - 10, top: g.cy - 7 + (i ? 6 : -6), width: 20, height: 14, opacity: 0 }}>
            <PuffDrawing />
          </div>
        ))}
      </div>
    </>
  );
}

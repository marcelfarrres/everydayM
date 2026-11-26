'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronUp, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import { FlameDrawing, RocketShip, boxStyle, flameBox, type Piece } from '@/components/workout/RocketShip';
import { dropBetween, rocketStack } from '@/components/workout/rocketStack';
import {
  PANEL,
  SHIP,
  lookTransform,
  nameLineHeight,
  panelLayout,
  panelRise,
  stackGeometry,
  widgetLayout,
  type LookPair,
  type LookPart,
  type ShipGeometry,
  type Stack,
  type WidgetLayout,
} from '@/components/workout/rocketShape';
import {
  CLOUD_LEAVE_MS,
  DOCK,
  FLIGHT,
  PAM_KEYFRAMES,
  PANELS_IN_MS,
  PARKED,
  PRELAUNCH,
  PRELAUNCH_KEYFRAMES,
  RETURN_KEYFRAMES,
  SEPARATION,
  SETTLE_KEYFRAMES,
  SHAKE,
  SPUTTER,
  SPUTTER_FLAME_KEYFRAMES,
  SPUTTER_KEYFRAMES,
  STANDS,
  UPRIGHT_AT,
  arrival,
  cloudDriftPx,
  cloudFlameKeyframes,
  cloudKeyframes,
  compressTiming,
  controlsLiveAt,
  controlsLiveFrom,
  engineShake,
  ignitionLevel,
  launchesAfter,
  nextFlight,
  phaseAt,
  prelaunchCompress,
  railLeft,
  parkedFrom,
  springBackKeyframes,
  stretchFrom,
  sputterPuffKeyframes,
  sputtersBetween,
  warningFlame,
  warningLevel,
  blockEnds,
  cloudExtraMs,
  launchLeadMs,
  takeoffKeyframes,
  type CloudSpot,
  type LaunchStart,
  type Flight,
  holdsOnlyParked,
} from '@/components/workout/rocketFlight';
import { useCloudMoment, useCloudPainter } from '@/components/workout/cloudClock';
import { finsAt, finsPending } from '@/components/workout/separation';
import { arrivalDelay } from '@/components/workout/rocketHandoff';
import { flightSounds, type FlightSounds } from '@/components/workout/rocketSounds';
import { playSfx, startSfxLoop, type SfxLoopStop } from '@/lib/audio/sfx';
import { sfxCue } from '@/lib/audio/sfxCue';
import type { RoutineItem } from '@/types/workout';
import { MECHANIC } from './Mechanic';
import { RepairCrew } from './RepairCrew';
import { Separation, type SeparationScene } from './Separation';
import { SeriesList } from './SeriesList';
import { useLagged, useRocketWidth, useTapGuard } from './hooks';
import { setPanelRise } from './panelRise';
import { hyphenateEs } from '@/lib/hyphenate';
import { blocksOf, clock, isExercise, serieState, warmupState, type StepState } from './model';
import { own } from './ui';

/*
 * Phone: the widget at the bottom IS the rocket (RocketShip: slim, lying on its side, nose to the
 * right), low against the bottom of the screen, and it goes with you through the whole routine.
 * Its body carries only the hilo. Parked in the bar it always takes its whole length (its stages
 * stretched over the body: in flight and in the clouds it has its real one), and two panels stand
 * on its hull, slid up out of it: the name (a tap opens the list) and the time left; and Anterior /
 * Pausa / Siguiente ("Descanso · Luego: …" with the time, and "Saltar", in a rest).
 *
 *   dock      it lands at its real length, stretches to the whole length, and then its panels
 *             slide out; to leave, the panels slide in, it shrinks, and it goes (DOCK). One state
 *             (`dock`: which length it is drawn at, and when and how fast it gets there) and the
 *             flight's own timeline: the stretch is a FLIP of transforms (useLook), anchored to
 *             the flight's clock, or to the routine's in its last second (paused with it).
 *
 *   warm-up   between one clip and the next it tries to take off and can't (a cough, a hop with
 *             its nose up, a shake, and it drops back).
 *   last 3 s  before a rest or the end the engine lights: the flame grows each second, more and
 *             more exhaust, and the rocket shakes harder each second; the panels' text too.
 *   last 1 s  its panels slide in and it shrinks to its real length; it pulls back towards its
 *             tail and compresses, more and more; at 0 it shoots off from that crouch ("Siguiente"
 *             before that: the panels in, it shrinks, a quick crouch, off).
 *   rest      it is "being repaired" (RepairCrew): two mechanics set it on stands and work on it,
 *             and run off just before the end. The panels stay put ("Saltar" is always under the
 *             finger; the hull slides along them). When the rest ends, "¡pam!": it drops into its
 *             place with a hard squash.
 *   flights   when a rest begins (from that crouch) it turns
 *             its nose up and climbs straight out of the top of the screen; only a beat later does
 *             the big rocket of the clouds (the same drawing, bigger) come up from below. Once that
 *             one has gone, a beat, and it comes back from the left and lands with a squash; then
 *             it stretches and its panels slide out. It arrives when the routine starts and takes
 *             off one last time before the end screen.
 *
 * Where it is comes from `Flight` (rocketFlight.ts), a pure function of the clock: every flight is
 * put on the browser's animation timeline at once (Web Animations with delays, no chained timers),
 * so a skip, a pause, a hidden tab or a jump of the fixture always lands it in a defined pose.
 * Only transform and opacity move. Nothing in it can be pressed until its panels are coming out
 * (`inert`, kept in step with the flight by one effect that owns its timer, see useDockClock).
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
  /** a long rest (its talks, or the rest video): the rest's clock (RestClock) stands in the first panel, which doesn't repeat it */
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
  // After a block (and the warm-up) the mechanics take the part off in the clouds (Separation): the
  // rocket holds it until their blow, by the clouds' own clock (and from the very start of the rest,
  // before that clock runs for it); any other part comes off a moment into the clouds.
  const cloudRest = queue[cloudKey];
  const separating = !reduced && cloudRest?.kind === 'rest' && blockEnds(cloudRest);
  // (reduced motion: no mechanics; the part is simply gone once the calm version of the clouds,
  // their sentences on a still background, is over: CloudTransition)
  const calm = reduced && cloudRest?.kind === 'rest' && blockEnds(cloudRest);
  // ...and once it has gone, the new tail's fins spring out of the hull (until then they are in:
  // drawn hidden, then painted by the same clock, below). One reading of the clock says both, so
  // the render that first draws the new tail is the one that draws its fins inside the hull.
  const stage = useCloudMoment((m): 'hold' | 'fins' | 'free' =>
    separating
      ? m.key === cloudKey
        ? m.t !== null && m.t < SEPARATION.releaseMs
          ? 'hold'
          : finsPending(m.t)
            ? 'fins'
            : 'free'
        : currentIndex === cloudKey
          ? 'hold'
          : 'free'
      : calm
        ? currentIndex === cloudKey && (m.key !== cloudKey || m.t !== null)
          ? 'hold'
          : 'free'
        : 'free',
  );
  const holding = stage === 'hold';
  const finsIn = stage === 'fins';
  const [heldIndex, setHeldIndex] = useState(currentIndex);
  if (!holding && heldIndex !== currentIndex) setHeldIndex(currentIndex);
  const lagged = useLagged(currentIndex, entering && !separating ? FLIGHT.dropMs : 0);
  const drawnAt = holding ? heldIndex : lagged;
  const centredAt = useLagged(currentIndex, entering ? FLIGHT.returnStartMs + cloudExtraMs(item) : 0);
  const drawn = useMemo(() => rocketStack(queue, drawnAt), [queue, drawnAt]);
  const centred = useMemo(() => rocketStack(queue, centredAt), [queue, centredAt]);
  const L = useMemo(() => widgetLayout(width, centred), [width, centred]);
  // its real length (centred: moved by L.ship.shift), and the bar's whole length
  const gReal = useMemo(() => stackGeometry({ width: L.frame, ...drawn }), [L.frame, drawn]);
  const gFull = useMemo(() => stackGeometry({ width: L.frame, ...drawn, stretch: true }), [L.frame, drawn]);
  const pair = useMemo<LookPair>(() => ({ real: gReal, full: gFull, shift: L.ship.shift }), [gReal, gFull, L.ship.shift]);
  // which of the two it is drawn at (and when and how fast it gets there: useLook)
  const [dock, setDock] = useState<Dock>(AWAY);
  const g = dock.stretched ? gFull : gReal;
  const shift = dock.stretched ? 0 : L.ship.shift;
  // The first panel's line (the name; in a rest "Descanso · Luego: …"): one line, or two (a little
  // smaller if need be), and the panels grow taller for two (upwards: the time stays in its place).
  const shown = queue[displayIndex];
  const name = shown?.kind === 'warmup' ? 'Calentamiento' : shown?.kind === 'workout' ? shown.exercise.title : '';
  const lineText = isExercise(shown) ? name : shown?.kind === 'rest' ? `Descanso · Luego: ${shown.nextExercise.title}` : '';
  const lineEl = useRef<HTMLElement | null>(null);
  const setLineEl = useCallback((node: HTMLElement | null) => {
    lineEl.current = node;
  }, []);
  const hull = panelLayout(L);
  const panelsW = Math.round(hull.right - hull.left);
  // (a rest's line stands there with its clock beside it, not with the giant countdown on the video)
  const restLine = shown?.kind === 'rest' && !restCountdown && (clockTab || displayIndex === currentIndex);
  const fit = useNameFit(lineEl, isExercise(shown) ? 'name' : restLine ? 'rest' : null, `${lineText}|${panelsW}|${clockTab}`);
  const rise = panelRise(fit.size, fit.lines);
  useLayoutEffect(() => setPanelRise(rise), [rise]);
  useEffect(() => () => setPanelRise(0), []);
  const P = panelLayout(L, rise);

  // a part that has just come off falls away, turning slowly (in the clouds)
  const [shownStack, setShownStack] = useState<Stack>(drawn);
  const [falling, setFalling] = useState<{ key: number; g: ShipGeometry; piece: Piece; x: number } | null>(null);
  if (shownStack !== drawn) {
    const off = dropBetween(shownStack, drawn);
    if (off && entering && !separating) {
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
  // the separation's scene, set once as its clouds begin (null: nothing comes off in them). Once per
  // time the clouds play, not per rest: coming back to the same rest (it was reached with "Anterior"
  // from the next block, where nothing comes off, and is then reached again from its last serie)
  // plays them anew, and its scene must be the new one (a stale empty one left the part on).
  const [cloudRun, setCloudRun] = useState({ key: cloudKey, n: 0 });
  if (cloudRun.key !== cloudKey) setCloudRun({ key: cloudKey, n: cloudRun.n + 1 });
  const [scene, setScene] = useState<{ key: number; run: number; data: SeparationScene | null } | null>(null);
  if (holding && separating && (scene?.key !== cloudKey || scene.run !== cloudRun.n) && cloudRun.key === cloudKey && typeof window !== 'undefined') {
    setScene({ key: cloudKey, run: cloudRun.n, data: separationScene(drawn, rocketStack(queue, currentIndex), L, cloudTop, cloudExtraMs(cloudRest)) });
  }

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
  const shipEl = useRef<HTMLDivElement>(null);
  const drawingEl = useRef<HTMLDivElement>(null);
  const [sounds] = useState(() => new FlightSoundPlayer());
  const flight = useRocketFlight({
    els: { flightEl, liftEl, squashEl, flameEl, puffsEl, podEl, sparkleEl },
    spotOf: () => cloudSpot(root.current, L, cloudTop),
    cloudKey,
    ending,
    queue,
    currentIndex,
    reduced,
    sounds,
    onDock: setDock,
  });
  useEffect(() => sounds.setPaused(isPaused), [sounds, isPaused]);
  useEffect(() => {
    // (React's dev double mount: what is still to come is put back on the timeline)
    sounds.remount();
    return () => sounds.clear();
  }, [sounds]);
  // once a flight has landed it, it stretches (once per flight)
  const dockedFor = useRef<Flight | null>(null);
  const onParked = (f: Flight, now: number) => {
    if (dockedFor.current === f) return;
    dockedFor.current = f;
    const at = stretchFrom(f);
    setDock({ stretched: true, at: Number.isFinite(at) ? at : now, ms: reduced ? 0 : DOCK.stretchMs, pausable: false });
  };
  useDockClock(root, flight, onParked, cloudKey, ending, queue, currentIndex, reduced);
  useLook(dock, pair, shipEl, drawingEl, isPaused);
  useCrispWhenParked(flight, flightEl, drawingEl);
  // the new tail's fins, springing out on the clouds' clock (pure: finsAt)
  const paintFins = useCallback(
    (t: number | null, key: number | null) => {
      const drawing = drawingEl.current;
      if (!drawing || !separating || key !== cloudKey || !finsPending(t)) return;
      const s = finsAt(t ?? 0);
      drawing.querySelectorAll<SVGElement>('[data-fin]').forEach((n) => {
        n.style.transform = `scale(1, ${s})`;
      });
    },
    [separating, cloudKey],
  );
  useCloudPainter(paintFins);

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
  // (no engine sound in those 10 s: too much, 25-11-2026; the flame and the tremble stay)
  const shake = (amp: number) => ({ '--rw-amp': amp, '--rw-shake-s': `${engine.period}s` }) as CSSProperties;
  const toggleList = () => onListOpenChange(!listOpen);
  const showRestTime = shown?.kind === 'rest' && !restCountdown && !clockTab && live;
  // the last second before a takeoff: its panels slide in, it shrinks, and it crouches, more and more
  const crouching = launching && timeLeft <= PRELAUNCH.foldLeadS && timeLeft > 0;
  usePrelaunch(crouching, displayIndex, isPaused, flightEl, podEl, flight, setDock);

  // where the crew enters and leaves: the screen's edges, in the rocket's own px (it works on the
  // whole-length rocket, which is never moved)
  const shipLeft = 6 + (width - L.B) / 2 + L.ship.left;
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
  // (a short hull, a narrow first panel: the time a little smaller, on the same line)
  const timeClass = P.right - P.left < 230 ? 'text-[22px]' : 'text-[28px]';

  return (
    <div
      ref={root}
      data-rw="root"
      onPointerDownCapture={bump}
      onWheelCapture={bump}
      onKeyDownCapture={bump}
      className="pointer-events-none fixed bottom-[max(6px,env(safe-area-inset-bottom))] left-[max(6px,env(safe-area-inset-left))] right-[max(6px,env(safe-area-inset-right))] z-[61] font-[family-name:var(--font-display)] text-ink"
    >
      {/* (its height rounded up: it hangs from the screen's bottom, so the rocket lands on whole pixels) */}
      <div className="relative mx-auto" style={{ width: L.B, height: Math.ceil(L.box) }}>
        {/* the list, above the panels */}
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="list"
              initial={reduced ? { opacity: 1 } : { opacity: 0, transform: 'translateY(16px)' }}
              animate={{ opacity: 1, transform: 'translateY(0px)' }}
              exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: 'translateY(16px)' }}
              transition={{ duration: reduced ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="pointer-events-auto absolute overflow-hidden rounded-[20px] bg-[rgb(14_14_14/0.84)] text-white"
              style={{ left: L.banner.left, width: bannerW, bottom: L.box - P.top + 8 }}
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

        {/* THE ROCKET: flight (where it is) > its panels (behind the rocket, out of its hull), and
            the drawing: its length (useLook) > sink (the rest's weight) > squash (settle, ¡pam!,
            cough) > shake (ignition) */}
        <div ref={flightEl} className="absolute inset-0" style={{ transformOrigin: `${L.center.x}px ${L.center.y}px` }}>
          <div ref={podEl} data-rw="pod" className="absolute inset-0">
            {/* the panels, side by side on the hull's straight part: they slide up out of it and
                back into it, clipped inside it (a little room above them for the focus rings) */}
            <div
              className="absolute flex overflow-hidden"
              style={{ left: P.left, width: P.right - P.left, top: P.top - PANEL_ROOM, height: P.clip - P.top + PANEL_ROOM, paddingTop: PANEL_ROOM, gap: PANEL.SEAM }}
            >
              <Panel rw="panel-1" grow below={P.clip - P.top - PANEL.H - rise} rise={rise}>
                {isExercise(shown) && (
                  // the name (a tap anywhere here opens the list) and the time left
                  <div data-bar="" onClick={toggleList} className="pointer-events-auto flex h-full min-w-0 flex-1 cursor-pointer flex-col justify-center pl-3 pr-0.5">
                    <div data-rw-namebox="" className={`flex min-w-0 flex-col ${shaking && ignition > 0 ? 'rw-jitter' : ''}`} style={shake(SHAKE.text[ignition])}>
                      <button
                        type="button"
                        onClick={own(toggleList)}
                        aria-expanded={open}
                        aria-controls={listId}
                        aria-label={`${name}. ${open ? 'Cerrar la rutina' : 'Ver la rutina'}`}
                        className="flex min-w-0 max-w-full cursor-pointer items-center gap-0.5 self-start rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
                      >
                        <span ref={setLineEl} data-rw="name" className={`min-w-0 font-semibold ${fitClass(fit)}`} style={fitStyle(fit)}>
                          {hyphenateEs(name)}
                        </span>
                        <ChevronUp
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 shrink-0 text-ink/55 transition-transform duration-300 motion-reduce:transition-none ${open ? 'rotate-180' : ''}`}
                        />
                      </button>
                      <span data-rw="time" role="timer" className={`${timeClass} font-bold leading-[28px] tabular-nums tracking-[-0.02em]`}>
                        {time}
                      </span>
                    </div>
                  </div>
                )}
                {shown?.kind === 'rest' && (
                  <div className="flex h-full min-w-0 flex-1 flex-col justify-center pl-3 pr-2">
                    {clockTab && !restCountdown ? (
                      <>
                        <p ref={setLineEl} data-rw="rest" className={`font-semibold ${fitClass(fit)}`} style={fitStyle(fit)}>
                          Descanso
                          <span data-rw="later" className="font-medium text-ink/60">
                            {' '}
                            · Luego: {hyphenateEs(shown.nextExercise.title)}
                          </span>
                        </p>
                        {/* (the rest's countdown comes to stand here: RestClock) */}
                        <span aria-hidden="true" className="block h-[28px]" />
                      </>
                    ) : showRestTime ? (
                      <>
                        <p ref={setLineEl} data-rw="rest" className={`font-semibold ${fitClass(fit)}`} style={fitStyle(fit)}>
                          Descanso
                          <span data-rw="later" className="font-medium text-ink/60">
                            {' '}
                            · Luego: {hyphenateEs(shown.nextExercise.title)}
                          </span>
                        </p>
                        <span
                          data-rw="time"
                          role="timer"
                          aria-label={`${time} de descanso`}
                          // (centred in the panel, clear of the rocket's fin at its bottom-left)
                          className="self-center text-[28px] font-bold leading-[28px] tabular-nums tracking-[-0.02em]"
                        >
                          {time}
                        </span>
                      </>
                    ) : (
                      // the giant countdown is on the video: the panel doesn't repeat it
                      <p data-rw="rest" className="truncate text-[20px] font-semibold leading-tight">
                        Descanso
                      </p>
                    )}
                  </div>
                )}
              </Panel>
              <Panel rw="panel-2" below={P.clip - P.top - PANEL.H - rise} rise={rise}>
                {isExercise(shown) && (
                  // (the three 44 px targets edge to edge, over the panel's own lines: all the
                  // rest of the hull goes to the first panel)
                  <div className="-mx-[1.5px] flex h-full items-center">
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
                  </div>
                )}
                {shown?.kind === 'rest' && (
                  <div className="flex h-full items-center px-[3px]">
                    <button
                      type="button"
                      data-rw="skip"
                      onClick={own(guarded(onNext))}
                      className="pointer-events-auto flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-ink pl-4 pr-3.5 text-[16px] font-semibold text-white transition-colors duration-150 hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:scale-95 motion-reduce:active:scale-100"
                    >
                      Saltar
                      <SkipForward className="h-[17px] w-[17px] fill-current" aria-hidden="true" />
                    </button>
                  </div>
                )}
              </Panel>
            </div>
          </div>

          {/* the rocket: its frame stands where the whole rocket stands */}
          <div className="absolute" style={{ left: L.ship.left, top: L.ship.top, width: g.W, height: g.H }}>
            {/* (at its real length what is left of it stands centred: its drawing moves by the missing half) */}
            {/* (no transform at all when it needs none: parked, it is drawn crisp, like its panels) */}
            <div ref={shipEl} data-rw="ship" className="absolute inset-0" style={shift ? { transform: `translateX(${shift}px)` } : undefined}>
              {/* the lift: on the stands of a rest (and its jolts) */}
              <div ref={liftEl} data-rw="lift" className="absolute inset-0" style={{ transformOrigin: `${(g.x0 + g.tip) / 2}px ${SHIP.F + SHIP.T}px` }}>
                <div className="absolute inset-0">
                  {falling && <FallingPiece key={falling.key} g={falling.g} piece={falling.piece} x={falling.x} hilo={hilo} onDone={() => setFalling(null)} />}
                  {scene?.data && scene.key === cloudKey && <Separation key={scene.run} restKey={scene.key} scene={scene.data} hilo={hilo} reduced={reduced} />}
                  <div ref={squashEl} className="absolute inset-0" style={{ transformOrigin: `${(g.x0 + g.tip) / 2}px ${SHIP.F + SHIP.T}px` }}>
                    <div className={`absolute inset-0 ${shaking ? 'rw-shake' : ''}`} style={shake(engine.amp)}>
                      <div ref={drawingEl} className="absolute inset-0">
                        <RocketShip
                          g={g}
                          hilo={hilo}
                          finsOut={!finsIn}
                          className="absolute left-0 top-0"
                          behind={
                            // (all of it hangs from the tail: it moves with the tail as the rocket stretches)
                            <div data-part="tail" className="absolute inset-0">
                              <WarningFlame g={g} level={warning} on={warned} />
                              <IgnitionFlame g={g} level={ignition} />
                              <FlightFlame g={g} flameRef={flameEl} />
                              <Exhaust g={g} level={ignition} paused={isPaused} />
                              <SputterPuffs g={g} puffsRef={puffsEl} />
                            </div>
                          }
                        />
                      </div>
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
            </div>
            {crewOn && (
              <RepairCrew
                // (its places are taken once it is on: anew if the rocket changes in the clouds)
                key={`${crewAt}:${gFull.first}:${gFull.boosters ? 1 : 0}`}
                g={gFull}
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
            <div ref={sparkleEl} aria-hidden="true" className="pointer-events-none absolute" style={{ left: gFull.tip - 22, top: SHIP.F - 14, width: 16, height: 16, opacity: 0 }}>
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

// ---------------------------------------------------------------------------------------------
// The dock: which length the rocket is drawn at, and its panels

/**
 * The rocket's length in the bar: drawn stretched (the whole length) or at its real length, and
 * when (performance.now() ms) and how fast it gets there from wherever it looks now (`pausable`:
 * on the routine's clock, paused with it: its last second; otherwise on the flight's).
 */
interface Dock {
  stretched: boolean;
  at: number;
  ms: number;
  pausable: boolean;
}
const AWAY: Dock = { stretched: false, at: 0, ms: 0, pausable: false };
const STRETCH_EASE = 'cubic-bezier(0.3, 0, 0.2, 1)';

/**
 * The stretch, played: the drawing is at the length `dock` says (the parts of RocketShip are
 * drawn for it), and from the moment it changes, transforms (lookTransform) show it as it looked
 * before and take it to the new length, over `ms` from `at` (an animation of every part, one
 * easing: no layout moves). A new dock goes on from wherever the last one had got to. Nothing
 * to animate at the end: the parts' transforms are then none.
 */
function useLook(dock: Dock, pair: LookPair, shipEl: RefObject<HTMLDivElement | null>, drawingEl: RefObject<HTMLDivElement | null>, paused: boolean) {
  const look = useRef<{ anims: Animation[]; from: number; to: number; dock: Dock } | null>(null);
  const pausedNow = useRef(paused);
  useLayoutEffect(() => {
    pausedNow.current = paused;
  });
  useLayoutEffect(() => {
    const ship = shipEl.current;
    const drawing = drawingEl.current;
    if (!ship || !drawing) return;
    const to = dock.stretched ? 1 : 0;
    const prev = look.current;
    // (the same dock with a new drawing: the same way again, for the new parts)
    const from = prev && prev.dock === dock ? prev.from : prev ? lookNow(prev) : to;
    prev?.anims.forEach((a) => a.cancel());
    // (where it settles: what the next dock starts from)
    look.current = { anims: [], from: to, to, dock };
    if (Math.abs(from - to) < 0.001 || dock.ms <= 0) return;
    const now = performance.now();
    const timing: KeyframeAnimationOptions = { delay: dock.at - now, duration: dock.ms, easing: STRETCH_EASE, fill: 'both' };
    const anims: Animation[] = [];
    const run = (node: Element, part: LookPart) => {
      const a = node.animate([{ transform: lookTransform(pair, to, from, part) }, { transform: lookTransform(pair, to, to, part) }], timing);
      // (it ends where the parts' own style has them: once there, nothing is held on them, so the
      // parked rocket carries no leftover transform and is drawn crisp)
      a.onfinish = () => a.cancel();
      // (anchored to the clock, like the flight; its last second runs on the routine's)
      if (!dock.pausable) a.startTime = now;
      else if (pausedNow.current) a.pause();
      anims.push(a);
    };
    run(ship, { kind: 'shift' });
    const drawn = to ? pair.full : pair.real;
    drawing.querySelectorAll('[data-part]').forEach((node) => {
      const kind = node.getAttribute('data-part');
      if (kind === 'tail') return run(node, { kind: 'tail' });
      const block = Number(node.getAttribute('data-piece')?.replace('seg-', ''));
      if (!Number.isFinite(block)) return;
      if (kind === 'start' || kind === 'end' || kind === 'mid') run(node, { kind, block });
      else if (kind === 'body') {
        const hilo = node.getAttribute('data-rocket') === 'hilo';
        run(node, { kind: 'body', block, left: hilo ? (drawn.segments.find((s) => s.block === block)?.content.left ?? 0) : 0 });
      }
    });
    look.current = { anims, from, to, dock };
  }, [dock, pair, shipEl, drawingEl]);
  useEffect(() => {
    const l = look.current;
    if (!l?.dock.pausable) return;
    l.anims.forEach((a) => {
      // (finished, or released once finished: never played again)
      if (a.playState === 'finished' || a.playState === 'idle') return;
      if (paused) a.pause();
      else a.play();
    });
  }, [paused, dock]);
}

/** Where a stretch under way has got to (its look: 0 real, 1 stretched). */
function lookNow(l: { anims: Animation[]; from: number; to: number }): number {
  const p = l.anims[0]?.effect?.getComputedTiming().progress;
  return p === null || p === undefined ? l.to : l.from + (l.to - l.from) * p;
}

/** A little room above the panels in their clip (the name's focus ring). */
const PANEL_ROOM = 6;
const PANEL_HIDDEN = 'translateY(100%)';
const PANEL_SHOWN = 'translateY(0%)';

/** The panels in the pod (each one slides on its own). */
const panelsOf = (pod: HTMLElement | null) => (pod ? Array.from(pod.querySelectorAll<HTMLElement>('[data-panel]')) : []);

/**
 * The panels slide out of the hull or back into it, one a little after the other (`fill`: held
 * where they start until then, and/or where they end). `anchor`: the flight's clock.
 */
function slidePanels(
  pod: HTMLElement,
  move: 'out' | 'in',
  { delay = 0, fill, id, anchor }: { delay?: number; fill: FillMode; id?: string; anchor?: number },
): Animation[] {
  const out = move === 'out';
  return panelsOf(pod).map((panel, i) => {
    const a = panel.animate(out ? [{ transform: PANEL_HIDDEN }, { transform: PANEL_SHOWN }] : [{ transform: PANEL_SHOWN }, { transform: PANEL_HIDDEN }], {
      duration: out ? DOCK.outMs : DOCK.inMs,
      delay: delay + i * (out ? DOCK.outStaggerMs : DOCK.inStaggerMs),
      easing: out ? 'cubic-bezier(0.2, 0.8, 0.3, 1)' : 'cubic-bezier(0.5, 0, 0.85, 0.45)',
      fill,
      id,
    });
    if (anchor !== undefined) a.startTime = anchor;
    return a;
  });
}

/** The panels held inside the hull (until something takes them out). */
function holdPanelsIn(pod: HTMLElement, anchor?: number) {
  panelsOf(pod).forEach((panel) => {
    const a = panel.animate([{ transform: PANEL_HIDDEN }, { transform: PANEL_HIDDEN }], { duration: 1, fill: 'forwards' });
    if (anchor !== undefined) a.startTime = anchor;
  });
}

/** Every slide of the panels stops (their resting place is out). */
const cancelPanels = (pod: HTMLElement) => panelsOf(pod).forEach((panel) => panel.getAnimations().forEach((a) => a.cancel()));

/** The panels are in (or mostly). */
function panelsIn(pod: HTMLElement): boolean {
  const panel = panelsOf(pod)[0];
  if (!panel) return true;
  const t = getComputedStyle(panel).transform;
  return t !== 'none' && new DOMMatrix(t).m42 > panel.offsetHeight / 2;
}

/**
 * A panel: white, the ink line, its top corners rounded, standing on the hull (it reaches down
 * into it, hidden behind it), with two rivets low at its ends.
 */
function Panel({ rw, grow = false, below, rise, children }: { rw: string; grow?: boolean; below: number; rise: number; children?: React.ReactNode }) {
  return (
    <div
      data-panel=""
      data-rw={rw}
      className={`relative h-full rounded-t-[12px] border-[1.5px] border-b-0 border-ink bg-white ${grow ? 'flex min-w-0 flex-1' : 'flex shrink-0'}`}
      style={{ paddingBottom: below }}
    >
      {children}
      <span aria-hidden="true" className="pointer-events-none absolute left-[4px] h-[2px] w-[2px] rounded-full bg-ink/55" style={{ top: PANEL.H + rise - 8 }} />
      <span aria-hidden="true" className="pointer-events-none absolute right-[4px] h-[2px] w-[2px] rounded-full bg-ink/55" style={{ top: PANEL.H + rise - 8 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The first panel's line: as it fits

/**
 * How the first panel's line is set: its size, on one line or two, and whether a word may be
 * broken (at a syllable, with a hyphen: the soft hyphens of hyphenateEs). `last`: nothing fitted: two lines at the smallest size,
 * broken anywhere if need be, and an ellipsis after the second.
 */
interface NameFit {
  size: number;
  lines: 1 | 2;
  hyphens: boolean;
  last?: boolean;
}
/** In order: one line as it is, two lines between words, one line smaller, two lines broken at a syllable. */
const NAME_FITS: NameFit[] = [
  { size: 15, lines: 1, hyphens: false },
  { size: 14, lines: 1, hyphens: false },
  { size: 13, lines: 1, hyphens: false },
  { size: 14, lines: 2, hyphens: false },
  { size: 13, lines: 2, hyphens: false },
  { size: 12, lines: 2, hyphens: false },
  { size: 12, lines: 1, hyphens: false },
  { size: 11, lines: 1, hyphens: false },
  { size: 13, lines: 2, hyphens: true },
  { size: 12, lines: 2, hyphens: true },
  { size: 11, lines: 2, hyphens: true },
];
const NAME_LAST: NameFit = { size: 11, lines: 2, hyphens: true, last: true };
/** The chevron beside the name, and its gap. */
const CHEVRON_ROOM = 16;

const sameFit = (a: NameFit, b: NameFit) => a.size === b.size && a.lines === b.lines && a.hyphens === b.hyphens && a.last === b.last;

/** The first fit of the line `el` in `avail` px (measured on the element itself, its styles put back). */
function measureFit(el: HTMLElement, avail: number): NameFit {
  const saved = el.style.cssText;
  const s = el.style;
  s.display = 'block';
  s.width = `${Math.max(1, avail)}px`;
  s.maxWidth = 'none';
  s.overflow = 'hidden';
  s.setProperty('-webkit-line-clamp', 'none');
  s.overflowWrap = 'normal';
  let found = NAME_LAST;
  for (const f of NAME_FITS) {
    const lh = nameLineHeight(f.size, f.lines);
    s.fontSize = `${f.size}px`;
    s.lineHeight = `${lh}px`;
    s.whiteSpace = f.lines === 1 ? 'nowrap' : 'normal';
    s.setProperty('hyphens', f.hyphens ? 'manual' : 'none');
    s.setProperty('-webkit-hyphens', f.hyphens ? 'manual' : 'none');
    if (el.scrollWidth > avail + 0.5 || el.scrollHeight >= (f.lines + 0.5) * lh) continue;
    // (two lines' worth of room that one line fills: one line at that size)
    found = f.lines === 2 && el.scrollHeight < 1.5 * lh ? { ...f, lines: 1 } : f;
    break;
  }
  el.style.cssText = saved;
  return found;
}

/**
 * The fit of the first panel's line (`el`: the name, or a rest's line), anew whenever `key` (its
 * text, the panel's width, which line it is) changes and once the fonts are in. `mode`: the name
 * leaves room for its chevron.
 */
function useNameFit(el: RefObject<HTMLElement | null>, mode: 'name' | 'rest' | null, key: string): NameFit {
  const [fit, setFit] = useState<NameFit>(NAME_FITS[0]);
  const [fonts, setFonts] = useState(0);
  useEffect(() => {
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) setFonts((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, []);
  // (measured as a ResizeObserver reports: once as it starts observing, before the first paint,
  // and again whenever the line or its room changes size)
  useLayoutEffect(() => {
    const node = el.current;
    if (!mode || !node) return;
    const box = mode === 'name' ? node.closest<HTMLElement>('[data-rw-namebox]') : null;
    const ro = new ResizeObserver(() => {
      if (!node.isConnected) return;
      const avail = box ? box.clientWidth - CHEVRON_ROOM : node.clientWidth;
      const next = avail > 0 ? measureFit(node, avail) : NAME_FITS[0];
      setFit((f) => (sameFit(f, next) ? f : next));
    });
    ro.observe(node);
    if (box) ro.observe(box);
    return () => ro.disconnect();
  }, [el, mode, key, fonts]);
  // (no line in the panel: one line's height)
  return mode ? fit : NAME_FITS[0];
}

const fitClass = (f: NameFit) => (f.lines === 1 ? 'truncate' : 'line-clamp-2 text-balance');
const fitStyle = (f: NameFit): CSSProperties => ({
  fontSize: f.size,
  lineHeight: `${nameLineHeight(f.size, f.lines)}px`,
  hyphens: f.hyphens ? 'manual' : 'none',
  WebkitHyphens: f.hyphens ? 'manual' : 'none',
  overflowWrap: f.last ? 'anywhere' : undefined,
});

/** The crouch of the last second and its panels going in, as the animations' ids. */
const CROUCH_ID = 'rw-crouch';
const FOLD_ID = 'rw-crouch-fold';
const prelaunchOf = (node: HTMLElement | null, pod: HTMLElement | null) =>
  [...(node?.getAnimations() ?? []), ...panelsOf(pod).flatMap((p) => p.getAnimations())].filter((a) => a.id === CROUCH_ID || a.id === FOLD_ID);

/**
 * The last second of a serie before a takeoff: its panels slide into the hull, it shrinks to its
 * real length, and it crouches (over the second that is left, all paused with the routine). The
 * takeoff then goes from there: the flight (whose effect runs first) reads how far it got and
 * takes over. If no takeoff came (a rewind, "Anterior"), it stretches again, stands up, and its
 * panels come out again.
 */
function usePrelaunch(
  on: boolean,
  at: number,
  paused: boolean,
  flightEl: RefObject<HTMLDivElement | null>,
  podEl: RefObject<HTMLDivElement | null>,
  flight: RefObject<Flight>,
  onDock: (dock: Dock) => void,
) {
  useLayoutEffect(() => {
    const node = flightEl.current;
    const pod = podEl.current;
    if (!node || !pod) return;
    const now = performance.now();
    if (!on) {
      const left = prelaunchOf(node, pod);
      if (!left.length) return;
      left.forEach((a) => a.cancel());
      // (a flight took over: it owns the rocket now)
      if (phaseAt(flight.current, now) !== 'parked') return;
      onDock({ stretched: true, at: now, ms: DOCK.stretchMs, pausable: false });
      slidePanels(pod, 'out', { delay: DOCK.stretchMs, fill: 'both' });
      return;
    }
    if (prelaunchOf(node, null).length) return;
    // the panels go in first, it shrinks, and only then does the rocket move (its crouch)
    const crouchMs = PRELAUNCH.leadS * 1000;
    slidePanels(pod, 'in', { id: FOLD_ID, fill: 'forwards' });
    playSfx('banner');
    onDock({ stretched: false, at: now + prelaunchCompress.delay, ms: prelaunchCompress.ms, pausable: true });
    node.animate(PRELAUNCH_KEYFRAMES, { id: CROUCH_ID, duration: crouchMs, delay: (PRELAUNCH.foldLeadS - PRELAUNCH.leadS) * 1000, fill: 'forwards' });
  }, [on, at, flightEl, podEl, flight, onDock]);
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
  sounds,
  onDock,
}: {
  els: FlightEls;
  /** its place in the clouds, measured now */
  spotOf: () => CloudSpot;
  cloudKey: number;
  ending: boolean;
  queue: RoutineItem[];
  currentIndex: number;
  reduced: boolean;
  /** the flight's sounds, put on the timeline with it */
  sounds: FlightSoundPlayer;
  /** its length as the flight starts (see Dock) */
  onDock: (dock: Dock) => void;
}): RefObject<Flight> {
  const flight = useRef<Flight>(PARKED);
  const seen = useRef<{ cloudKey: number; ending: boolean; queue: RoutineItem[]; item: RoutineItem | undefined } | null>(null);
  const refs = useRef(els);
  const spot = useRef(spotOf);
  const dock = useRef(onDock);
  useLayoutEffect(() => {
    spot.current = spotOf;
    dock.current = onDock;
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
    else if (!ending && cloudKey !== prev.cloudKey && !reduced) next = nextFlight(flight.current, 'clouds', now, cloudExtraMs(item));
    else if (!ending && (prev.ending || queue !== prev.queue)) next = nextFlight(flight.current, 'show', now);
    else {
      // No flight: the moment changed with the rocket in its place.
      if (phaseAt(flight.current, now) !== 'parked') return;
      if (prev.item?.kind === 'rest' && isExercise(item)) {
        // the end of a rest: "¡pam!", it drops off its stands into its place, and it is ready
        playSfx('pam');
        if (reduced) {
          el.pod.animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: 200 });
        } else {
          const lifted = getComputedStyle(el.lift).transform;
          const y = lifted === 'none' ? 0 : new DOMMatrix(lifted).m42;
          el.lift.getAnimations().forEach((a) => a.cancel());
          el.squash.animate(PAM_KEYFRAMES, { duration: FLIGHT.pamMs });
          if (y < -0.5) el.lift.animate(springBackKeyframes({ y, rz: 0 }), { duration: STANDS.springMs });
          // (its panels give a little with it: a dip into the hull and back)
          panelsOf(el.pod).forEach((panel) => panel.animate(PANEL_BUMP, { duration: 380 }));
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
        // one warm-up clip to the next: it tries to take off and can't (its panels slide in first,
        // nothing moves with them out, and slide out again after; with its boosters on it has its
        // whole length already: nothing to stretch)
        const wait = PANELS_IN_MS;
        slidePanels(el.pod, 'in', { fill: 'forwards' });
        slidePanels(el.pod, 'out', { delay: wait + SPUTTER.ms, fill: 'both' });
        el.squash.animate(SPUTTER_KEYFRAMES, { duration: SPUTTER.ms, delay: wait });
        el.flame.animate(SPUTTER_FLAME_KEYFRAMES, { duration: SPUTTER.ms, delay: wait });
        Array.from(el.puffs.children).forEach((puff, i) =>
          (puff as HTMLElement).animate(sputterPuffKeyframes(i ? -30 : -18, i ? 16 : -20), {
            duration: 820,
            delay: wait + (i ? 300 : 120),
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
    // (panels already in, from the last second, stay in)
    const start: LaunchStart = crouched ? 'crouched' : panelsIn(el.pod) ? 'folded' : 'open';
    playFlight(next, now, reduced, start, { flight: el.flight, lift: el.lift, squash: el.squash, flame: el.flame, pod: el.pod }, () => spot.current());
    // its sounds, on the same timeline (with reduced motion nothing flies: no sound)
    if (reduced) sounds.clear();
    else sounds.play(flightSounds(next, start));
    // Its length: leaving from its place, it shrinks to its real length once its panels are in and
    // before it moves off; any other flight finds it away (or coming back): real at once. (With
    // reduced motion it never flies away: it keeps the whole length.)
    if (!reduced) {
      const leaves = next.leftAt === now && next.how !== 'fade' && !next.placed;
      const c = compressTiming(start);
      dock.current(leaves ? { stretched: false, at: now + c.delay, ms: c.ms, pausable: false } : { stretched: false, at: now, ms: 0, pausable: false });
    }
    // (`sounds` never changes)
  }, [cloudKey, ending, queue, currentIndex, reduced, sounds]);

  return flight;
}

/** Held on the rocket on purpose while parked: the crouch of its last second (until the take-off). */
const HELD_WHILE_PARKED = [CROUCH_ID];

/**
 * Parked, the rocket carries no transform at all (drawn crisp, like its panels), by construction:
 * whatever path left an animation held on the rocket's drawing or on anything above it (a flight's
 * landing, the arrival, a stretch, a jolt, a paused player), once the rocket is parked and that
 * animation is over, it is let go (`holdsOnlyParked`: every one of them ends exactly where the
 * rocket stands with no transform, so nothing moves). Checked four times a second and on coming
 * back to the tab: a few getAnimations calls, nothing per frame. While a flight, the crouch or a
 * jolt is still under way (or paused midway) it stays.
 */
function useCrispWhenParked(flight: RefObject<Flight>, flightEl: RefObject<HTMLDivElement | null>, drawingEl: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const release = () => {
      const top = flightEl.current;
      const drawing = drawingEl.current;
      if (!top || !drawing || phaseAt(flight.current, performance.now()) !== 'parked') return;
      // the rocket's drawing (each of its layers) and everything above it, up to the flight's layer
      const chain = new Set<Element>();
      drawing.querySelectorAll('[data-piece]').forEach((piece) => {
        for (let n: Element | null = piece; n && !chain.has(n); n = n === top ? null : n.parentElement) chain.add(n);
      });
      chain.forEach((node) =>
        node.getAnimations().forEach((a) => {
          const t = a.effect?.getComputedTiming();
          if (!t) return;
          const held = { id: a.id, playState: a.playState, localTime: t.localTime === null || t.localTime === undefined ? null : Number(t.localTime), endTime: Number(t.endTime ?? 0) };
          if (holdsOnlyParked(held, true, HELD_WHILE_PARKED)) a.cancel();
        }),
      );
    };
    release();
    const timer = setInterval(release, 250);
    document.addEventListener('visibilitychange', release);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', release);
    };
  }, [flight, flightEl, drawingEl]);
}

/**
 * The widget is `inert` exactly while its controls can't be used (see controlsLiveAt), and once a
 * flight has landed it the rocket is docked (`onParked`: it stretches, on the flight's clock). One
 * effect owns the timer for both: it runs after every flight and again whenever it mounts (React's
 * dev double mount included), and on coming back to the tab, so the timer can never be lost. (It
 * used to be set by the flight and cleared by another effect's cleanup: the dev double mount
 * cleared it and left the widget inert from the start of the routine until the first rest.)
 */
function useDockClock(
  root: RefObject<HTMLDivElement | null>,
  flight: RefObject<Flight>,
  onParked: (f: Flight, now: number) => void,
  ...moment: [number, boolean, RoutineItem[], number, boolean]
) {
  const [cloudKey, ending, queue, currentIndex, reduced] = moment;
  const parked = useRef(onParked);
  useLayoutEffect(() => {
    parked.current = onParked;
  });
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(timer);
      const now = performance.now();
      const f = flight.current;
      node.toggleAttribute('inert', !controlsLiveAt(f, now));
      if (phaseAt(f, now) === 'parked') parked.current(f, now);
      const next = [controlsLiveFrom(f, now), parkedFrom(f)].filter((t): t is number => t !== null && Number.isFinite(t) && t > now);
      if (next.length) timer = setTimeout(sync, Math.min(...next) - now + 16);
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

/**
 * The sounds of the flight in course (rocketSounds.ts), as cues on the animation timeline: each
 * one at the moment its animation does the thing. A new flight replaces them. Paused with the
 * routine: no hits, and the slow-motion loop stops (and goes on if the slow rise still lasts).
 */
class FlightSoundPlayer {
  private paused = false;
  private plan: FlightSounds | null = null;
  private live = false;
  private cues: Animation[] = [];
  private slow: SfxLoopStop | null = null;

  /** A new flight. */
  play(plan: FlightSounds) {
    this.clear();
    this.plan = plan;
    this.schedule();
  }

  /** Back after React's dev double mount: what is still to come goes on the timeline again. */
  remount() {
    if (!this.live && this.plan) this.schedule();
  }

  setPaused(paused: boolean) {
    this.paused = paused;
    this.syncSlow();
  }

  /** Nothing more of this flight sounds. */
  clear() {
    this.cues.forEach((c) => c.cancel());
    this.cues = [];
    this.live = false;
    this.slow?.();
    this.slow = null;
  }

  private schedule() {
    const plan = this.plan;
    if (!plan) return;
    this.live = true;
    for (const { at, sfx } of plan.hits) {
      this.cue(at, () => {
        if (!this.paused) playSfx(sfx);
      });
    }
    if (plan.slowMo) {
      this.cue(plan.slowMo[0], () => this.syncSlow());
      this.cue(plan.slowMo[1], () => this.syncSlow());
      this.syncSlow();
    }
  }

  private cue(at: number, fn: () => void): boolean {
    const c = sfxCue(at, fn);
    if (c) this.cues.push(c);
    return c !== null;
  }

  /** The slow-motion loop is on exactly while the slow rise lasts (and the routine isn't paused). */
  private syncSlow() {
    const span = this.plan?.slowMo;
    const now = performance.now();
    // (a cue fires a frame after its moment at most: the margin keeps the start and the end apart)
    const on = this.live && !this.paused && !!span && now >= span[0] - 50 && now < span[1] - 50;
    if (on && !this.slow) this.slow = startSfxLoop('slowMo');
    else if (!on && this.slow) {
      this.slow();
      this.slow = null;
    }
  }
}

/** Puts the whole of a flight on the timeline, from now: leaving (if it does), and coming back (if it does). */
function playFlight(
  f: Flight,
  now: number,
  reduced: boolean,
  start: LaunchStart,
  el: { flight: HTMLElement; lift: HTMLElement; squash: HTMLElement; flame: HTMLElement; pod: HTMLElement },
  spotOf: () => CloudSpot,
) {
  // where it is right now, for a fade from mid-flight
  const style = getComputedStyle(el.flight);
  const from = { transform: style.transform === 'none' ? 'none' : style.transform, opacity: Number(style.opacity) };
  const podOpacity = Number(getComputedStyle(el.pod).opacity);
  [el.flight, el.lift, el.squash, el.flame, el.pod].forEach((node) => node.getAnimations().forEach((a) => a.cancel()));
  cancelPanels(el.pod);
  if (f.leftAt === null) return;

  const leaves = Number.isFinite(f.leftAt);
  const delay = (t: number) => t - now;
  // Anchored to the clock: a page in the background doesn't start its animations until it is
  // shown again, which would push the whole flight late. With its start time set, it is wherever
  // it should be by now the moment the page is seen.
  const run = (node: HTMLElement, keys: Keyframe[], options: KeyframeAnimationOptions) => {
    const a = node.animate(keys, options);
    a.startTime = now;
    return a;
  };
  // Landed: the flight's animations let go of the rocket. They end exactly in its parked place
  // (PARKED_POSE, or none), which is where it stands with no transform at all; held, the pose's
  // perspective would keep the rocket a 3D layer, drawn as a resampled texture (blurry next to its
  // panels). A new flight starts from that same place.
  const releaseOnLanding = (landing: Animation) => {
    landing.onfinish = () => el.flight.getAnimations().forEach((a) => a.playState === 'finished' && a.cancel());
  };
  const podIn = () => holdPanelsIn(el.pod, now);
  // the panels slide into the hull before the rocket moves (see launchLeadMs), unless they already have
  const foldIn = (at: number) => (start !== 'open' ? podIn() : slidePanels(el.pod, 'in', { delay: at, fill: 'forwards', anchor: now }));

  if (leaves) {
    const at = delay(f.leftAt);
    if (f.how === 'clouds' && !reduced) {
      // off to the right from its crouch, up from below in the clouds, and out of the top
      if (!f.placed) foldIn(at);
      else podIn();
      const extra = f.extra ?? 0;
      run(el.flight, cloudKeyframes(spotOf(), f.placed, start, extra), { duration: CLOUD_LEAVE_MS + extra, delay: at, fill: 'forwards' });
      run(el.flame, cloudFlameKeyframes(f.placed, start, extra), { duration: CLOUD_LEAVE_MS + extra, delay: at, fill: 'forwards' });
    } else if (f.how === 'takeoff' && !reduced) {
      // from its crouch it turns its nose up and climbs straight out of the top
      foldIn(at);
      const quick = launchLeadMs(start) / FLIGHT.takeoffMs;
      run(el.flight, takeoffKeyframes(start), { duration: FLIGHT.takeoffMs, delay: at, fill: 'forwards' });
      run(
        el.flame,
        [
          { opacity: start === 'crouched' ? 1 : 0, transform: start === 'crouched' ? 'scale(0.8, 1)' : 'scale(0.3, 0.7)' },
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
      else podIn();
    }
  }

  if (f.returnAt === null) {
    if (!leaves) {
      run(el.flight, [{ opacity: 0 }, { opacity: 0 }], { duration: 1, fill: 'forwards' });
      podIn();
    }
    return;
  }
  // coming back: while it waits, the leaving animation holds it away; with none, the return's own first frame does
  const fill: FillMode = leaves ? 'forwards' : 'both';
  const at = delay(f.returnAt);
  const parkedAt = at + FLIGHT.returnMs;
  if (reduced) {
    releaseOnLanding(run(el.flight, [{ transform: 'none', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 250, delay: at, fill }));
    run(el.pod, [{ opacity: 0 }, { opacity: 1 }], { duration: 250, delay: parkedAt + DOCK.outAtMs, fill });
    return;
  }
  releaseOnLanding(run(el.flight, RETURN_KEYFRAMES, { duration: FLIGHT.returnMs, delay: at, fill }));
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
  // once it has landed and stretched (useDockClock: from parkedFrom + DOCK.stretchAtMs), its panels
  // slide out of the hull (held in until then: by their going in, or with none, by these' first frames)
  slidePanels(el.pod, 'out', { delay: parkedAt + DOCK.outAtMs, fill: leaves ? 'forwards' : 'both', anchor: now });
}

/** The panels give a little as the rocket drops into its place ("¡pam!"): a dip into the hull and back. */
const PANEL_BUMP: Keyframe[] = [
  { offset: 0, transform: 'translateY(5px)', easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
  { offset: 0.55, transform: 'translateY(-1.5px)', easing: 'cubic-bezier(0.4, 0, 0.4, 1)' },
  { offset: 1, transform: 'translateY(0px)' },
];

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
 * Where the separation happens on the rocket that is in the clouds (`before`; `after`: once the
 * part is off), in its drawing's px, and how far the part must fall to leave the screen (its upper
 * end below the bottom: the rocket hovers with its nose `drift` above its place) and how far the
 * screen's left edge is from the mechanics. Null: nothing comes off.
 */
function separationScene(before: Stack, after: Stack, L: WidgetLayout, top: number, extra: number): SeparationScene | null {
  const off = dropBetween(before, after);
  if (!off) return null;
  const g = stackGeometry({ width: L.frame, ...before });
  const seg = g.segments[0];
  const b = g.boosters;
  if (off === 'boosters' && !b) return null;
  const [from, to] = off === 'segment' || !b ? [seg.start, seg.end] : [b.x0, b.x1];
  // the latch: the segment's ring, or where the boosters' cones begin
  const joint = off === 'segment' ? seg.end : to - Math.min(1.9 * (b?.shape.h ?? 8), 0.45 * (to - from));
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const k = Math.min(0.52 * vh, 544) / L.g.W;
  const upperEnd = (top / 100) * vh - cloudDriftPx(extra) + (g.tip - to) * k;
  return {
    g,
    piece: off === 'segment' ? `seg-${before.first}` : 'boosters',
    joint,
    part: joint - Math.max(40, (to - from) * 0.55),
    edge: off === 'segment' ? SHIP.F : (b?.shape.upper.y ?? SHIP.STROKE / 2),
    tail: stackGeometry({ width: L.frame, ...after }).xe,
    fall: Math.max(150, Math.round((vh - upperEnd) / k + 30)),
    off: Math.round((railLeft(vw) * vw) / k + MECHANIC.W + 24),
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
    playSfx('separate');
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

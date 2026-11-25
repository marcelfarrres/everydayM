'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { FlameDrawing, RocketShip, flameBox } from '@/components/workout/RocketShip';
import { endFrame, endShip } from '@/components/workout/endRocket';
import { getMusicEngine } from '@/lib/audio/music';
import { playSfx, startSfxLoop, stopAllSfx, type SfxLoopStop } from '@/lib/audio/sfx';
import type { Exercise, RoutineItem, RoutineMeta } from '@/types/workout';
import { CHROME, LIST, fitList, isCompact, type ListFit } from './endLayout';
import { flyInKeyframes, poseTransform, restPose, type FlightBox } from './endFlight';
import {
  END,
  endGroups,
  endStateAt,
  endTimeline,
  finalEndState,
  rocketAt,
  sameEndState,
  stagesOf,
  type EndGroup,
  type EndState,
  type EndTimeline,
} from './endSequence';
import type { StepState } from './model';
import { plural } from './model';
import { FOCUS, PRESSABLE } from './ui';

/*
 * The end of the routine on a phone (the computer keeps EndScreen). The music fades out and a drum
 * roll starts; the rocket flies in as it ended (the nose and one stage) and parks at the top;
 * under it every exercise of the routine, in colour. Part by part, in the order they were done,
 * the exercises are crossed off and turn black and white, and each part's piece joins the rocket
 * with a "pam" (the boosters for the warm-up, the stage it arrived with for the first block, a new
 * stage at the tail for each other block), the last one on the drum's hit, with "¡Hecho!". Then the
 * finished rocket flies round the screen, in and out of it, until the screen is left.
 *
 * One clock: everything is read from the time since the screen opened (endSequence), on each
 * animation frame, so a page that was hidden comes back to the right moment; a sound whose moment
 * has long gone stays silent. With reduced motion it opens on the end: the list crossed off, the
 * rocket complete and still.
 */

/** A sound comes only on time: one due longer ago than this stays silent. */
const LATE_MS = 250;

export function PhoneEndScreen({
  meta,
  queue,
  reduced,
  onRepeat,
  onExit,
}: {
  meta: RoutineMeta;
  queue: RoutineItem[];
  reduced: boolean;
  onRepeat?: () => void;
  onExit: () => void;
}) {
  const groups = useMemo(() => endGroups(queue), [queue]);
  const tl = useMemo(() => endTimeline(groups.map((g) => g.exercises.length)), [groups]);
  const [state, setState] = useState<EndState>(() => (reduced ? finalEndState(tl) : endStateAt(tl, 0)));
  const shown = reduced ? finalEndState(tl) : state;

  const minutes = Math.max(1, Math.round(meta.totalSeconds / 60));
  const series = queue.filter((q) => q.kind === 'workout').length;

  // ---- sizes: the screen, where the rocket parks, the list's room (measured, so it is exact)
  const root = useRef<HTMLDivElement>(null);
  const slot = useRef<HTMLDivElement>(null);
  const listBox = useRef<HTMLDivElement>(null);
  const titleZone = useRef<HTMLDivElement>(null);
  const buttons = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ vw: number; vh: number; parkY: number; listW: number; listH: number; bandTop: number; bandBottom: number } | null>(null);
  useLayoutEffect(() => {
    const r = root.current;
    const s = slot.current;
    const l = listBox.current;
    const tz = titleZone.current;
    const bt = buttons.current;
    if (!r || !s || !l || !tz || !bt) return;
    const measure = () => {
      const next = {
        vw: r.clientWidth,
        vh: r.clientHeight,
        parkY: s.offsetTop + s.offsetHeight / 2,
        listW: l.clientWidth,
        listH: l.clientHeight,
        // the flight round the screen stays between the praise line and the buttons
        bandTop: tz.offsetTop + tz.offsetHeight + 6,
        bandBottom: bt.offsetTop - 6,
      };
      setSize((prev) => (prev && Object.entries(next).every(([k, v]) => prev[k as keyof typeof prev] === v) ? prev : next));
    };
    // (a ResizeObserver reports once at once, before the first paint, and again on any change)
    const ro = new ResizeObserver(measure);
    for (const el of [r, s, l, tz, bt]) ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const compact = size ? isCompact(size.vh) : false;
  const fit = useMemo(
    () => (size ? fitList(size.listW, size.listH, groups.map((g) => ({ label: g.label, count: g.exercises.length }))) : null),
    [size, groups],
  );

  // ---- the rocket: its frame for the screen, and what is on at this moment
  const total = stagesOf(groups);
  const frame = endFrame(size?.vw ?? 390, total).frame;
  const now = rocketAt(groups, shown.joined);
  const { g, shift } = useMemo(() => endShip(frame, total, now.stages, now.boosters), [frame, total, now.stages, now.boosters]);
  // each stage carries the lines of its block's series, all done (the stage it arrived with is block 1's)
  const hilo = useMemo(() => {
    const blocks = groups.filter((gr) => gr.piece !== 'boosters');
    return Array.from({ length: total }, (_, s): StepState[] => Array(blocks[total - s - 1]?.exercises.length ?? 0).fill('done'));
  }, [groups, total]);
  const box: FlightBox | null = size
    ? { vw: size.vw, vh: size.vh, park: { x: size.vw / 2, y: size.parkY }, len: frame, H: g.H, band: { top: size.bandTop, bottom: size.bandBottom } }
    : null;
  const boxRef = useRef<FlightBox | null>(null);
  useLayoutEffect(() => {
    boxRef.current = box;
  });

  // ---- the one clock
  const start = useRef<number | null>(null);
  const flight = useRef<HTMLDivElement>(null);
  const arrive = useRef<HTMLDivElement>(null);
  const ship = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    start.current = performance.now();
  }, []);
  useEffect(() => {
    if (reduced) return;
    const t0 = start.current ?? performance.now();
    let last = endStateAt(tl, 0);
    let roll: SfxLoopStop | null = null;
    const stopRoll = () => {
      roll?.();
      roll = null;
    };
    let raf = 0;
    const frameTick = () => {
      const t = performance.now() - t0;
      const s = endStateAt(tl, t);
      // the drum roll: on from its moment to the hit (and only while the page is seen), growing
      const visible = document.visibilityState === 'visible';
      if (roll && (!s.rolling || !visible)) stopRoll();
      if (!roll && s.rolling && visible) roll = startSfxLoop('drumRoll', { intensity: rollIntensity(tl, t) });
      else if (roll && s.crossed !== last.crossed) roll.setIntensity(rollIntensity(tl, t));
      // each piece lands with its sound, the last one with the drum's hit
      if (s.landed > last.landed) {
        const i = s.landed - 1;
        if (t - tl.groups[i].impactAt <= LATE_MS) playSfx(i === tl.groups.length - 1 ? 'drumHit' : groups[i].piece === 'pulse' ? 'clack' : 'pam');
      }
      if (!sameEndState(s, last)) {
        last = s;
        setState(s);
      }
      // the flight round the screen
      const el = flight.current;
      const b = boxRef.current;
      if (el && b && s.resting) el.style.transform = poseTransform(restPose(t - tl.restAt, b), b.park);
      else if (el?.style.transform) el.style.transform = '';
      raf = requestAnimationFrame(frameTick);
    };
    raf = requestAnimationFrame(frameTick);
    const onHidden = () => {
      if (document.visibilityState === 'hidden') stopRoll();
    };
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onHidden);
      stopRoll();
    };
  }, [tl, groups, reduced]);

  // The music fades out for good (the drums play alone); a new routine brings it back. Leaving the
  // screen, every effect stops.
  useEffect(() => {
    const engine = getMusicEngine();
    engine?.setEnded(true);
    // with reduced motion there is no roll: just the hit, as the screen opens
    if (reduced) playSfx('drumHit');
    return () => {
      stopAllSfx();
      engine?.setEnded(false);
    };
    // (once, as the screen opens)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- what plays once, on its moment: the rocket's way in and the list coming in (by the same
  // clock: if the moment is past they are skipped, if it is under way they join it midway)
  const ready = box !== null && fit !== null;
  useLayoutEffect(() => {
    if (reduced || !ready || !box) return;
    const t0 = start.current ?? performance.now();
    const t = performance.now() - t0;
    const plays: Animation[] = [];
    if (t < END.flyInMs && arrive.current) {
      plays.push(playAt(arrive.current, flyInKeyframes(box), t0, 0, { duration: END.flyInMs, fill: 'backwards' }));
      // (its engine at full on the way in, idling once it has parked)
      const flame = arrive.current.querySelector<HTMLElement>('[data-rocket-flame]');
      if (flame) {
        plays.push(
          playAt(flame, [{ transform: 'scale(1, 1)' }, { transform: 'scale(1, 1)', offset: 0.6 }, { transform: 'scale(0.35, 0.68)' }], t0, 0, {
            duration: END.flyInMs,
            fill: 'backwards',
          }),
        );
      }
    }
    if (t < END.listInAt + END.listInMs && list.current) {
      plays.push(
        playAt(list.current, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], t0, END.listInAt, {
          duration: END.listInMs,
          fill: 'backwards',
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        }),
      );
    }
    return () => plays.forEach((a) => a.cancel());
    // (once, when the screen's size is first known)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // A piece joins: it comes in from where it belongs and lands with a squash, and the whole rocket
  // takes the knock (the creator's assembly); the stage the rocket arrived with pulses instead.
  useLayoutEffect(() => {
    const i = shown.joined - 1;
    const el = ship.current;
    if (reduced || i < 0 || !el) return;
    const t0 = start.current ?? performance.now();
    const joinAt = tl.groups[i].joinAt;
    // (a join already over: the page was hidden or the frames came late; the piece is simply there)
    if (performance.now() - t0 - joinAt > END.joinMs) return;
    const piece = groups[i].piece;
    // the boosters sit on the front stage; a new stage is the tail (g.first); the pulse is the front stage
    const block = piece === 'stage' ? g.first : total;
    const seg = g.segments.find((s) => s.block === block);
    const selector = piece === 'boosters' ? '[data-piece="boosters"]' : `[data-piece="seg-${block}"]`;
    const plays: Animation[] = [];
    el.querySelectorAll<HTMLElement | SVGElement>(selector).forEach((node) => {
      // (the drawing's layers are frame-sized: they turn about the stage's middle; its lines' box, about its own)
      node.style.transformOrigin = node instanceof SVGElement && seg ? `${(seg.start + seg.end) / 2}px ${g.cy}px` : '50% 50%';
      plays.push(playAt(node, joinKeyframes(piece), t0, joinAt, { duration: END.joinMs, fill: 'backwards' }));
    });
    plays.push(
      playAt(
        el,
        [{ transform: 'none' }, { transform: 'translate(1.5px, 1px) scale(1.01, 0.95)', offset: 0.35 }, { transform: 'translate(-1px, 0px)', offset: 0.65 }, { transform: 'none' }],
        t0,
        joinAt + END.impactMs,
        { duration: 240 },
      ),
    );
    return () => plays.forEach((a) => a.cancel());
    // (when a piece starts to join)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown.joined]);

  const titleTone = compact ? 'text-[34px]' : 'text-[44px]';
  const buttonH = compact ? 'h-12' : 'h-14';
  const smooth = (ms: number, what = 'all') => (reduced ? undefined : `${what} ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1)`);

  return (
    <div
      ref={root}
      className="absolute inset-0 flex flex-col overflow-hidden bg-ink text-white"
      style={{
        paddingLeft: CHROME.SIDE,
        paddingRight: CHROME.SIDE,
        paddingTop: `calc(max(${CHROME.TOP_MIN}px, env(safe-area-inset-top)) + ${CHROME.MENU}px)`,
        paddingBottom: `max(${CHROME.BOTTOM_MIN}px, env(safe-area-inset-bottom))`,
      }}
    >
      {/* the rocket's parking place (the rocket itself flies above everything, below) */}
      <div ref={slot} aria-hidden="true" className="shrink-0" style={{ height: CHROME.ROCKET }} />

      <div ref={titleZone} className="flex shrink-0 flex-col justify-end" style={{ height: CHROME.TITLE[compact ? 'compact' : 'normal'] }}>
        <h2
          className={`${titleTone} font-bold leading-none tracking-[-0.04em]`}
          style={{ opacity: shown.title ? 1 : 0, transform: shown.title ? 'none' : 'scale(0.86)', transformOrigin: '0 100%', transition: smooth(420) }}
        >
          ¡Hecho!
        </h2>
        {/* (heights add up to CHROME.TITLE: 44 + 6 + 20 + 2 + 20, compact 34 + 4 + 18 + 18) */}
        <p className={`${compact ? 'mt-1 text-[15px] leading-[18px]' : 'mt-1.5 text-[17px] leading-5'} font-medium tabular-nums text-white/80`}>
          {minutes} min · {plural(meta.rounds, 'bloque', 'bloques')} · {plural(series, 'serie', 'series')}
        </p>
        <p
          className={`${compact ? 'text-[15px] leading-[18px]' : 'mt-0.5 text-[17px] leading-5'} font-semibold`}
          style={{ opacity: shown.praise ? 1 : 0, transform: shown.praise ? 'none' : 'translateY(6px)', transition: smooth(380) }}
        >
          Muy bien. Cohete completo.
        </p>
      </div>

      <div
        ref={listBox}
        className={`relative min-h-0 flex-1 ${fit && !fit.fits && shown.resting ? 'overflow-y-auto' : 'overflow-hidden'}`}
        style={{ marginBlock: CHROME.LIST_GAP[compact ? 'compact' : 'normal'] }}
      >
        <div ref={list} style={{ visibility: fit ? 'visible' : 'hidden' }}>
          {fit && <EndList groups={groups} fit={fit} state={shown} reduced={reduced} />}
        </div>
      </div>

      <div ref={buttons} className="grid shrink-0 grid-cols-2 gap-2" style={{ height: CHROME.BUTTONS[compact ? 'compact' : 'normal'] }}>
        {onRepeat && (
          <button
            type="button"
            onClick={onRepeat}
            className={`flex ${buttonH} items-center justify-center gap-2 rounded-full bg-white text-lg font-semibold text-ink hover:bg-white/85 ${PRESSABLE} ${FOCUS}`}
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" /> Repetir
          </button>
        )}
        <button
          type="button"
          onClick={onExit}
          className={`flex ${buttonH} items-center justify-center rounded-full text-lg font-semibold text-white ring-1 ring-white/70 ring-inset hover:bg-white/15 ${onRepeat ? '' : 'col-span-2'} ${PRESSABLE} ${FOCUS}`}
        >
          Otra rutina
        </button>
      </div>

      {/* THE ROCKET: parked at the top, then round the screen (never in the way of a tap) */}
      {box && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          <div
            ref={flight}
            className="absolute"
            style={{ left: box.park.x - frame / 2, top: box.park.y - g.H / 2, width: frame, height: g.H, transformOrigin: '50% 50%', willChange: shown.resting && !reduced ? 'transform' : undefined }}
          >
            <div ref={arrive} className="absolute inset-0" style={{ transformOrigin: '50% 50%' }}>
              <div className="absolute inset-0" style={{ transform: `translateX(${shift}px)`, transition: smooth(END.joinMs, 'transform') }}>
                {/* (the knock of each join plays on this one, so it never fights the centring above) */}
                <div ref={ship} className="absolute inset-0">
                  <RocketShip
                    g={g}
                    hilo={hilo}
                    className="absolute left-0 top-0"
                    behind={
                      <div
                        data-rocket-flame=""
                        className="absolute"
                        style={{
                          ...flameBox(g),
                          // idling while it is parked (always, with reduced motion), full once it flies round
                          transform: shown.resting && !reduced ? 'scale(1, 1)' : 'scale(0.35, 0.68)',
                          transition: reduced ? undefined : 'transform 500ms ease-out, left 380ms cubic-bezier(0.2, 0.8, 0.2, 1)',
                        }}
                      >
                        <FlameDrawing />
                      </div>
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Plays `keyframes` on `el` from `at` ms on the screen's clock (`t0`, a performance.now() time,
 * which the document timeline shares). Anchored by its start time, not by a delay counted from
 * its first frame: a page whose frames come late (a throttled pane, a busy phone) can't push it
 * off the clock the rest of the screen follows.
 */
function playAt(el: Element, keyframes: Keyframe[], t0: number, at: number, options: KeyframeEffectOptions): Animation {
  const animation = el.animate(keyframes, { ...options, delay: 0 });
  animation.startTime = t0 + at;
  return animation;
}

/** How hard the drum rolls at `t`: from a third to full, as the hit comes. */
function rollIntensity(tl: EndTimeline, t: number): number {
  const p = (t - tl.rollAt) / Math.max(1, tl.hitAt - tl.rollAt);
  return Math.min(1, Math.max(0, 0.3 + 0.7 * p));
}

/** A piece coming in: from behind (a stage), from above and below (the boosters), or a pulse (the stage that was there). */
function joinKeyframes(piece: EndGroup['piece']): Keyframe[] {
  if (piece === 'pulse') {
    return [
      { transform: 'none' },
      { transform: 'scale(1.06, 1.12)', offset: 0.45, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
      { transform: 'scale(0.98, 0.94)', offset: 0.62 },
      { transform: 'none' },
    ];
  }
  const from = piece === 'boosters' ? 'scale(1, 1.7)' : 'translate(-38px, -6px)';
  return [
    { transform: from, opacity: 0, easing: 'cubic-bezier(0.3, 0, 0.6, 1)' },
    { transform: 'translate(1px, 1px) scale(1.02, 0.92)', opacity: 1, offset: 0.6, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
    { transform: 'translate(-1px, 0px) scale(1, 1.02)', opacity: 1, offset: 0.8 },
    { transform: 'none', opacity: 1 },
  ];
}

// ---------------------------------------------------------------------------------------------
// The list: each part's label over its photos; crossed off one by one, in black and white.

function EndList({ groups, fit, state, reduced }: { groups: EndGroup[]; fit: ListFit; state: EndState; reduced: boolean }) {
  // (each group's first exercise in the list's order: they are crossed off in that order)
  const firsts = groups.map((_, gi) => groups.slice(0, gi).reduce((sum, g) => sum + g.exercises.length, 0));
  return (
    <ul aria-label="Los ejercicios de hoy" className="flex flex-wrap content-start" style={{ columnGap: LIST.GROUP_GAP, rowGap: LIST.LINE_GAP }}>
      {groups.map((group, gi) => {
        const acked = state.acked > gi;
        return (
          <li key={group.key} style={{ width: fit.widths[gi] }}>
            <p
              className="flex items-center gap-1 text-[11px] font-semibold uppercase leading-none tracking-[0.06em]"
              style={{ height: LIST.LABEL_H, paddingBottom: 5, color: acked ? '#fff' : 'rgb(255 255 255 / 0.55)', transition: reduced ? undefined : 'color 200ms' }}
            >
              <span className="truncate">{group.label}</span>
              <Check
                aria-hidden="true"
                strokeWidth={3}
                className="h-3 w-3 shrink-0"
                style={{ opacity: acked ? 1 : 0, transform: acked ? 'none' : 'scale(0.3)', transition: reduced ? undefined : 'opacity 160ms, transform 260ms cubic-bezier(0.3, 1.6, 0.5, 1)' }}
              />
            </p>
            <ul className="flex flex-wrap" style={{ gap: LIST.GAP }}>
              {group.exercises.map((exercise, ei) => {
                const crossed = state.crossed > firsts[gi] + ei;
                return <Tile key={`${exercise.id}-${ei}`} exercise={exercise} fit={fit} crossed={crossed} reduced={reduced} />;
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}

function Tile({ exercise, fit, crossed, reduced }: { exercise: Exercise; fit: ListFit; crossed: boolean; reduced: boolean }) {
  const { tile, tileH, names } = fit;
  const grey: CSSProperties = {
    filter: crossed ? 'grayscale(1) brightness(0.78)' : 'none',
    transition: reduced ? undefined : `filter ${END.greyMs}ms ease-out`,
  };
  return (
    <li className="relative" style={{ width: tile, height: tileH }}>
      <div className="relative overflow-hidden rounded-[10px] bg-white/10 ring-1 ring-white/20" style={{ width: tile, height: tile }}>
        {exercise.poster_url && (
          // eslint-disable-next-line @next/next/no-img-element -- remote stills of any size, shown small
          <img src={exercise.poster_url} alt="" decoding="async" className="h-full w-full object-cover" style={grey} />
        )}
        {names === 'over' && (
          <span
            className="absolute inset-x-0 bottom-0 line-clamp-2 px-1 pb-0.5 pt-3 text-[10px] font-medium leading-[12px]"
            style={{ background: 'linear-gradient(to top, rgb(0 0 0 / 0.85), transparent)', color: crossed ? 'rgb(255 255 255 / 0.7)' : '#fff' }}
          >
            {exercise.title}
          </span>
        )}
      </div>
      {names === 'below' && (
        <span
          className="mt-[3px] block line-clamp-2 text-[11px] leading-[13px]"
          style={{ color: crossed ? 'rgb(255 255 255 / 0.5)' : 'rgb(255 255 255 / 0.85)', transition: reduced ? undefined : 'color 300ms' }}
        >
          {exercise.title}
        </span>
      )}
      <Strike width={tile} height={tileH} on={crossed} reduced={reduced} />
    </li>
  );
}

/** A line struck through a tile by hand: a little curved, rising, past its edges; it draws itself. */
function Strike({ width, height, on, reduced }: { width: number; height: number; on: boolean; reduced: boolean }) {
  const w = width + 8;
  const y = (share: number) => Math.round(height * share * 10) / 10;
  const d = `M2 ${y(0.74)} C${w * 0.24} ${y(0.68)} ${w * 0.4} ${y(0.62)} ${w * 0.55} ${y(0.52)} S${w * 0.84} ${y(0.33)} ${w - 2} ${y(0.27)}`;
  // (hidden until it is struck, so no round cap shows as a dot at its start)
  const dash: CSSProperties = {
    strokeDasharray: 1,
    strokeDashoffset: on ? 0 : 1,
    opacity: on ? 1 : 0,
    transition: reduced ? undefined : `stroke-dashoffset ${END.strikeMs}ms cubic-bezier(0.4, 0, 0.2, 1)`,
  };
  return (
    <svg aria-hidden="true" width={w} height={height} viewBox={`0 0 ${w} ${height}`} className="pointer-events-none absolute -left-1 top-0 overflow-visible" fill="none" strokeLinecap="round">
      <path d={d} pathLength={1} stroke="#131313" strokeOpacity={0.75} strokeWidth={6} style={dash} />
      <path d={d} pathLength={1} stroke="#fff" strokeWidth={2.6} style={dash} />
    </svg>
  );
}

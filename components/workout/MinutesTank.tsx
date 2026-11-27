'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { PAD_COLORS as C } from '@/components/workout/padRocketShape';
import { DAWN } from '@/components/workout/dawnScene';
import {
  HINT_MS,
  LEVEL_MARKS,
  STILL,
  TANK,
  dragMinutes,
  fuelPath,
  hintOffset,
  isStill,
  keyMinutes,
  levelMarks,
  levelY,
  magnet,
  pxPerMinute,
  sloshStep,
  snapMinutes,
  type Slosh,
} from '@/components/workout/tankLevel';
import { creatorSfx } from '@/lib/audio/creatorSfx';

/*
 * The minutes question (phone): an upright white fuel tank on a low stand, its marks 20 · 25 · 30 ·
 * 35 · 40 on its left side, the red fuel up to the minutes chosen, a dark level line with two
 * chevrons, and the value written in the tank just above the level, travelling with it. Drag the
 * level anywhere on the tank (it is heavy: half the finger's travel; it lands on each mark with a
 * click and a light tick); arrow keys too (a slider for assistive tech). On entering it shows that it
 * slides (the level rises and comes back twice, a hand following it), then the chevrons pulse until
 * the first drag. The fuel is a liquid: it sloshes as the level moves and settles flat.
 *
 * The button is the crane's hook (drawn by the scene, hanging in the ring here): «Enganchar».
 *
 * Numbers in tankLevel.ts. One path and a few transforms written per frame, only while something
 * moves; nothing runs at rest.
 */

const RED = C.red;
const COLLAR = 8;
/** the marks' labels on the tank's left, px */
const LABELS = 30;

/** The tank body's own coordinates: its width, and the top and bottom of its inside (between the collars). */
function frame(w: number, h: number) {
  return { x0: LABELS, x1: LABELS + w, top: COLLAR, bottom: h - COLLAR };
}

/**
 * The tank as drawn (the static parts), its fuel and its level as refs to move. `light`: the marks'
 * labels in white (on the dark sky) or ink.
 */
function TankSvg({
  w,
  h,
  minutes,
  light,
  uid,
  fuelRef,
  lineRef,
  valueRef,
  handRef,
  labels = true,
}: {
  w: number;
  h: number;
  minutes: number;
  light: boolean;
  uid: string;
  fuelRef?: RefObject<SVGPathElement | null>;
  lineRef?: RefObject<SVGGElement | null>;
  valueRef?: RefObject<SVGGElement | null>;
  handRef?: RefObject<SVGGElement | null>;
  labels?: boolean;
}) {
  const f = frame(w, h);
  const y = levelY(minutes, f.top, f.bottom);
  const cx = f.x0 + w * 0.42;
  const marks = [20, 25, 30, 35, 40];
  return (
    <svg aria-hidden="true" width={LABELS + w + 2} height={h} viewBox={`0 0 ${LABELS + w + 2} ${h}`} className="block overflow-visible">
      <defs>
        <clipPath id={`${uid}-in`}>
          <rect x={f.x0 + 5} y={f.top + 5} width={w - 10} height={f.bottom - f.top - 10} rx={6} />
        </clipPath>
      </defs>
      {/* the collars, top and bottom */}
      <rect x={f.x0 + 10} y={0} width={w - 20} height={COLLAR + 1} rx={2} fill={C.shadeDark} stroke={C.ink} strokeWidth={1.3} />
      <rect x={f.x0 + 10} y={f.bottom - 1} width={w - 20} height={COLLAR + 1} rx={2} fill={C.shadeDark} stroke={C.ink} strokeWidth={1.3} />
      {/* the body, the fuel, the shade down its right side */}
      <rect x={f.x0} y={f.top} width={w} height={f.bottom - f.top} rx={10} fill={C.hull} />
      <g clipPath={`url(#${uid}-in)`}>
        <path ref={fuelRef} d={fuelPath(f.x0, f.x1, y, f.bottom, STILL)} fill={RED} opacity={0.92} />
      </g>
      <rect x={f.x0 + w * 0.78} y={f.top + 2} width={w * 0.22 - 2} height={f.bottom - f.top - 4} rx={6} fill={C.shade} opacity={0.5} />
      {/* the marks */}
      {marks.map((m) => {
        const my = levelY(m, f.top, f.bottom);
        return (
          <g key={m}>
            <path d={`M${f.x0} ${my}h13`} stroke={C.ink} strokeWidth={1.6} />
            {labels && (
              <text x={f.x0 - 7} y={my + 4.5} textAnchor="end" fill={light ? '#ffffff' : C.ink} style={{ fontSize: 12.5, fontWeight: 600 }}>
                {m}
              </text>
            )}
          </g>
        );
      })}
      <rect x={f.x0} y={f.top} width={w} height={f.bottom - f.top} rx={10} fill="none" stroke={C.ink} strokeWidth={1.8} />
      {/* the level: its line and two chevrons, on the mean level */}
      <g ref={lineRef} style={{ transform: `translateY(${y}px)` }}>
        <path d={`M${f.x0 + 4} 0H${f.x1 - 4}`} stroke={C.ink} strokeWidth={2.4} />
        <path className="tank-chev-up" d={`M${cx - LEVEL_MARKS.half} ${-LEVEL_MARKS.foot}L${cx} ${-LEVEL_MARKS.tip}L${cx + LEVEL_MARKS.half} ${-LEVEL_MARKS.foot}`} stroke={C.ink} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path className="tank-chev-down" d={`M${cx - LEVEL_MARKS.half} ${LEVEL_MARKS.foot}L${cx} ${LEVEL_MARKS.tip}L${cx + LEVEL_MARKS.half} ${LEVEL_MARKS.foot}`} stroke="#ffffff" strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* the value, above the level's ▲ (clear of it and of any crest: levelMarks) */}
      <g ref={valueRef} style={{ transform: `translateY(${y + levelMarks(cx).baseline}px)` }}>
        <text x={cx + 10} y={0} textAnchor="end" fill={C.ink} style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>
          {minutes}
        </text>
        <text x={cx + 13} y={0} fill={C.ink} style={{ fontSize: 10.5, fontWeight: 600 }}>
          min
        </text>
      </g>
      {/* the hint's hand, following the level (only while it shows) */}
      {handRef && (
        <g ref={handRef} style={{ opacity: 0, transform: `translate(${f.x0 + w * 0.62}px, ${y + 6}px)` }}>
          <path
            d="M6 0C7.7 0 9 1.3 9 3V12L10.6 10.6C11.8 9.6 13.6 9.8 14.5 11.1C15.2 12 15.1 13.3 14.4 14.2L9.6 21.6C8.4 23.4 6.4 24.5 4.2 24.5H1C-1.8 24.5 -4 22.3 -4 19.5V12C-4 10.9 -3.1 10 -2 10S0 10.9 0 12V8C0 6.9 0.9 6 2 6S3 6.6 3 7V3C3 1.3 4.3 0 6 0Z"
            fill="#ffffff"
            fillOpacity={0.7}
            stroke={C.ink}
            strokeOpacity={0.45}
            strokeWidth={1}
          />
        </g>
      )}
    </svg>
  );
}

/** The tank as a still drawing (the copy the crane carries): `w` × `h`, at `minutes`, no labels. */
export function TankArt({ w, h, minutes }: { w: number; h: number; minutes: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <div style={{ marginLeft: -LABELS }}>
      <TankSvg w={w} h={h} minutes={minutes} light={false} uid={uid} labels={false} />
    </div>
  );
}

export function MinutesTank({
  value,
  onChange,
  onHook,
  height,
  width,
  light,
  reduced,
  hidden = false,
}: {
  value: number;
  onChange: (minutes: number) => void;
  /** the hook was tapped: `tank` is the tank's own drawing (the crane takes it from there), `button` the ring */
  onHook: (tank: HTMLElement, button: HTMLElement) => void;
  /** the room it has in the column, px */
  height: number;
  width: number;
  /** the sky is still dark: light labels and button text */
  light: boolean;
  reduced: boolean;
  /** the crane has taken it (the scene draws it now) */
  hidden?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rootRef = useRef<HTMLDivElement>(null);
  // as tall as the column allows: the room under the title (measured: the title may wrap)
  const [room, setRoom] = useState(height);
  useLayoutEffect(() => {
    const el = rootRef.current;
    const col = el?.offsetParent;
    if (!el || !(col instanceof HTMLElement)) return;
    const read = () => {
      const pad = parseFloat(getComputedStyle(col).paddingBottom) || 0;
      const free = Math.round(col.clientHeight - el.offsetTop - pad);
      setRoom((r) => {
        const next = Math.min(height, free);
        return Math.abs(next - r) < 1 ? r : next;
      });
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(col);
    return () => ro.disconnect();
  }, [height]);
  const tankW = Math.round(Math.max(62, Math.min(84, width * 0.34)));
  const STAND = 18;
  const tankH = Math.max(170, Math.round(room - STAND));
  const f = frame(tankW, tankH);
  const ppm = pxPerMinute(f.top, f.bottom);
  const ringY = levelY(30, f.top, f.bottom);
  const textAbove = levelMarks(f.x0 + tankW * 0.42).baseline;

  const tankRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fuelRef = useRef<SVGPathElement>(null);
  const lineRef = useRef<SVGGElement>(null);
  const valueRef = useRef<SVGGElement>(null);
  const handRef = useRef<SVGGElement>(null);
  const [shown, setShown] = useState(value);
  const [touched, setTouched] = useState(reduced);
  const [hinting, setHinting] = useState(!reduced);
  const hintingRef = useRef(!reduced);

  // the moving parts, through refs: the level drawn now (y), the slosh, the drag, the hint
  const live = useRef({ y: levelY(value, f.top, f.bottom), slosh: STILL as Slosh, last: 0, hintAt: 0 });
  const drag = useRef<{ id: number; y0: number; start: number; cont: number; mark: number } | null>(null);
  const valueNow = useRef(value);
  const raf = useRef<number | null>(null);
  const frameRef = useRef<((now: number) => void) | null>(null);

  const paint = useCallback(
    (y: number, s: Slosh) => {
      fuelRef.current?.setAttribute('d', fuelPath(f.x0, f.x1, y, f.bottom, s));
      if (lineRef.current) lineRef.current.style.transform = `translateY(${y.toFixed(1)}px)`;
      if (valueRef.current) valueRef.current.style.transform = `translateY(${(y + textAbove).toFixed(1)}px)`;
    },
    [f.x0, f.x1, f.bottom, textAbove],
  );

  const frameFn = useCallback(
    (now: number) => {
      raf.current = null;
      const L = live.current;
      const dt = Math.min(48, now - (L.last || now));
      L.last = now;
      const d = drag.current;
      const hintT = now - L.hintAt;
      const hintOn = !reduced && L.hintAt > 0 && hintT < HINT_MS;
      const want = d ? levelY(magnet(d.cont), f.top, f.bottom) : levelY(valueNow.current, f.top, f.bottom) + (hintOn ? hintOffset(hintT) : 0);
      const y = d || reduced ? want : L.y + (want - L.y) * (1 - Math.exp(-Math.max(1, dt) / 70));
      const v = dt > 0 ? (y - L.y) / dt : 0;
      L.y = y;
      L.slosh = reduced ? STILL : sloshStep(L.slosh, v, dt);
      paint(y, L.slosh);
      const hand = handRef.current;
      if (hand) {
        hand.style.opacity = hintOn ? '1' : '0';
        hand.style.transform = `translate(${(f.x0 + tankW * 0.62).toFixed(1)}px, ${(y + 6).toFixed(1)}px)`;
      }
      if (L.hintAt > 0 && !hintOn && hintingRef.current) {
        hintingRef.current = false;
        setHinting(false);
      }
      if (d || hintOn || Math.abs(want - y) > 0.2 || !isStill(L.slosh)) raf.current = requestAnimationFrame((t) => frameRef.current?.(t));
    },
    [f.top, f.bottom, f.x0, tankW, paint, reduced, setHinting],
  );
  useLayoutEffect(() => {
    frameRef.current = frameFn;
  }, [frameFn]);
  const kick = useCallback(() => {
    if (raf.current === null) {
      live.current.last = performance.now();
      raf.current = requestAnimationFrame((t) => frameRef.current?.(t));
    }
  }, []);
  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      raf.current = null;
    },
    [],
  );

  // its size changed (measured): the level where it belongs, at once
  useLayoutEffect(() => {
    live.current.y = levelY(valueNow.current, f.top, f.bottom);
    paint(live.current.y, live.current.slosh);
  }, [f.top, f.bottom, paint]);

  // a new value from outside (or its own keys): the level goes there
  useEffect(() => {
    valueNow.current = value;
    if (!drag.current) {
      setShown(value);
      kick();
    }
  }, [value, kick]);

  // on entering: it shows it slides (none with reduced motion)
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => {
      live.current.hintAt = performance.now();
      kick();
    }, 350);
    return () => clearTimeout(t);
  }, [reduced, kick]);

  /** A mark reached: the click, a light tick, the value. */
  const land = (mark: number) => {
    creatorSfx('levelClick');
    try {
      navigator.vibrate?.(6);
    } catch {
      // no haptics: fine
    }
    setShown(mark);
    onChange(mark);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (hidden) return;
    const start = snapMinutes(valueNow.current);
    drag.current = { id: e.pointerId, y0: e.clientY, start, cont: start, mark: start };
    live.current.hintAt = 0;
    setTouched(true);
    hintingRef.current = false;
    setHinting(false);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // fine without
    }
    kick();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    d.cont = dragMinutes(d.start, e.clientY - d.y0, ppm);
    const mark = snapMinutes(d.cont);
    if (mark !== d.mark) {
      d.mark = mark;
      land(mark);
    }
    kick();
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    // it settles on the nearest mark
    valueNow.current = d.mark;
    kick();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next = keyMinutes(valueNow.current, e.key);
    if (next === null) return;
    e.preventDefault();
    setTouched(true);
    live.current.hintAt = 0;
    if (next !== valueNow.current) land(next);
    valueNow.current = next;
    kick();
  };

  const ringX = LABELS + tankW + Math.max(44, (width - LABELS - tankW) / 2);
  return (
    <div ref={rootRef} className="relative" style={{ width, height: tankH + STAND, visibility: hidden ? 'hidden' : undefined }} data-nudge={!touched && !hinting && !reduced ? '' : undefined}>
      <div
        ref={tankRef}
        role="slider"
        tabIndex={0}
        aria-label="Minutos"
        aria-valuemin={TANK.min}
        aria-valuemax={TANK.max}
        aria-valuenow={shown}
        aria-valuetext={`${shown} minutos`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        className="absolute left-0 top-0 cursor-ns-resize touch-none select-none rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
        style={{ width: LABELS + tankW + 2, height: tankH }}
      >
        <div data-tank="" className="absolute top-0" style={{ left: LABELS, width: tankW, height: tankH }} />
        <TankSvg w={tankW} h={tankH} minutes={shown} light={light} uid={uid} fuelRef={fuelRef} lineRef={lineRef} valueRef={valueRef} handRef={handRef} />
      </div>
      {/* its low stand */}
      <svg aria-hidden="true" width={tankW + 20} height={STAND} viewBox={`0 0 ${tankW + 20} ${STAND}`} className="absolute" style={{ left: LABELS - 10, top: tankH }}>
        <rect x={2} y={0} width={tankW + 16} height={7} rx={2} fill={DAWN.plate} stroke={DAWN.steel} strokeWidth={1} />
        <path d={`M${14} 7V${STAND}M${tankW + 6} 7V${STAND}`} stroke={DAWN.steel} strokeWidth={4} />
      </svg>
      {/* the button: the crane's hook hangs in this ring (the scene draws it); «Enganchar» */}
      <button
        ref={buttonRef}
        type="button"
        data-hook-button=""
        disabled={hidden}
        onClick={() => {
          const tank = tankRef.current?.querySelector<HTMLElement>('[data-tank]');
          if (tank && buttonRef.current) onHook(tank, buttonRef.current);
        }}
        className={`absolute flex -translate-x-1/2 -translate-y-1/2 cursor-pointer flex-col items-center gap-1.5 rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 ${light ? 'focus-visible:outline-white' : 'focus-visible:outline-ink'}`}
        style={{ left: ringX, top: ringY + 14 }}
      >
        <span data-hook-ring="" className="tank-ring relative block h-14 w-14 rounded-full border-[3px] border-[#f2c230]">
          {/* (reduced motion: the scene's hook does not hang here; a still one instead) */}
          {reduced && (
            <svg aria-hidden="true" viewBox="0 0 13 15" className="absolute left-1/2 top-1/2 h-6 w-5 -translate-x-1/2 -translate-y-1/2">
              <circle cx={6.5} cy={2.4} r={1.9} fill="none" stroke={C.ink} strokeWidth={1.3} />
              <path d="M6.5 4.3V9.2Q6.5 14.2 10 13.6Q12.4 13.1 12 9.8" fill="none" stroke={C.ink} strokeWidth={1.6} strokeLinecap="round" />
            </svg>
          )}
        </span>
        <span className={`text-[15px] font-semibold ${light ? 'text-white' : 'text-ink'}`}>Enganchar</span>
      </button>
    </div>
  );
}

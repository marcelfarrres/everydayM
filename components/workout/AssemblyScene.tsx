'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useReducedMotion } from 'motion/react';
import { PAD_COLORS as C } from '@/components/workout/padRocketShape';
import { DAWN, RoadCars, RoadLamp, Skyline, SteelTower } from '@/components/workout/dawnScene';
import { RocketPiece } from '@/components/workout/AssemblyRocket';
import { PortholePerson, type Outfit } from '@/components/workout/PortholePerson';
import { Mechanic, MECHANIC } from '@/components/workout/player/Mechanic';
import { useTextMeasure } from '@/components/workout/textMeasure';
import {
  PIECES,
  QUICK,
  SKY_MS,
  SKY_STEPS,
  TAKEOFF,
  TRUCK,
  assemblyLayout,
  liftFor,
  padHull,
  skyInk,
  truckTimeline,
  zoomLines,
  type AssemblyLayout,
  type FitMode,
  type PieceId,
} from '@/components/workout/assembly';
import { playSfx } from '@/lib/audio/sfx';

/*
 * The creator's questions (phone), in the dawn of the start screen's base: the questions on the
 * left, and on the right the routine's rocket being built standing on its pad, held by the crane
 * of a dark steel lattice tower. Top down: the nose with its window (there from the first moment,
 * at its final height), then the minutes, the blocks and the engine. Each answered piece comes on
 * a flatbed truck along the road; its scissor lift raises it under the piece above, two mechanics
 * bolt it (sparks, a clack) and the truck drives off. Known pieces go on quickly in their turn.
 * The sky climbs a step with every piece; the big porthole at the top is the rocket's own window
 * seen close up (two dashed zoom lines join them), with a little person getting ready inside.
 *
 * The finale (`finale: 'launch'`): the porthole shrinks back into the window, the crane lets go
 * and pulls its arm into the tower, ignition, lift-off (`onLiftOff`: the page covers it in smoke).
 *
 * Numbers in assembly.ts. Moving things: transforms and opacity only (Web Animations, cancelled
 * once done, so nothing holds the parked rocket); React renders only when a piece goes on.
 */

interface AssemblySceneProps {
  /** how many pieces may be on (1: only the nose … 4: the whole rocket) */
  target: number;
  /** how each piece goes on */
  modes: Record<PieceId, FitMode>;
  /** what is written on each piece */
  labels: Record<PieceId, string>;
  /** the sky's step, 0 (dawn) to 3 (full day) */
  sky: number;
  outfit: Outfit;
  /** `launch`: take off now */
  finale: 'none' | 'read' | 'launch';
  /** all four pieces are on (and bolted) */
  onAssembled: () => void;
  /** the rocket lifts off: where its pad is on the screen */
  onLiftOff: (pad: { x: number; y: number }) => void;
  /** the left column: the questions (or the finale's sentence); `ink`: dark text (the sky is light) */
  children: (L: AssemblyLayout, ink: boolean) => ReactNode;
}

type Moving = { piece: PieceId; mode: FitMode };

const EASE_DRIVE = 'cubic-bezier(0.25, 0.7, 0.3, 1)';
const EASE_LIFT = 'cubic-bezier(0.45, 0, 0.3, 1)';
const STEEL = DAWN.steel;

export function AssemblyScene({ target, modes, labels, sky, outfit, finale, onAssembled, onLiftOff, children }: AssemblySceneProps) {
  const reduced = useReducedMotion() ?? false;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rootRef = useRef<HTMLDivElement>(null);
  const measure = useTextMeasure(rootRef);
  const [size, setSize] = useState<{ w: number; h: number; top: number; bottom: number } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const probe = root.querySelector<HTMLElement>('[data-safe-probe]');
    const read = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w === 0 || h === 0) return;
      const cs = probe ? getComputedStyle(probe) : null;
      const top = cs ? parseFloat(cs.paddingTop) || 0 : 0;
      const bottom = cs ? parseFloat(cs.paddingBottom) || 0 : 0;
      setSize((s) => (s && s.w === w && s.h === h && s.top === top && s.bottom === bottom ? s : { w, h, top, bottom }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const L = useMemo(() => {
    if (!size) return null;
    const T = padHull(size.w, size.h, size.bottom);
    return assemblyLayout(size.w, size.h, T, size.top, size.bottom);
  }, [size]);

  // ── the pieces going on, one at a time ───────────────────────────────────────────────────
  const [placed, setPlaced] = useState(() => Math.max(1, Math.min(PIECES.length, target)));
  const [moving, setMoving] = useState<Moving | null>(null);
  const [bolting, setBolting] = useState(false);
  const shownPlaced = reduced ? Math.max(placed, target) : placed;
  const targetRef = useRef(target);
  const modesRef = useRef(modes);
  const placedRef = useRef(placed);
  const layoutRef = useRef(L);
  useLayoutEffect(() => {
    targetRef.current = target;
    modesRef.current = modes;
    layoutRef.current = L;
  });

  const alive = useRef(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    alive.current = true;
    const list = timers.current;
    return () => {
      alive.current = false;
      list.forEach(clearTimeout);
    };
  }, []);
  const sleep = useCallback(
    (ms: number) =>
      new Promise<void>((resolve) => {
        timers.current.push(setTimeout(resolve, Math.max(0, ms)));
      }),
    [],
  );
  // a piece set moving is on the page (its element exists) once React has committed it
  const committed = useRef<(() => void) | null>(null);
  const onPage = () => new Promise<void>((resolve) => {
    committed.current = resolve;
  });

  const flyRef = useRef<HTMLDivElement>(null);
  const truckRef = useRef<HTMLDivElement>(null);
  const liftRef = useRef<SVGGElement>(null);
  const scissorRef = useRef<SVGGElement>(null);
  const sparksRef = useRef<HTMLDivElement>(null);
  const [truckLift, setTruckLift] = useState(0);

  const spark = () => {
    const box = sparksRef.current;
    if (!box) return;
    box.querySelectorAll<HTMLElement>('[data-spark]').forEach((s, i) =>
      s.animate(
        [
          { opacity: 0, transform: 'scale(0.3)' },
          { opacity: 1, transform: 'scale(1.1)', offset: 0.3 },
          { opacity: 0, transform: 'scale(0.8)' },
        ],
        { duration: 260, delay: i * 40, easing: 'ease-out' },
      ),
    );
  };

  const place = () => {
    placedRef.current += 1;
    setPlaced(placedRef.current);
    setMoving(null);
  };

  const fitPiece = async (piece: PieceId, mode: FitMode) => {
    const Lx = layoutRef.current;
    if (!Lx) return;
    const lift = liftFor(Lx, piece);
    setTruckLift(lift);
    const shown = onPage();
    setMoving({ piece, mode });
    await shown;
    const fly = flyRef.current;
    if (!alive.current || !fly) return;

    if (mode === 'quick') {
      fly.animate([{ transform: `translateY(${Math.round(Lx.pieces[piece].len * 0.5)}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], {
        duration: QUICK.riseMs,
        easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
        fill: 'both',
      });
      await sleep(QUICK.riseMs);
      if (!alive.current) return;
      spark();
      playSfx('clack');
      await sleep(QUICK.boltMs);
      if (!alive.current) return;
      place();
      await sleep(QUICK.gapMs);
      return;
    }

    const truck = truckRef.current;
    const platform = liftRef.current;
    const scissor = scissorRef.current;
    if (!truck || !platform || !scissor) {
      place();
      return;
    }
    const tl = truckTimeline();
    const inFrom = -(Lx.truck.stopLeft + Lx.truck.width + 16);
    const outTo = Lx.W - Lx.truck.stopLeft + 16;
    truck.style.visibility = 'visible';
    const drive = truck.animate([{ transform: `translateX(${inFrom}px)` }, { transform: 'translateX(0px)' }], { duration: TRUCK.driveInMs, easing: EASE_DRIVE, fill: 'both' });
    fly.animate(
      [
        { transform: `translate(${inFrom}px, ${lift}px)`, easing: EASE_DRIVE },
        { transform: `translate(0px, ${lift}px)`, offset: TRUCK.driveInMs / (TRUCK.driveInMs + TRUCK.liftMs), easing: EASE_LIFT },
        { transform: 'translate(0px, 0px)' },
      ],
      { duration: TRUCK.driveInMs + TRUCK.liftMs, fill: 'both' },
    );
    const up = { delay: TRUCK.driveInMs, duration: TRUCK.liftMs, easing: EASE_LIFT, fill: 'both' as const };
    const raise = platform.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${-lift}px)` }], up);
    const open = scissor.animate([{ transform: 'scaleY(0.04)' }, { transform: 'scaleY(1)' }], up);

    await sleep(tl.dockAt);
    if (!alive.current) return;
    playSfx('towerDock');
    setBolting(true);
    await sleep(tl.bolts[0] - tl.dockAt);
    if (!alive.current) return;
    spark();
    playSfx('clack');
    await sleep(tl.bolts[1] - tl.bolts[0]);
    if (!alive.current) return;
    spark();
    playSfx('clack');
    await sleep(tl.placedAt - tl.bolts[1]);
    if (!alive.current) return;
    place();
    setBolting(false);

    // the lift comes down and the truck drives off
    const down = { duration: TRUCK.lowerMs, easing: EASE_LIFT, fill: 'both' as const };
    const lower = platform.animate([{ transform: `translateY(${-lift}px)` }, { transform: 'translateY(0px)' }], down);
    const close = scissor.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.04)' }], down);
    const away = truck.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${outTo}px)` }], {
      delay: TRUCK.lowerMs,
      duration: TRUCK.driveOutMs,
      easing: 'cubic-bezier(0.5, 0, 0.75, 0.6)',
      fill: 'both',
    });
    await sleep(tl.endAt - tl.placedAt);
    truck.style.visibility = 'hidden';
    [drive, raise, open, lower, close, away].forEach((a) => a.cancel());
  };
  useLayoutEffect(() => {
    if (!moving || !committed.current) return;
    const done = committed.current;
    committed.current = null;
    done();
  }, [moving]);
  const fitRef = useRef(fitPiece);
  useLayoutEffect(() => {
    fitRef.current = fitPiece;
  });

  // the runner: whenever more may go on, one after another
  const running = useRef(false);
  useEffect(() => {
    if (reduced || !L || running.current || placedRef.current >= target) return;
    running.current = true;
    void (async () => {
      while (alive.current && placedRef.current < targetRef.current && placedRef.current < PIECES.length) {
        const piece = PIECES[placedRef.current];
        await fitRef.current(piece, modesRef.current[piece]);
      }
      running.current = false;
    })();
  }, [target, reduced, L]);

  // the whole rocket is on
  const assembledSent = useRef(false);
  useEffect(() => {
    if (assembledSent.current || shownPlaced < PIECES.length || moving) return;
    assembledSent.current = true;
    onAssembled();
  }, [shownPlaced, moving, onAssembled]);

  // ── the take-off ─────────────────────────────────────────────────────────────────────────
  const stackRef = useRef<HTMLDivElement>(null);
  const portholeRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<SVGSVGElement>(null);
  const cableRef = useRef<SVGGElement>(null);
  const jibRef = useRef<SVGGElement>(null);
  const liftOffRef = useRef(onLiftOff);
  useLayoutEffect(() => {
    liftOffRef.current = onLiftOff;
  });
  useEffect(() => {
    if (finale !== 'launch' || reduced) return;
    const root = rootRef.current;
    const Lx = layoutRef.current;
    if (!root || !Lx) return;
    const anims: Animation[] = [];
    const own: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => own.push(setTimeout(fn, ms));
    const p = Lx.porthole;
    const s = (Lx.window.r + 1.5) / (p.r + Lx.rim);
    const into = `translate(${Lx.window.x - p.x}px, ${Lx.window.y - p.y}px) scale(${s.toFixed(4)})`;
    const ph = portholeRef.current;
    if (ph) {
      anims.push(
        ph.animate(
          [
            { transform: 'none', opacity: 1 },
            { transform: into, opacity: 1, offset: 0.86 },
            { transform: into, opacity: 0 },
          ],
          { duration: TAKEOFF.portholeMs, easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'forwards' },
        ),
      );
    }
    if (zoomRef.current) anims.push(zoomRef.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: TAKEOFF.portholeMs, fill: 'forwards' }));
    at(TAKEOFF.cableAt, () => {
      if (cableRef.current) anims.push(cableRef.current.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.02)' }], { duration: TAKEOFF.cableMs, easing: 'ease-in', fill: 'forwards' }));
    });
    at(TAKEOFF.jibAt, () => {
      const slide = Lx.tower.x + Lx.tower.w / 2 - Lx.jib.x0;
      if (jibRef.current) anims.push(jibRef.current.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${slide}px)` }], { duration: TAKEOFF.jibMs, easing: 'cubic-bezier(0.45, 0, 0.3, 1)', fill: 'forwards' }));
    });
    at(TAKEOFF.igniteAt, () => {
      root.setAttribute('data-ignite', '');
      playSfx('ignite');
    });
    at(TAKEOFF.liftAt, () => {
      playSfx('launch');
      const stack = stackRef.current;
      if (stack) anims.push(stack.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${-(Lx.padTop + 80)}px)` }], { duration: TAKEOFF.liftMs, easing: 'cubic-bezier(0.55, 0, 0.85, 0.4)', fill: 'forwards' }));
      const box = root.getBoundingClientRect();
      liftOffRef.current({ x: box.left + Lx.cx, y: box.top + Lx.padTop });
    });
    return () => {
      own.forEach(clearTimeout);
      anims.forEach((a) => a.cancel());
      root.removeAttribute('data-ignite');
    };
  }, [finale, reduced]);

  const step = Math.max(0, Math.min(3, Math.round(sky)));
  const ink = skyInk(step);
  const next = moving?.piece ?? PIECES[Math.min(PIECES.length - 1, shownPlaced)];
  const seamPiece: Exclude<PieceId, 'nose'> = next === 'nose' ? 'minutes' : next;

  return (
    <div ref={rootRef} className="relative isolate h-dvh w-full overflow-hidden select-none" data-sky={step}>
      <div data-safe-probe="" aria-hidden="true" className="pointer-events-none invisible absolute h-0 w-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" />
      {L && (
        <>
          <Backdrop L={L} step={step} uid={uid} reduced={reduced} />
          <Crane L={L} uid={uid} jibRef={jibRef} cableRef={cableRef} />
          {/* the mechanics' platform on the tower, at the seam being bolted */}
          <MechanicsPlatform L={L} y={L.platform[seamPiece]} bolting={bolting} reduced={reduced} />
          <Truck L={L} lift={truckLift} truckRef={truckRef} liftRef={liftRef} scissorRef={scissorRef} />
          {/* the piece on its way (on the truck, or sliding up into place) */}
          {moving && (
            <div ref={flyRef} className="pointer-events-none absolute inset-0 z-[12]">
              <RocketPiece piece={moving.piece} L={L} label={labels[moving.piece]} measure={measure} />
            </div>
          )}
          {/* the rocket: what is on, and the dashed outlines of what is to come */}
          <div ref={stackRef} className="pointer-events-none absolute inset-0 z-[13]">
            <div className="asm-shake absolute inset-0">
              {PIECES.map((piece, i) =>
                i < shownPlaced ? (
                  <RocketPiece key={piece} piece={piece} L={L} label={labels[piece]} measure={measure} />
                ) : moving?.piece === piece ? null : (
                  <RocketPiece key={piece} piece={piece} L={L} label="" measure={measure} ghost ghostLight={!ink} />
                ),
              )}
            </div>
          </div>
          {/* sparks at the seam being bolted, either side */}
          <div ref={sparksRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[15]">
            {[-1, 1].map((side) => (
              <div
                key={side}
                data-spark=""
                className="absolute opacity-0"
                style={{ left: L.cx + side * (L.T / 2 + 2) - 9, top: L.pieces[seamPiece].top - 9, width: 18, height: 18 }}
              >
                <Spark />
              </div>
            ))}
          </div>
          <PadSmoke L={L} />
          {/* the big porthole: the rocket's own window seen close up */}
          <ZoomLines L={L} light={!ink} zoomRef={zoomRef} reduced={reduced} />
          <div
            ref={portholeRef}
            aria-hidden="true"
            className="pointer-events-none absolute z-[18]"
            style={{ left: L.porthole.x - L.porthole.r - L.rim, top: L.porthole.y - L.porthole.r - L.rim, width: 2 * (L.porthole.r + L.rim), height: 2 * (L.porthole.r + L.rim) }}
          >
            <PortholeFrame r={L.porthole.r} rim={L.rim}>
              <PortholePerson outfit={outfit} transition={reduced ? 'cut' : 'walk'} />
            </PortholeFrame>
          </div>
          {/* the questions (or the sentence), on the left */}
          <div
            className="absolute z-20 overflow-y-auto overflow-x-hidden px-[14px] pb-4 [scrollbar-width:none]"
            style={{ left: L.column.left - 14, top: L.column.top, width: L.column.right - L.column.left + 28, bottom: L.H - L.cambiarTop - 44 }}
          >
            {children(L, ink)}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The pieces of the scene

const fade = (reduced: boolean) => (reduced ? 'none' : `opacity ${SKY_MS}ms ease-in-out`);
const tween = (reduced: boolean, what = 'transform') => (reduced ? 'none' : `${what} ${SKY_MS}ms ease-in-out`);

/** The sky (a layer per step, faded in over the one before), the sun, the skyline, the ground, the road, the pad. */
function Backdrop({ L, step, uid, reduced }: { L: AssemblyLayout; step: number; uid: string; reduced: boolean }) {
  const { W, H, horizon: hz, road } = L;
  const k = W / 320;
  const q = road.h / 20;
  const s = SKY_STEPS[step];
  const sun = L.suns[step];
  const deckL = L.cx - 1.5 * L.T;
  const deckR = L.tower.x + L.tower.w + 4;
  const u = L.T / 36;
  return (
    <svg aria-hidden="true" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 z-0">
      <defs>
        {SKY_STEPS.map((st, i) => (
          <linearGradient key={i} id={`${uid}-sky${i}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={hz + 1}>
            {st.sky.map(([at, c]) => (
              <stop key={`${at}`} offset={at} stopColor={c} />
            ))}
          </linearGradient>
        ))}
        <radialGradient id={`${uid}-glow`}>
          <stop offset={0} stopColor={DAWN.glow} stopOpacity={0.75} />
          <stop offset={1} stopColor={DAWN.glow} stopOpacity={0} />
        </radialGradient>
        <clipPath id={`${uid}-sky-clip`}>
          <rect width={W} height={hz + 1} />
        </clipPath>
      </defs>
      {SKY_STEPS.map((_, i) => (
        <rect key={i} width={W} height={hz + 1} fill={`url(#${uid}-sky${i})`} style={{ opacity: i === 0 || step >= i ? 1 : 0, transition: fade(reduced) }} />
      ))}
      {/* the sun climbs a step with every piece */}
      <g clipPath={`url(#${uid}-sky-clip)`}>
        <g style={{ transform: `translate(${sun.x}px, ${sun.y}px)`, transition: tween(reduced) }}>
          <circle r={sun.r * 5} fill={`url(#${uid}-glow)`} style={{ opacity: s.glow, transition: fade(reduced) }} />
          <circle r={sun.r} style={{ fill: s.sun, transition: tween(reduced, 'fill') }} />
        </g>
      </g>
      {/* two thin lit clouds while it is still dawn */}
      <g style={{ opacity: step <= 1 ? 1 : 0, transition: fade(reduced) }}>
        <path d={`M${0.47 * W} ${Math.round(hz * 0.72)}q${0.16 * W} ${-5 * k} ${0.35 * W} ${-1 * k}v${5 * k}q${-0.2 * W} ${4 * k} ${-0.35 * W} ${1 * k}z`} fill={DAWN.cloud} opacity={0.38} />
        <path d={`M0 ${Math.round(hz * 0.8)}q${0.09 * W} ${-3 * k} ${0.19 * W} 0q${-0.06 * W} ${3 * k} ${-0.19 * W} ${3 * k}z`} fill={DAWN.cloud} opacity={0.3} />
      </g>
      {/* the far skyline, sliding a little with every step (two copies: no end shows) */}
      <g style={{ transform: `translateX(${L.skylineShift[step]}px)`, transition: tween(reduced) }}>
        <Skyline W={W} hz={hz} k={k} style={{ fill: s.land, transition: tween(reduced, 'fill') }} />
        <g transform={`translate(${W} 0)`}>
          <Skyline W={W} hz={hz} k={k} style={{ fill: s.land, transition: tween(reduced, 'fill') }} />
        </g>
      </g>
      {/* the ground, the road, the pad and the strip in front */}
      <rect y={hz} width={W} height={H - hz} style={{ fill: s.ground, transition: tween(reduced, 'fill') }} />
      <rect y={road.top} width={W} height={road.h} style={{ fill: s.road, transition: tween(reduced, 'fill') }} />
      <path d={`M0 ${road.top}H${W}M0 ${road.top + road.h}H${W}`} stroke={DAWN.roadEdge} strokeOpacity={0.7} strokeWidth={0.8} />
      <path d={`M0 ${road.top + road.h / 2}H${W}`} stroke={DAWN.roadLine} strokeOpacity={0.55} strokeWidth={1} strokeDasharray={`${9 * q} ${8 * q}`} />
      <RoadLamp x={Math.round(0.1 * W)} top={road.top} q={q} lit={s.lamps} />
      <RoadLamp x={Math.round(0.42 * W)} top={road.top} q={q} lit={s.lamps} />
      <RoadCars W={W} top={road.top} q={q} />
      <g stroke={STEEL} strokeWidth={1.1} fill={DAWN.plate}>
        <rect x={deckL} y={L.padTop} width={deckR - deckL} height={Math.max(5, 6 * u)} rx={1.5} />
        <path d={`M${deckL + 4} ${L.padTop + Math.max(2.5, 3 * u)}H${deckR - 4}`} stroke={DAWN.hazard} strokeWidth={1.6} strokeDasharray="6 6" opacity={0.7} />
      </g>
      <rect y={L.foreTop} width={W} height={H - L.foreTop} style={{ fill: s.fore, transition: tween(reduced, 'fill') }} />
    </svg>
  );
}

/**
 * The steel: the lattice tower beside the rocket, its mast, the counter-jib with its weight, the
 * operator's cab, and the jib over the rocket with its trolley and the cable down to the antenna.
 * The jib slides into the tower before lift-off (clipped there): the rocket climbs through clear sky.
 */
function Crane({ L, uid, jibRef, cableRef }: { L: AssemblyLayout; uid: string; jibRef: RefObject<SVGGElement | null>; cableRef: RefObject<SVGGElement | null> }) {
  const { W, H, tower: t, jib, cable } = L;
  const u = L.T / 36;
  const mastX = t.x + t.w / 2;
  const mastTop = jib.y - Math.round(24 * u);
  const y0 = jib.y;
  const y1 = jib.y + jib.h;
  let zig = '';
  const bay = Math.max(9, Math.round(jib.h * 1.4));
  for (let x = jib.x0; x < t.x + t.w; x += bay) zig += `M${x} ${y1}L${x + bay / 2} ${y0}L${x + bay} ${y1}`;
  let counter = '';
  for (let x = t.x + t.w; x < W; x += bay) counter += `M${x} ${y1}L${x + bay / 2} ${y0}L${x + bay} ${y1}`;
  const hook = Math.max(2.4, 3 * u);
  return (
    <svg aria-hidden="true" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 z-[5]" style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id={`${uid}-jib`}>
          <rect x={-20} y={0} width={mastX + 20} height={H} />
        </clipPath>
      </defs>
      <SteelTower x={t.x} w={t.w} top={t.top} bottom={t.bottom} />
      {/* the mast and its ties to the counter-jib */}
      <path d={`M${mastX} ${t.top - 6}V${mastTop}M${mastX} ${mastTop}L${W - 4} ${y0}`} stroke={STEEL} strokeWidth={1.3} fill="none" />
      {/* the counter-jib and its weight */}
      <g stroke={STEEL} strokeWidth={1.4} fill="none">
        <path d={`M${t.x + t.w} ${y0}H${W + 2}M${t.x + t.w} ${y1}H${W + 2}${counter}`} />
      </g>
      <rect x={W - Math.round(22 * u)} y={y1} width={Math.round(18 * u)} height={Math.round(14 * u)} fill={DAWN.plate} stroke={STEEL} strokeWidth={1} />
      {/* the jib, over the rocket: slides into the tower before lift-off */}
      <g clipPath={`url(#${uid}-jib)`}>
        <g ref={jibRef}>
          <path d={`M${jib.x0} ${y0}H${mastX}M${jib.x0} ${y1}H${mastX}${zig}`} stroke={STEEL} strokeWidth={1.4} fill="none" />
          <circle cx={jib.x0 + 1} cy={(y0 + y1) / 2} r={5 * u} fill={C.red} opacity={0.25} />
          <circle cx={jib.x0 + 1} cy={(y0 + y1) / 2} r={Math.max(1.6, 2 * u)} fill={C.red} />
          {/* the trolley, and the cable down to the hook on the antenna (pulled up before the jib goes) */}
          <rect x={cable.x - 8 * u} y={y1} width={16 * u} height={5 * u} fill={DAWN.plate} stroke={STEEL} strokeWidth={1} />
          <g ref={cableRef} style={{ transformOrigin: `${cable.x}px ${y1 + 5 * u}px` }}>
            <path d={`M${cable.x} ${y1 + 5 * u}V${cable.bottom - hook}`} stroke={C.ink} strokeWidth={1.2} />
            <circle cx={cable.x} cy={cable.bottom - hook / 2} r={hook} fill="none" stroke={C.ink} strokeWidth={1.3} />
          </g>
        </g>
      </g>
      {/* the operator's cab, under the jib at the tower */}
      <rect x={t.x - 0.35 * t.w} y={y1} width={1.3 * t.w} height={0.9 * t.w} rx={2} fill={DAWN.hazard} stroke={C.ink} strokeWidth={1} />
      <rect x={t.x - 0.15 * t.w} y={y1 + 0.18 * t.w} width={0.6 * t.w} height={0.38 * t.w} fill={C.glass} stroke={C.ink} strokeWidth={0.7} />
    </svg>
  );
}

/** The two mechanics on their platform, bolted to the tower, at the seam (their feet at `y`). */
function MechanicsPlatform({ L, y, bolting, reduced }: { L: AssemblyLayout; y: number; bolting: boolean; reduced: boolean }) {
  const k = L.mechanic;
  const w = MECHANIC.W * k;
  const h = MECHANIC.H * k;
  const x0 = Math.round(L.cx - L.T / 2 - 1.15 * w - 6);
  const x1 = L.tower.x + 2;
  const hull = L.T / 2;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-0 top-0 z-[14] w-full"
      data-bolting={bolting ? '' : undefined}
      style={{ transform: `translateY(${y}px)`, transition: reduced ? 'none' : 'transform 450ms cubic-bezier(0.45, 0, 0.3, 1)' }}
    >
      {/* the platform (behind the rocket: drawn in two halves, either side of the hull) */}
      <div className="absolute h-[4px] bg-[#322e2c]" style={{ left: x0, width: L.cx - hull - x0, top: 0, boxShadow: `inset 0 0 0 1px ${STEEL}` }} />
      <div className="absolute h-[4px] bg-[#322e2c]" style={{ left: L.cx + hull, width: x1 - L.cx - hull, top: 0, boxShadow: `inset 0 0 0 1px ${STEEL}` }} />
      <div className="absolute w-[1.5px] bg-[#7a6f69]" style={{ left: x0 + 2, top: -12, height: 12 }} />
      {/* a mechanic either side, facing the rocket */}
      <div className="asm-mech absolute" style={{ left: L.cx - hull - w - 1, top: -h, width: w, height: h }}>
        <div className="absolute left-0 top-0" style={{ width: MECHANIC.W, height: MECHANIC.H, transform: `scale(${k})`, transformOrigin: '0 0' }}>
          <Mechanic id="a" tool="wrench" />
        </div>
      </div>
      <div className="asm-mech absolute" style={{ left: L.cx + hull + 1, top: -h, width: w, height: h }}>
        <div className="absolute left-0 top-0" style={{ width: MECHANIC.W, height: MECHANIC.H, transform: `scale(${k})`, transformOrigin: '0 0' }}>
          <div className="absolute inset-0 -scale-x-100">
            <Mechanic id="b" tool="hammer" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** The flatbed truck with its scissor lift (raised `lift` px at full stretch), hidden until it drives in. */
function Truck({
  L,
  lift,
  truckRef,
  liftRef,
  scissorRef,
}: {
  L: AssemblyLayout;
  lift: number;
  truckRef: RefObject<HTMLDivElement | null>;
  liftRef: RefObject<SVGGElement | null>;
  scissorRef: RefObject<SVGGElement | null>;
}) {
  const { u, bedW, bedTop, wheelY, stopLeft, width } = L.truck;
  const h = wheelY - bedTop;
  const n = 3;
  const xa = 0.2 * bedW;
  const xb = 0.8 * bedW;
  const stage = Math.max(1, lift) / n;
  let scissors = '';
  for (let i = 0; i < n; i++) {
    const a = -i * stage;
    const b = a - stage;
    scissors += `M${xa} ${a}L${xb} ${b}M${xb} ${a}L${xa} ${b}`;
  }
  const wheels = [0.16 * bedW, 0.42 * bedW, bedW + 12 * u];
  return (
    <div ref={truckRef} aria-hidden="true" className="pointer-events-none absolute z-[11]" style={{ left: stopLeft, top: bedTop, width, height: h, visibility: 'hidden' }}>
      <svg width={width} height={h} viewBox={`0 0 ${width} ${h}`} style={{ overflow: 'visible' }}>
        <g ref={scissorRef} style={{ transformOrigin: '0px 0px', transform: 'scaleY(0.04)' }}>
          <path d={scissors} stroke={STEEL} strokeWidth={2} fill="none" vectorEffect="non-scaling-stroke" />
        </g>
        <g ref={liftRef}>
          <rect x={0.06 * bedW} y={-4 * u} width={0.88 * bedW} height={4 * u} fill={DAWN.plate} stroke={STEEL} strokeWidth={1} />
        </g>
        <rect x={-2 * u} y={4 * u} width={bedW + 24 * u} height={4 * u} fill={DAWN.dark} />
        <rect x={0} y={0} width={bedW} height={4.5 * u} fill={DAWN.plate} stroke={STEEL} strokeWidth={1} />
        <path d={`M${bedW} ${6 * u}V${-13 * u}H${bedW + 12 * u}L${bedW + 21 * u} ${-3 * u}V${6 * u}Z`} fill={DAWN.hazard} stroke={C.ink} strokeWidth={1.2} strokeLinejoin="round" />
        <path d={`M${bedW + 4 * u} ${-10 * u}H${bedW + 11 * u}L${bedW + 16.5 * u} ${-4 * u}H${bedW + 4 * u}Z`} fill={C.glass} stroke={C.ink} strokeWidth={0.8} />
        {wheels.map((x) => (
          <g key={x}>
            <circle cx={x} cy={10 * u} r={5 * u} fill={DAWN.dark} stroke={STEEL} strokeWidth={1} />
            <circle cx={x} cy={10 * u} r={1.6 * u} fill={STEEL} />
          </g>
        ))}
      </svg>
    </div>
  );
}

/** A spark of a bolt going in. */
function Spark() {
  return (
    <svg viewBox="-9 -9 18 18" className="h-full w-full overflow-visible">
      <circle r={7} fill="#ffd23f" opacity={0.3} />
      <path d="M-3 -3L-8 -8M3 -3.6L8 -9.6M4.2 0.6L11 1.6M-3.9 1.2L-10 3M0 -4.5V-11M1.8 3L4.8 8" stroke="#ffd23f" strokeWidth={1.8} strokeLinecap="round" />
      <circle r={2.4} fill="#ffffff" />
    </svg>
  );
}

/** Smoke at the pad on ignition (the start screen's puffs: pad-smoke, under [data-ignite]). */
function PadSmoke({ L }: { L: AssemblyLayout }) {
  const { W, H, cx, T, padTop } = L;
  return (
    <svg aria-hidden="true" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 z-[16]">
      {[-1, 1, -1, 1, -1, 1].map((dir, i) => (
        <circle
          key={i}
          className="pad-smoke"
          cx={cx + dir * (T / 2 + 4)}
          cy={padTop - 4 + (i % 3) * 3}
          r={7 + (i % 3) * 2}
          fill={C.hull}
          stroke={C.ink}
          strokeWidth={1}
          style={{ ['--pad-dx' as string]: `${dir * (22 + i * 5)}px`, ['--pad-delay' as string]: `${i * 0.12}s`, transformBox: 'fill-box', transformOrigin: '50% 50%' }}
        />
      ))}
    </svg>
  );
}

/** The two dashed lines from the big porthole down to the rocket's small window, and a ring on it. */
function ZoomLines({ L, light, zoomRef, reduced }: { L: AssemblyLayout; light: boolean; zoomRef: RefObject<SVGSVGElement | null>; reduced: boolean }) {
  const big = { ...L.porthole, r: L.porthole.r + L.rim };
  const small = { ...L.window, r: L.window.r + 2 };
  const lines = zoomLines(big, small);
  const colour = light ? '#ffffff' : C.ink;
  const op = light ? 0.75 : 0.55;
  return (
    <svg ref={zoomRef} aria-hidden="true" width={L.W} height={L.H} viewBox={`0 0 ${L.W} ${L.H}`} className="pointer-events-none absolute inset-0 z-[17]">
      <g style={{ stroke: colour, transition: reduced ? 'none' : `stroke ${SKY_MS}ms ease-in-out` }} strokeOpacity={op} strokeWidth={1.3} fill="none">
        {lines.map(([x1, y1, x2, y2], i) => (
          <path key={i} d={`M${x1} ${y1}L${x2} ${y2}`} strokeDasharray="5 4" />
        ))}
        <circle cx={small.x} cy={small.y} r={small.r} strokeOpacity={Math.min(1, op + 0.2)} strokeWidth={1.4} />
      </g>
    </svg>
  );
}

/** The porthole's steel rim with its rivets, the glass (`children` inside it) and a glint. */
function PortholeFrame({ r, rim, children }: { r: number; rim: number; children: ReactNode }) {
  const R = r + rim;
  const rivets = Array.from({ length: 12 }, (_, i) => (i * Math.PI) / 6);
  return (
    <div className="relative h-full w-full">
      <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} className="absolute inset-0 h-full w-full overflow-visible">
        <circle r={R} fill={DAWN.plate} stroke={STEEL} strokeWidth={2} />
        {rivets.map((a) => (
          <circle key={a} cx={(r + rim / 2) * Math.cos(a)} cy={(r + rim / 2) * Math.sin(a)} r={Math.max(1.2, r * 0.03)} fill={STEEL} />
        ))}
      </svg>
      <div className="absolute overflow-hidden rounded-full" style={{ left: rim, top: rim, width: 2 * r, height: 2 * r }}>
        {children}
      </div>
      <svg viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <circle r={r} fill="none" stroke="#ffffff" strokeOpacity={0.35} strokeWidth={2} />
      </svg>
    </div>
  );
}

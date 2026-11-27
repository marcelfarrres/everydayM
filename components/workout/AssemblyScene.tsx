'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useReducedMotion } from 'motion/react';
import { PAD_COLORS as C } from '@/components/workout/padRocketShape';
import { DAWN, DawnClouds, RoadCars, RoadLamp, Skyline, SteelTower } from '@/components/workout/dawnScene';
import { RocketPiece } from '@/components/workout/AssemblyRocket';
import { PortholePerson, type Outfit } from '@/components/workout/PortholePerson';
import { PortholeFrame, ZoomLinesSvg } from '@/components/workout/PortholeFrame';
import { DressSequence } from '@/components/workout/DressSequence';
import type { NoseSpot } from '@/components/workout/NoseCarry';
import { TankArt } from '@/components/workout/MinutesTank';
import { Mechanic, MECHANIC } from '@/components/workout/player/Mechanic';
import { useTextMeasure } from '@/components/workout/textMeasure';
import {
  BIG_RIM,
  DRESS,
  PIECES,
  PICK,
  QUICK,
  SKY_MS,
  SKY_STEPS,
  TAKEOFF,
  TAKE,
  TRUCK,
  assemblyLayout,
  bigPorthole,
  liftFor,
  padHull,
  pickPoses,
  pickTimeline,
  tankPickPoses,
  TANK_PICK,
  portholeTimeline,
  skyInk,
  takeTimeline,
  truckTimeline,
  type AssemblyLayout,
  type Circle,
  type FitMode,
  type PieceId,
} from '@/components/workout/assembly';
import { creatorSfx, type CreatorCueName } from '@/lib/audio/creatorSfx';

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
 * The ending (`ending`, once the routine is built and its sentence goes up in the column): the
 * porthole comes down, large, to the empty corner where the pieces were, and the last change of
 * clothes plays in it (DressSequence); meanwhile the crane lets go and pulls its arm into the
 * tower; the porthole shrinks back along the zoom lines into the window and the rocket lifts off
 * as it arrives (`onLiftOff`: the page covers it in smoke). Times: portholeTimeline.
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
  /** what he wears in the porthole during the questions (the last change is the ending's) */
  outfit: Outfit;
  /** the ending: the big porthole, the last change of clothes, lift-off (stays true after it) */
  ending: boolean;
  /** all four pieces are on (and bolted) */
  onAssembled: () => void;
  /** the rocket lifts off: where its pad is on the screen */
  onLiftOff: (pad: { x: number; y: number }) => void;
  /**
   * the answer's piece, tapped in the column: its box on the screen and its words. The scene takes
   * that very piece from there (`onTaken`: it draws it now, the column hides its own) onto the
   * truck's lift and up into place.
   */
  take?: Take | null;
  onTaken?: (piece: PieceId) => void;
  /** a piece is on and bolted */
  onFitted?: (piece: PieceId) => void;
  /** the loose pieces of this kind wait in the column to be chosen: the crane's hook drifts over them */
  picking?: PieceId | null;
  /** the typed sentence's nose is still being carried here by the crane (drawn by the page): not drawn yet */
  noseHidden?: boolean;
  /** where the nose hangs, on the screen (for the page's carried nose to land on) */
  onNose?: (spot: NoseSpot) => void;
  /** the left column: the questions (or the finale's sentence); `ink`: dark text (the sky is light) */
  children: (L: AssemblyLayout, ink: boolean) => ReactNode;
}

export type Take = {
  piece: PieceId;
  rect: { left: number; top: number };
  label: string;
  /** the minutes' tank (its size and the minutes in it): the crane takes the tank, which becomes the piece */
  tank?: { w: number; h: number; minutes: number };
};

type Moving = { piece: PieceId; mode: FitMode; from?: { x: number; y: number }; label?: string; tank?: Take['tank'] };

const EASE_DRIVE = 'cubic-bezier(0.25, 0.7, 0.3, 1)';
const EASE_LIFT = 'cubic-bezier(0.45, 0, 0.3, 1)';
const STEEL = DAWN.steel;

export function AssemblyScene({ target, modes, labels, sky, outfit, ending, onAssembled, onLiftOff, take = null, onTaken, onFitted, picking = null, noseHidden = false, onNose, children }: AssemblySceneProps) {
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

  // the sun starts where the start screen had it, and rises a little as the questions open
  const [risen, setRisen] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRisen(true), 60);
    return () => clearTimeout(t);
  }, []);

  const L = useMemo(() => {
    if (!size) return null;
    const T = padHull(size.w, size.h, size.bottom);
    return assemblyLayout(size.w, size.h, T, size.top, size.bottom);
  }, [size]);
  // where the nose hangs, for the page's carried nose
  const onNoseRef = useRef(onNose);
  useLayoutEffect(() => {
    onNoseRef.current = onNose;
  });
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!L || !root) return;
    const b = root.getBoundingClientRect();
    onNoseRef.current?.({ cx: b.left + L.cx, top: b.top + L.pieces.nose.top, len: L.pieces.nose.len, T: L.T });
  }, [L]);

  // ── the pieces going on, one at a time ───────────────────────────────────────────────────
  const [placed, setPlaced] = useState(() => Math.max(1, Math.min(PIECES.length, target)));
  const [moving, setMoving] = useState<Moving | null>(null);
  const [bolting, setBolting] = useState(false);
  const shownPlaced = reduced ? Math.max(placed, target) : placed;
  const targetRef = useRef(target);
  const modesRef = useRef(modes);
  const placedRef = useRef(placed);
  const layoutRef = useRef(L);
  const takeRef = useRef(take);
  const handlers = useRef({ onTaken, onFitted });
  useLayoutEffect(() => {
    targetRef.current = target;
    modesRef.current = modes;
    layoutRef.current = L;
    takeRef.current = take;
    handlers.current = { onTaken, onFitted };
  });
  // the truck is free (the last one has driven off)
  const truckFree = useRef<Promise<void>>(Promise.resolve());

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
  /** A sound `ms` from now (dropped if the scene goes). */
  const cue = (ms: number, name: CreatorCueName) => {
    timers.current.push(
      setTimeout(() => {
        if (alive.current) creatorSfx(name);
      }, Math.max(0, ms)),
    );
  };
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
    creatorSfx('spark');
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

  const place = (piece: PieceId) => {
    placedRef.current += 1;
    setPlaced(placedRef.current);
    setMoving(null);
    handlers.current.onFitted?.(piece);
  };

  /** The answer's piece, from where it was tapped in the column, onto the lift and up into place. */
  const fitTaken = async (piece: PieceId, from: Take) => {
    const Lx = layoutRef.current;
    const root = rootRef.current;
    if (!Lx || !root) return;
    const lift = liftFor(Lx, piece);
    const box = root.getBoundingClientRect();
    const at = { x: from.rect.left - box.left, y: from.rect.top - box.top };
    setTruckLift(lift);
    const shown = onPage();
    setMoving({ piece, mode: 'truck', from: at, label: from.label });
    await shown;
    // (it waits where it was while the last truck is still driving off)
    await truckFree.current;
    const fly = flyRef.current;
    const truck = truckRef.current;
    const platform = liftRef.current;
    const scissor = scissorRef.current;
    if (!alive.current || !fly || !truck || !platform || !scissor) {
      if (alive.current) place(piece);
      return;
    }
    const t = takeTimeline();
    const b = Lx.pieces[piece];
    // lying at `at` (its box len × box), it turns upright and stands on the lift under its place
    const dx = Lx.cx - (at.x + b.len / 2);
    const dy = b.top + b.len / 2 + lift - (at.y + Lx.box / 2);
    const inFrom = -(Lx.truck.stopLeft + Lx.truck.width + 16);
    const outTo = Lx.W - Lx.truck.stopLeft + 16;
    truck.style.visibility = 'visible';
    const drive = truck.animate([{ transform: `translateX(${inFrom}px)` }, { transform: 'translateX(0px)' }], { duration: t.driveIn[1], easing: EASE_DRIVE, fill: 'both' });
    cue(0, 'truckIn');
    cue(t.lift[0], 'liftUp');
    const span = t.lift[1] - t.fly[0];
    const off = (ms: number) => Math.min(1, Math.max(0, (ms - t.fly[0]) / span));
    const travel = fly.animate(
      [
        { transform: 'translate(0px, 0px) rotate(0deg)', easing: 'cubic-bezier(0.4, 0, 0.6, 1)' },
        { transform: `translate(${(dx * 0.5).toFixed(1)}px, ${(dy * 0.5 - 36).toFixed(1)}px) rotate(-50deg)`, offset: off(t.fly[0] + (t.fly[1] - t.fly[0]) * 0.5), easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(-90deg)`, offset: off(t.fly[1]) },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(-90deg)`, offset: off(t.lift[0]), easing: EASE_LIFT },
        { transform: `translate(${dx.toFixed(1)}px, ${(dy - lift).toFixed(1)}px) rotate(-90deg)` },
      ],
      { delay: t.fly[0], duration: span, fill: 'both' },
    );
    const up = { delay: t.lift[0], duration: t.lift[1] - t.lift[0], easing: EASE_LIFT, fill: 'both' as const };
    const raise = platform.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${-lift}px)` }], up);
    const open = scissor.animate([{ transform: 'scaleY(0.04)' }, { transform: 'scaleY(1)' }], up);

    await sleep(t.dockAt);
    if (!alive.current) return;
    creatorSfx('dock');
    setBolting(true);
    await sleep(t.bolts[0] - t.dockAt);
    if (!alive.current) return;
    spark();
    creatorSfx('bolt');
    await sleep(t.bolts[1] - t.bolts[0]);
    if (!alive.current) return;
    spark();
    creatorSfx('bolt');
    await sleep(t.placedAt - t.bolts[1]);
    if (!alive.current) return;
    travel.cancel();
    place(piece);
    setBolting(false);

    // the lift comes down and the truck drives off (the next piece may already come meanwhile)
    const down = { duration: TAKE.lowerMs, easing: EASE_LIFT, fill: 'both' as const };
    const lower = platform.animate([{ transform: `translateY(${-lift}px)` }, { transform: 'translateY(0px)' }], down);
    const close = scissor.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.04)' }], down);
    const away = truck.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${outTo}px)` }], {
      delay: TAKE.lowerMs,
      duration: TAKE.driveOutMs,
      easing: 'cubic-bezier(0.5, 0, 0.75, 0.6)',
      fill: 'both',
    });
    truckFree.current = sleep(t.endAt - t.placedAt).then(() => {
      truck.style.visibility = 'hidden';
      [drive, raise, open, lower, close, away].forEach((a) => a.cancel());
    });
  };

  // ── the crane picking the answer (blocks, intensity) ───────────────────────────────────────
  const hookRef = useRef<HTMLDivElement>(null);
  const trolleyRef = useRef<HTMLDivElement>(null);
  const wireRef = useRef<HTMLDivElement>(null);
  const hookAnims = useRef<Animation[]>([]);
  // the piece the crane is carrying now (its hook stays out until the piece is on)
  const [carrying, setCarrying] = useState(false);

  /** The hook's tip now (scene px), wherever its animations have it. */
  const hookNow = (): { x: number; y: number } => {
    const Lx = layoutRef.current;
    const el = hookRef.current;
    const park = { x: Lx ? Lx.pick.loadX : 0, y: Lx ? Lx.pick.parkY : 0 };
    if (!el || !Lx) return park;
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    const g = hookGeometry(Lx);
    return { x: m.m41 + g.w / 2, y: m.m42 + g.h };
  };
  /** The trolley, its wire and the hook along `points` (offsets 0..1), `ms` long. */
  const moveHook = (points: { x: number; y: number; offset: number; easing?: string }[], ms: number, delay = 0) => {
    const Lx = layoutRef.current;
    const hook = hookRef.current;
    const trolley = trolleyRef.current;
    const wire = wireRef.current;
    if (!Lx || !hook || !trolley || !wire) return [];
    const g = hookGeometry(Lx);
    const opts = { duration: Math.max(1, ms), delay, fill: 'forwards' as const };
    const anims = [
      hook.animate(points.map((p) => ({ offset: p.offset, easing: p.easing, transform: `translate(${(p.x - g.w / 2).toFixed(1)}px, ${(p.y - g.h).toFixed(1)}px)` })), opts),
      trolley.animate(points.map((p) => ({ offset: p.offset, easing: p.easing, transform: `translateX(${(p.x - g.trolleyW / 2).toFixed(1)}px)` })), opts),
      wire.animate(
        points.map((p) => ({ offset: p.offset, easing: p.easing, transform: `translateX(${p.x.toFixed(1)}px) scaleY(${Math.max(0.01, p.y - g.h * 0.6 - g.wireTop).toFixed(1)})` })),
        opts,
      ),
    ];
    hookAnims.current.push(...anims);
    return anims;
  };
  const stopHook = () => {
    const at = hookNow();
    hookAnims.current.forEach((a) => a.cancel());
    hookAnims.current = [];
    moveHook([{ ...at, offset: 0 }, { ...at, offset: 1 }], 1);
  };

  // while an answer waits to be chosen, the hook drifts from one loose piece to the next
  useEffect(() => {
    if (!picking || reduced || carrying || !L) return;
    const root = rootRef.current;
    const column = columnRef.current;
    if (!root || !column) return;
    let k = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const spots = () => {
      const box = root.getBoundingClientRect();
      // (the minutes: the hook hangs in the button's ring, its tip a little under the middle)
      const ring = picking === 'minutes' ? column.querySelector<HTMLElement>('[data-hook-ring]') : null;
      if (ring) {
        const r = ring.getBoundingClientRect();
        return [{ x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height * 0.72 }];
      }
      return Array.from(column.querySelectorAll<HTMLElement>(`[data-loose="${picking}"]`))
        .filter((el) => !(el as HTMLButtonElement).disabled)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.right - box.left + 10, y: r.top - box.top + r.height / 2 - 4 };
        });
    };
    const next = () => {
      const s = spots();
      if (s.length > 0) {
        const to = s[k % s.length];
        k += 1;
        const from = hookNow();
        const far = Math.hypot(to.x - from.x, to.y - from.y) > 2;
        const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 14 };
        if (far)
          moveHook(
            [
              { ...from, offset: 0, easing: 'ease-in-out' },
              { ...mid, offset: 0.5, easing: 'ease-in-out' },
              { ...to, offset: 1 },
            ],
            PICK.idleMoveMs,
          );
      }
      timer = setTimeout(next, PICK.idleMoveMs + PICK.idleRestMs);
    };
    timer = setTimeout(next, 120);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [picking, reduced, carrying, L]);

  /** The answer's piece (blocks, intensity), picked by the crane from where it was tapped and taken to the rocket. */
  const fitPicked = async (piece: PieceId, from: Take) => {
    const Lx = layoutRef.current;
    const root = rootRef.current;
    if (!Lx || !root) return;
    const lift = liftFor(Lx, piece);
    const box = root.getBoundingClientRect();
    const at = { x: from.rect.left - box.left, y: from.rect.top - box.top };
    setTruckLift(lift);
    setCarrying(true);
    const shown = onPage();
    setMoving({ piece, mode: 'truck', from: at, label: from.label });
    await shown;
    await truckFree.current;
    const fly = flyRef.current;
    const truck = truckRef.current;
    const platform = liftRef.current;
    const scissor = scissorRef.current;
    if (!alive.current || !fly || !truck || !platform || !scissor) {
      if (alive.current) place(piece);
      setCarrying(false);
      return;
    }
    const t = pickTimeline();
    const b = Lx.pieces[piece];
    const c0 = { x: at.x + b.len / 2, y: at.y + Lx.box / 2 };
    const start = hookNow();
    stopHook();
    const poses = pickPoses({ at, len: b.len, box: Lx.box, hook: start, loadX: Lx.pick.loadX, cx: Lx.cx, dropTop: b.top + lift, lift, parkY: Lx.pick.parkY, raise: 0.4 * Lx.T }, t);
    const total = t.lift[1];
    const travel = fly.animate(
      poses.map((p) => ({ offset: p.t / total, transform: `translate(${(p.piece.x - c0.x).toFixed(1)}px, ${(p.piece.y - c0.y).toFixed(1)}px) rotate(${p.piece.rot.toFixed(1)}deg)` })),
      { duration: total, fill: 'both' },
    );
    moveHook(
      poses.filter((p) => p.t <= t.hookUp[1]).map((p) => ({ ...p.hook, offset: p.t / t.hookUp[1] })),
      t.hookUp[1],
    );
    // the truck: to its loading spot left of the rocket, waits for the piece, then under the rocket
    const shift = Lx.cx - Lx.pick.loadX;
    const inFrom = -(Lx.truck.stopLeft + Lx.truck.width + 16);
    const outTo = Lx.W - Lx.truck.stopLeft + 16;
    truck.style.visibility = 'visible';
    const drive = truck.animate(
      [
        { transform: `translateX(${inFrom}px)`, easing: EASE_DRIVE },
        { transform: `translateX(${-shift}px)`, offset: t.truckIn[1] / t.drive[1] },
        { transform: `translateX(${-shift}px)`, offset: t.drive[0] / t.drive[1], easing: EASE_DRIVE },
        { transform: 'translateX(0px)' },
      ],
      { duration: t.drive[1], fill: 'both' },
    );
    cue(0, 'truckIn');
    cue(t.lift[0], 'liftUp');
    const up = { delay: t.lift[0], duration: t.lift[1] - t.lift[0], easing: EASE_LIFT, fill: 'both' as const };
    const raise = platform.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${-lift}px)` }], up);
    const open = scissor.animate([{ transform: 'scaleY(0.04)' }, { transform: 'scaleY(1)' }], up);

    await sleep(t.grab[0]);
    if (!alive.current) return;
    // the grab: a clang of the hook on the piece
    creatorSfx('hookGrab');
    await sleep(t.lower[1] - t.grab[0]);
    if (!alive.current) return;
    creatorSfx('hookRelease');
    await sleep(t.dockAt - t.lower[1]);
    if (!alive.current) return;
    creatorSfx('dock');
    setBolting(true);
    await sleep(t.bolts[0] - t.dockAt);
    if (!alive.current) return;
    spark();
    creatorSfx('bolt');
    await sleep(t.bolts[1] - t.bolts[0]);
    if (!alive.current) return;
    spark();
    creatorSfx('bolt');
    await sleep(t.placedAt - t.bolts[1]);
    if (!alive.current) return;
    travel.cancel();
    place(piece);
    setBolting(false);
    setCarrying(false);

    const down = { duration: PICK.lowerLiftMs, easing: EASE_LIFT, fill: 'both' as const };
    const lower = platform.animate([{ transform: `translateY(${-lift}px)` }, { transform: 'translateY(0px)' }], down);
    const close = scissor.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.04)' }], down);
    const away = truck.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${outTo}px)` }], {
      delay: PICK.lowerLiftMs,
      duration: PICK.driveOutMs,
      easing: 'cubic-bezier(0.5, 0, 0.75, 0.6)',
      fill: 'both',
    });
    truckFree.current = sleep(t.endAt - t.placedAt).then(() => {
      truck.style.visibility = 'hidden';
      [drive, raise, open, lower, close, away].forEach((a) => a.cancel());
    });
  };

  /** The minutes' tank, taken by the crane's hook (the button) and turned into the minutes piece on its way. */
  const fitTank = async (from: Take & { tank: NonNullable<Take['tank']> }) => {
    const piece: PieceId = 'minutes';
    const Lx = layoutRef.current;
    const root = rootRef.current;
    if (!Lx || !root) return;
    const lift = liftFor(Lx, piece);
    const box = root.getBoundingClientRect();
    const at = { x: from.rect.left - box.left, y: from.rect.top - box.top };
    const { w, h } = from.tank;
    setTruckLift(lift);
    setCarrying(true);
    const shown = onPage();
    setMoving({ piece, mode: 'truck', from: at, label: from.label, tank: from.tank });
    await shown;
    await truckFree.current;
    const fly = flyRef.current;
    const truck = truckRef.current;
    const platform = liftRef.current;
    const scissor = scissorRef.current;
    if (!alive.current || !fly || !truck || !platform || !scissor) {
      if (alive.current) place(piece);
      setCarrying(false);
      return;
    }
    const t = pickTimeline(TANK_PICK);
    const b = Lx.pieces[piece];
    const c0 = { x: at.x + w / 2, y: at.y + h / 2 };
    const start = hookNow();
    stopHook();
    const poses = tankPickPoses({ at, w, h, hook: start, parkY: Lx.pick.parkY, loadX: Lx.pick.loadX, cx: Lx.cx, dropTop: b.top + lift, lift, box: Lx.box, len: b.len, raise: 0.4 * Lx.T }, t);
    const total = t.lift[1];
    const travel = fly.animate(
      poses.map((p) => ({ offset: p.t / total, transform: `translate(${(p.box.x - c0.x).toFixed(1)}px, ${(p.box.y - c0.y).toFixed(1)}px) scale(${p.box.sx.toFixed(4)}, ${p.box.sy.toFixed(4)})` })),
      { duration: total, fill: 'both' },
    );
    // the tank gives way to the piece while it is carried
    const swap = { delay: t.swing[1], duration: t.carry[1] - t.swing[1], fill: 'both' as const };
    const tankArt = fly.querySelector<HTMLElement>('[data-fly-tank]');
    const pieceArt = fly.querySelector<HTMLElement>('[data-fly-piece]');
    const fades = [tankArt?.animate([{ opacity: 1 }, { opacity: 0 }], swap), pieceArt?.animate([{ opacity: 0 }, { opacity: 1 }], swap)];
    moveHook(
      poses.filter((p) => p.t <= t.hookUp[1]).map((p) => ({ ...p.hook, offset: p.t / t.hookUp[1] })),
      t.hookUp[1],
    );
    const shift = Lx.cx - Lx.pick.loadX;
    const inFrom = -(Lx.truck.stopLeft + Lx.truck.width + 16);
    const outTo = Lx.W - Lx.truck.stopLeft + 16;
    truck.style.visibility = 'visible';
    const drive = truck.animate(
      [
        { transform: `translateX(${inFrom}px)`, easing: EASE_DRIVE },
        { transform: `translateX(${-shift}px)`, offset: t.truckIn[1] / t.drive[1] },
        { transform: `translateX(${-shift}px)`, offset: t.drive[0] / t.drive[1], easing: EASE_DRIVE },
        { transform: 'translateX(0px)' },
      ],
      { duration: t.drive[1], fill: 'both' },
    );
    cue(0, 'truckIn');
    cue(t.lift[0], 'liftUp');
    const up = { delay: t.lift[0], duration: t.lift[1] - t.lift[0], easing: EASE_LIFT, fill: 'both' as const };
    const raise = platform.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${-lift}px)` }], up);
    const open = scissor.animate([{ transform: 'scaleY(0.04)' }, { transform: 'scaleY(1)' }], up);

    await sleep(t.grab[0]);
    if (!alive.current) return;
    creatorSfx('hookGrab');
    await sleep(t.lower[1] - t.grab[0]);
    if (!alive.current) return;
    creatorSfx('hookRelease');
    await sleep(t.dockAt - t.lower[1]);
    if (!alive.current) return;
    creatorSfx('dock');
    setBolting(true);
    await sleep(t.bolts[0] - t.dockAt);
    if (!alive.current) return;
    spark();
    creatorSfx('bolt');
    await sleep(t.bolts[1] - t.bolts[0]);
    if (!alive.current) return;
    spark();
    creatorSfx('bolt');
    await sleep(t.placedAt - t.bolts[1]);
    if (!alive.current) return;
    travel.cancel();
    fades.forEach((a) => a?.cancel());
    place(piece);
    setBolting(false);
    setCarrying(false);

    const down = { duration: PICK.lowerLiftMs, easing: EASE_LIFT, fill: 'both' as const };
    const lower = platform.animate([{ transform: `translateY(${-lift}px)` }, { transform: 'translateY(0px)' }], down);
    const close = scissor.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.04)' }], down);
    const away = truck.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${outTo}px)` }], {
      delay: PICK.lowerLiftMs,
      duration: PICK.driveOutMs,
      easing: 'cubic-bezier(0.5, 0, 0.75, 0.6)',
      fill: 'both',
    });
    truckFree.current = sleep(t.endAt - t.placedAt).then(() => {
      truck.style.visibility = 'hidden';
      [drive, raise, open, lower, close, away].forEach((a) => a.cancel());
    });
  };

  const fitPiece = async (piece: PieceId, mode: FitMode) => {
    const from = takeRef.current;
    if (mode === 'truck' && from && from.piece === piece) {
      // (the minutes' tank and the blocks and the intensity: the crane takes it; else it flies as before)
      if (piece === 'minutes' && from.tank) await fitTank({ ...from, tank: from.tank });
      else if (piece === 'blocks' || piece === 'engine') await fitPicked(piece, from);
      else await fitTaken(piece, from);
      return;
    }
    if (mode === 'truck') await truckFree.current;
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
      creatorSfx('quickPiece');
      await sleep(QUICK.boltMs);
      if (!alive.current) return;
      place(piece);
      await sleep(QUICK.gapMs);
      return;
    }

    const truck = truckRef.current;
    const platform = liftRef.current;
    const scissor = scissorRef.current;
    if (!truck || !platform || !scissor) {
      place(piece);
      return;
    }
    const tl = truckTimeline();
    const inFrom = -(Lx.truck.stopLeft + Lx.truck.width + 16);
    const outTo = Lx.W - Lx.truck.stopLeft + 16;
    truck.style.visibility = 'visible';
    const drive = truck.animate([{ transform: `translateX(${inFrom}px)` }, { transform: 'translateX(0px)' }], { duration: TRUCK.driveInMs, easing: EASE_DRIVE, fill: 'both' });
    cue(0, 'truckIn');
    cue(TRUCK.driveInMs, 'liftUp');
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
    creatorSfx('dock');
    setBolting(true);
    await sleep(tl.bolts[0] - tl.dockAt);
    if (!alive.current) return;
    spark();
    creatorSfx('bolt');
    await sleep(tl.bolts[1] - tl.bolts[0]);
    if (!alive.current) return;
    spark();
    creatorSfx('bolt');
    await sleep(tl.placedAt - tl.bolts[1]);
    if (!alive.current) return;
    place(piece);
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
    // (the answer's piece is drawn here now: the column hides its own, before the screen paints)
    if (moving?.from) handlers.current.onTaken?.(moving.piece);
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

  // ── the ending: the big porthole, the last change of clothes, lift-off ─────────────────────
  const stackRef = useRef<HTMLDivElement>(null);
  const portholeRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<SVGSVGElement>(null);
  const cableRef = useRef<SVGGElement>(null);
  const jibRef = useRef<SVGGElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);
  // the porthole's big place in the corner, and when the ending started (performance time)
  const [end, setEnd] = useState<{ big: Circle | null; startAt: number } | null>(null);
  const liftOffRef = useRef(onLiftOff);
  useLayoutEffect(() => {
    liftOffRef.current = onLiftOff;
  });
  useEffect(() => {
    if (!ending || reduced) return;
    const root = rootRef.current;
    const Lx = layoutRef.current;
    if (!root || !Lx) return;
    const anims: Animation[] = [];
    const own: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => own.push(setTimeout(fn, ms));
    // where the pieces were: under the sentence, left of the rocket, above the road
    const box = root.getBoundingClientRect();
    const sentence = columnRef.current?.firstElementChild;
    const below = sentence ? sentence.getBoundingClientRect().bottom - box.top : Lx.column.top + 140;
    const big = bigPorthole({ left: Lx.column.left, right: Lx.column.right, top: below + 16, bottom: Lx.road.top - 10 }, Lx.column.right - Lx.column.left);
    const t = portholeTimeline(TAKEOFF.igniteLeadMs);
    at(0, () => setEnd({ big, startAt: performance.now() }));
    // the crane lets go while «vamos» plays: the cable up, the arm into the tower
    at(t.cableAt, () => {
      if (cableRef.current) anims.push(cableRef.current.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.02)' }], { duration: DRESS.cableMs, easing: 'ease-in', fill: 'forwards' }));
    });
    at(t.jibAt, () => {
      const slide = Lx.tower.x + Lx.tower.w / 2 - Lx.jib.x0;
      if (jibRef.current) anims.push(jibRef.current.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${slide}px)` }], { duration: DRESS.jibMs, easing: 'cubic-bezier(0.45, 0, 0.3, 1)', fill: 'forwards' }));
    });
    // back into the window, along the zoom lines
    at(t.shrinkAt, () => {
      const ph = portholeRef.current;
      const c = big ?? Lx.porthole;
      const outer = big ? big.r + BIG_RIM : Lx.porthole.r + Lx.rim;
      const into = `translate(${(Lx.window.x - c.x).toFixed(1)}px, ${(Lx.window.y - c.y).toFixed(1)}px) scale(${((Lx.window.r + 1.5) / outer).toFixed(4)})`;
      if (ph) {
        anims.push(
          ph.animate([{ transform: 'none', opacity: 1 }, { transform: into, opacity: 1, offset: 0.86 }, { transform: into, opacity: 0 }], {
            duration: DRESS.shrinkMs,
            easing: 'cubic-bezier(0.5, 0, 0.3, 1)',
            fill: 'forwards',
          }),
        );
      }
      if (zoomRef.current) anims.push(zoomRef.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: DRESS.shrinkMs, fill: 'forwards' }));
    });
    at(t.igniteAt, () => {
      root.setAttribute('data-ignite', '');
      creatorSfx('ignite');
    });
    // it arrives: lift-off
    at(t.liftAt, () => {
      creatorSfx('liftOff');
      const stack = stackRef.current;
      if (stack) anims.push(stack.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${-(Lx.padTop + 80)}px)` }], { duration: TAKEOFF.liftMs, easing: 'cubic-bezier(0.55, 0, 0.85, 0.4)', fill: 'forwards' }));
      const b = root.getBoundingClientRect();
      liftOffRef.current({ x: b.left + Lx.cx, y: b.top + Lx.padTop });
    });
    return () => {
      own.forEach(clearTimeout);
      anims.forEach((a) => a.cancel());
      root.removeAttribute('data-ignite');
    };
  }, [ending, reduced]);

  // the porthole goes from its place to the big one (drawn there now: it moves from where it was)
  useLayoutEffect(() => {
    const el = portholeRef.current;
    const Lx = layoutRef.current;
    if (!end?.big || !el || !Lx) return;
    const from = Lx.porthole;
    const s0 = (from.r + Lx.rim) / (end.big.r + BIG_RIM);
    const move = el.animate(
      [{ transform: `translate(${(from.x - end.big.x).toFixed(1)}px, ${(from.y - end.big.y).toFixed(1)}px) scale(${s0.toFixed(4)})` }, { transform: 'none' }],
      { duration: DRESS.moveMs, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' },
    );
    const zoom = zoomRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { delay: DRESS.moveMs - 150, duration: 300, fill: 'backwards' });
    return () => {
      move.cancel();
      zoom?.cancel();
    };
  }, [end]);

  const step = Math.max(0, Math.min(3, Math.round(sky)));
  // the porthole now: its place at the top, or its big one in the corner at the end
  const porthole = L && end?.big ? { ...end.big, rim: BIG_RIM } : L ? { ...L.porthole, rim: L.rim } : null;
  const ink = skyInk(step);
  const next = moving?.piece ?? PIECES[Math.min(PIECES.length - 1, shownPlaced)];
  const seamPiece: Exclude<PieceId, 'nose'> = next === 'nose' ? 'minutes' : next;

  return (
    <div ref={rootRef} className="relative isolate h-dvh w-full overflow-hidden select-none" data-sky={step}>
      <div data-safe-probe="" aria-hidden="true" className="pointer-events-none invisible absolute h-0 w-0 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]" />
      {L && (
        <>
          <Backdrop L={L} step={step} uid={uid} reduced={reduced} risen={risen} />
          <Crane L={L} uid={uid} jibRef={jibRef} cableRef={cableRef} pickOut={!reduced && (picking !== null || carrying)} reduced={reduced} />
          {/* the mechanics' platform on the tower, at the seam being bolted */}
          <MechanicsPlatform L={L} y={L.platform[seamPiece]} bolting={bolting} reduced={reduced} />
          <Truck L={L} lift={truckLift} truckRef={truckRef} liftRef={liftRef} scissorRef={scissorRef} />
          {/* the piece on its way (on the truck, or sliding up into place) */}
          {moving?.from && moving.tank ? (
            // the minutes' tank, where it stood: it shrinks into the minutes piece on its way to the lift
            <div
              ref={flyRef}
              className="pointer-events-none absolute z-[21] [transform-origin:50%_50%]"
              style={{ left: moving.from.x, top: moving.from.y, width: moving.tank.w, height: moving.tank.h }}
            >
              <div data-fly-tank="" className="absolute inset-0">
                <TankArt w={moving.tank.w} h={moving.tank.h} minutes={moving.tank.minutes} />
              </div>
              <div data-fly-piece="" className="absolute left-1/2 top-1/2" style={{ opacity: 0, width: L.pieces.minutes.len, height: L.box, transform: `translate(-50%, -50%) rotate(-90deg) scale(${(moving.tank.h / L.pieces.minutes.len).toFixed(4)}, ${(moving.tank.w / L.box).toFixed(4)})` }}>
                <RocketPiece piece="minutes" L={L} label={moving.label ?? labels.minutes} measure={measure} lying className="block" />
              </div>
            </div>
          ) : moving?.from ? (
            // the answer's piece, lying where it was tapped: it turns upright on its way to the lift
            <div
              ref={flyRef}
              className="pointer-events-none absolute z-[21] [transform-origin:50%_50%]"
              style={{ left: moving.from.x, top: moving.from.y, width: L.pieces[moving.piece].len, height: L.box }}
            >
              <RocketPiece piece={moving.piece} L={L} label={moving.label ?? labels[moving.piece]} measure={measure} lying className="block" />
            </div>
          ) : (
            moving && (
              <div ref={flyRef} className="pointer-events-none absolute inset-0 z-[12]">
                <RocketPiece piece={moving.piece} L={L} label={labels[moving.piece]} measure={measure} />
              </div>
            )
          )}
          {/* the rocket: what is on, and the dashed outlines of what is to come */}
          <div ref={stackRef} className="pointer-events-none absolute inset-0 z-[13]">
            <div className="asm-shake absolute inset-0">
              {PIECES.map((piece, i) =>
                piece === 'nose' && noseHidden ? null : i < shownPlaced ? (
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
          {/* the big porthole: the rocket's own window seen close up (at the end, large in the corner) */}
          {porthole && (
            <>
              <ZoomLinesSvg
                W={L.W}
                H={L.H}
                big={{ x: porthole.x, y: porthole.y, r: porthole.r + porthole.rim }}
                small={{ ...L.window, r: L.window.r + 2 }}
                light={!ink}
                svgRef={zoomRef}
                className="z-[17]"
                stroke={reduced ? 'none' : `stroke ${SKY_MS}ms ease-in-out`}
              />
              <div
                ref={portholeRef}
                aria-hidden="true"
                className="pointer-events-none absolute z-[18]"
                style={{ left: porthole.x - porthole.r - porthole.rim, top: porthole.y - porthole.r - porthole.rim, width: 2 * (porthole.r + porthole.rim), height: 2 * (porthole.r + porthole.rim) }}
              >
                <PortholeFrame r={porthole.r} rim={porthole.rim}>
                  {end ? (
                    <DressSequence from={outfit} startAt={end.startAt + DRESS.moveMs} reduced={reduced} />
                  ) : (
                    <PortholePerson outfit={ending ? 3 : outfit} transition={reduced ? 'cut' : 'walk'} />
                  )}
                </PortholeFrame>
              </div>
            </>
          )}
          {/* the crane's picking hook over the loose answers (blocks, intensity) */}
          <PickHook L={L} shown={!reduced && (picking !== null || carrying)} hookRef={hookRef} trolleyRef={trolleyRef} wireRef={wireRef} />
          {/* the questions (or the sentence), on the left */}
          <div
            ref={columnRef}
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
function Backdrop({ L, step, uid, reduced, risen }: { L: AssemblyLayout; step: number; uid: string; reduced: boolean; risen: boolean }) {
  const { W, H, horizon: hz, road } = L;
  const k = W / 320;
  const q = road.h / 20;
  const s = SKY_STEPS[step];
  // (first exactly where the start screen had it: it rises a little as the questions open)
  const sun = step === 0 && !risen ? L.dawn.sun : L.suns[step];
  const deckL = L.cx - 1.5 * L.T;
  const deckR = L.tower.x + L.tower.w + 4;
  const u = L.T / 36;
  return (
    <svg aria-hidden="true" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 z-0">
      <defs>
        {SKY_STEPS.map((st, i) => (
          // (the dawn: as on the start screen, from its base's top down to the horizon; above it, the page's dark)
          <linearGradient key={i} id={`${uid}-sky${i}`} gradientUnits="userSpaceOnUse" x1={0} y1={i === 0 ? L.dawn.top : 0} x2={0} y2={hz + 1}>
            {st.sky.map(([at, c]) => (
              <stop key={`${at}`} offset={at} stopColor={c} />
            ))}
          </linearGradient>
        ))}
        <radialGradient id={`${uid}-glow`}>
          <stop offset={0} stopColor={DAWN.glow} stopOpacity={0.85} />
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
          <circle r={L.dawn.glow} fill={`url(#${uid}-glow)`} style={{ opacity: step === 0 ? 1 : (s.glow * 0.75) / 0.85, transition: fade(reduced) }} />
          <circle r={sun.r} style={{ fill: s.sun, transition: tween(reduced, 'fill') }} />
        </g>
      </g>
      {/* two thin lit clouds while it is still dawn */}
      <g style={{ opacity: step <= 1 ? 1 : 0, transition: fade(reduced) }}>
        <DawnClouds hz={hz} k={k} />
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
      {/* (at dawn the ground darkens towards the bottom, as on the start screen) */}
      <defs>
        <linearGradient id={`${uid}-gnd`} gradientUnits="userSpaceOnUse" x1={0} y1={hz} x2={0} y2={H}>
          <stop offset={0} stopColor={DAWN.ground[0]} />
          <stop offset={1} stopColor={DAWN.ground[1]} />
        </linearGradient>
      </defs>
      <rect y={hz} width={W} height={H - hz} fill={`url(#${uid}-gnd)`} style={{ opacity: step === 0 ? 1 : 0, transition: fade(reduced) }} />
      <rect y={road.top} width={W} height={road.h} style={{ fill: s.road, transition: tween(reduced, 'fill') }} />
      <path d={`M0 ${road.top}H${W}M0 ${road.top + road.h}H${W}`} stroke={DAWN.roadEdge} strokeOpacity={0.7} strokeWidth={0.8} />
      <path d={`M0 ${road.top + road.h / 2}H${W}`} stroke={DAWN.roadLine} strokeOpacity={0.55} strokeWidth={1} strokeDasharray={`${9 * q} ${8 * q}`} />
      <RoadLamp x={118 * k} top={road.top} q={q} lit={s.lamps} />
      <RoadLamp x={204 * k} top={road.top} q={q} lit={s.lamps} />
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
function Crane({
  L,
  uid,
  jibRef,
  cableRef,
  pickOut,
  reduced,
}: {
  L: AssemblyLayout;
  uid: string;
  jibRef: RefObject<SVGGElement | null>;
  cableRef: RefObject<SVGGElement | null>;
  /** the arm's extension over the loose answers is out (the hook picks one) */
  pickOut: boolean;
  reduced: boolean;
}) {
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
  // the extension: the same lattice, from over the loose answers to the arm's end (slides out of it)
  const ext = L.pick.x0;
  let extZig = '';
  for (let x = ext; x < jib.x0 + bay; x += bay) extZig += `M${x} ${y1}L${x + bay / 2} ${y0}L${x + bay} ${y1}`;
  return (
    <svg aria-hidden="true" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 z-[5]" style={{ overflow: 'visible' }}>
      <defs>
        <clipPath id={`${uid}-jib`}>
          <rect x={-20} y={0} width={mastX + 20} height={H} />
        </clipPath>
        <clipPath id={`${uid}-ext`}>
          <rect x={-20} y={0} width={jib.x0 + 20} height={H} />
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
          <g clipPath={`url(#${uid}-ext)`}>
            <g style={{ transform: pickOut ? 'none' : `translateX(${jib.x0 - ext + bay}px)`, transition: reduced ? 'none' : 'transform 520ms cubic-bezier(0.45, 0, 0.25, 1)' }}>
              <path d={`M${ext} ${y0}H${jib.x0 + bay}M${ext} ${y1}H${jib.x0 + bay}${extZig}`} stroke={STEEL} strokeWidth={1.4} fill="none" />
            </g>
          </g>
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

/** The picking hook's sizes (scene px): its box (the tip at its bottom centre), the trolley, where its wire starts. */
function hookGeometry(L: AssemblyLayout) {
  const u = L.T / 36;
  return { w: Math.round(18 * u), h: Math.round(21 * u), trolleyW: Math.round(16 * u), trolleyH: Math.max(3, Math.round(5 * u)), wireTop: L.jib.y + L.jib.h + Math.max(3, Math.round(5 * u)) };
}

/**
 * The crane's picking hook: a trolley on the arm, its wire and an open hook (its tip at the bottom
 * centre of its box). Moved by the scene through refs (Web Animations); parked over the waiting
 * truck's spot until it is needed.
 */
function PickHook({
  L,
  shown,
  hookRef,
  trolleyRef,
  wireRef,
}: {
  L: AssemblyLayout;
  shown: boolean;
  hookRef: RefObject<HTMLDivElement | null>;
  trolleyRef: RefObject<HTMLDivElement | null>;
  wireRef: RefObject<HTMLDivElement | null>;
}) {
  const g = hookGeometry(L);
  const park = { x: L.pick.loadX, y: L.pick.parkY };
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[22]" style={{ opacity: shown ? 1 : 0, transition: 'opacity 300ms ease' }}>
      <div
        ref={trolleyRef}
        className="absolute left-0"
        style={{ top: L.jib.y + L.jib.h, width: g.trolleyW, height: g.trolleyH, background: DAWN.plate, boxShadow: `inset 0 0 0 1px ${STEEL}`, transform: `translateX(${park.x - g.trolleyW / 2}px)` }}
      />
      <div
        ref={wireRef}
        className="absolute left-0 origin-top"
        style={{ top: g.wireTop, width: 1.3, height: 1, background: C.ink, transform: `translateX(${park.x}px) scaleY(${Math.max(0.01, park.y - g.h * 0.6 - g.wireTop)})` }}
      />
      <div ref={hookRef} className="absolute left-0 top-0" style={{ width: g.w, height: g.h, transform: `translate(${park.x - g.w / 2}px, ${park.y - g.h}px)` }}>
        <svg viewBox="0 0 13 15" className="h-full w-full overflow-visible">
          {/* the eye, the shank and the open hook, its tip up on the right */}
          <circle cx={6.5} cy={2.4} r={1.9} fill="none" stroke={C.ink} strokeWidth={1.3} />
          <path d="M6.5 4.3V9.2Q6.5 14.2 10 13.6Q12.4 13.1 12 9.8" fill="none" stroke={C.ink} strokeWidth={1.6} strokeLinecap="round" />
          <path d="M6.5 6.2H8.4" stroke={DAWN.hazard} strokeWidth={1.4} />
        </svg>
      </div>
    </div>
  );
}

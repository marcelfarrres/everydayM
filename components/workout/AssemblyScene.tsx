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
import { Claw, HookRing, MinutesTank, TANK_LABELS, TankArt, ringSpot, tankWidth } from '@/components/workout/MinutesTank';
import { Mechanic, MECHANIC } from '@/components/workout/player/Mechanic';
import { useTextMeasure } from '@/components/workout/textMeasure';
import {
  BIG_RIM,
  DRESS,
  ARRIVE,
  GRAB,
  PIECES,
  QUICK,
  SKY_MS,
  SKY_STEPS,
  TAKEOFF,
  TRUCK,
  assemblyLayout,
  bigPorthole,
  liftFor,
  padHull,
  arrivalTimeline,
  grabPoint,
  grabPoses,
  grabTimeline,
  portholeTimeline,
  skyInk,
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
  /**
   * the minutes' question: the tank (brought by a truck, standing on its bed at the left) you slide,
   * and the ring the crane's grabber waits in («Enganchar»: `onHook`, with the tank's body); `hidden`:
   * the crane has taken it
   */
  minutes?: { value: number; onChange: (minutes: number) => void; onHook: (tank: HTMLElement, button: HTMLButtonElement) => void; hidden: boolean } | null;
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
/** a truck pulling up and stopping dead: an ease-out, no bounce */
const EASE_STOP = 'cubic-bezier(0.22, 0.8, 0.3, 1)';
/** the grabber takes a loose piece over its hull this many hull thicknesses in from its top end */
const GRIP_IN = 0.22;
const EASE_LIFT = 'cubic-bezier(0.45, 0, 0.3, 1)';
const STEEL = DAWN.steel;

export function AssemblyScene({ target, modes, labels, sky, outfit, ending, onAssembled, onLiftOff, take = null, onTaken, onFitted, picking = null, noseHidden = false, onNose, minutes = null, children }: AssemblySceneProps) {
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

  // ── the crane's grabber: it waits over the answers and takes the one chosen, from above ───────
  const hookRef = useRef<HTMLDivElement>(null);
  const trolleyRef = useRef<HTMLDivElement>(null);
  const wireRef = useRef<HTMLDivElement>(null);
  const hookAnims = useRef<Animation[]>([]);
  // the piece the crane is carrying now (its grabber stays out until the piece is on)
  const [carrying, setCarrying] = useState(false);
  // where the truck stands while it holds the minutes' tank (px from its usual stop), if it does
  const parkDx = useRef<number | null>(null);

  /** The grabber's tip now (scene px), wherever its animations have it. */
  const hookNow = (): { x: number; y: number } => {
    const Lx = layoutRef.current;
    const el = hookRef.current;
    const park = { x: Lx ? Lx.pick.loadX : 0, y: Lx ? Lx.pick.parkY : 0 };
    if (!el || !Lx) return park;
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    const g = hookGeometry(Lx);
    return { x: m.m41 + g.w / 2, y: m.m42 + g.h };
  };
  /** The grabber's three parts' transforms for its tip at `p`. */
  const hookPose = (Lx: AssemblyLayout, p: { x: number; y: number }) => {
    const g = hookGeometry(Lx);
    return {
      hook: `translate(${(p.x - g.w / 2).toFixed(1)}px, ${(p.y - g.h).toFixed(1)}px)`,
      trolley: `translateX(${(p.x - g.trolleyW / 2).toFixed(1)}px)`,
      wire: `translateX(${p.x.toFixed(1)}px) scaleY(${Math.max(0.01, p.y - g.h + g.eye - g.wireTop).toFixed(1)})`,
    };
  };
  /** The trolley, its wire and the grabber along `points` (offsets 0..1), `ms` long. */
  const moveHook = (points: { x: number; y: number; offset: number; easing?: string }[], ms: number, delay = 0) => {
    const Lx = layoutRef.current;
    const hook = hookRef.current;
    const trolley = trolleyRef.current;
    const wire = wireRef.current;
    if (!Lx || !hook || !trolley || !wire) return [];
    const opts = { duration: Math.max(1, ms), delay, fill: 'forwards' as const };
    const frames = points.map((p) => ({ offset: p.offset, easing: p.easing, ...hookPose(Lx, p) }));
    const anims = [
      hook.animate(frames.map((f) => ({ offset: f.offset, easing: f.easing, transform: f.hook })), opts),
      trolley.animate(frames.map((f) => ({ offset: f.offset, easing: f.easing, transform: f.trolley })), opts),
      wire.animate(frames.map((f) => ({ offset: f.offset, easing: f.easing, transform: f.wire })), opts),
    ];
    hookAnims.current.push(...anims);
    return anims;
  };
  /** The grabber set at `p` as it is, no animation: a resting pose that holds even if no animation ever runs. */
  const placeHook = (p: { x: number; y: number }) => {
    const Lx = layoutRef.current;
    const hook = hookRef.current;
    const trolley = trolleyRef.current;
    const wire = wireRef.current;
    if (!Lx || !hook || !trolley || !wire) return;
    hookAnims.current.forEach((a) => a.cancel());
    hookAnims.current = [];
    const pose = hookPose(Lx, p);
    hook.style.transform = pose.hook;
    trolley.style.transform = pose.trolley;
    wire.style.transform = pose.wire;
  };
  /** Glides the grabber from where it is to `to` (and leaves it resting there). */
  const glideHook = (to: { x: number; y: number }, ms: number) => {
    const from = hookNow();
    placeHook(to);
    if (Math.hypot(to.x - from.x, to.y - from.y) < 1.5) return;
    moveHook([{ ...from, offset: 0, easing: 'cubic-bezier(0.45, 0, 0.25, 1)' }, { ...to, offset: 1 }], ms);
  };
  /** The grabber's jaws: closed on a piece, or open. */
  const setGrip = (closed: boolean) => hookRef.current?.toggleAttribute('data-grip', closed);

  /** Where the grabber waits over a loose piece (and takes it from): over its hull, near its top end, just above it. */
  const gripSpot = (el: HTMLElement): { x: number; y: number } | null => {
    const root = rootRef.current;
    const Lx = layoutRef.current;
    const art = el.querySelector<SVGSVGElement>('svg[data-piece]');
    if (!root || !Lx || !art) return null;
    const box = root.getBoundingClientRect();
    const r = art.getBoundingClientRect();
    return { x: r.left - box.left + r.width - GRIP_IN * Lx.T, y: r.top - box.top + Lx.finH - 3 };
  };

  // while an answer (blocks, intensity) waits to be chosen, the grabber drifts from one loose piece
  // to the next; it goes and waits over the one the pointer is on (or the focus, or the finger)
  useEffect(() => {
    if (!picking || reduced || carrying || !L) return;
    const column = columnRef.current;
    if (!column) return;
    let k = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let leave: ReturnType<typeof setTimeout> | null = null;
    let hovered: HTMLElement | null = null;
    const pieces = () => Array.from(column.querySelectorAll<HTMLElement>(`[data-loose="${picking}"]`)).filter((el) => !(el as HTMLButtonElement).disabled);
    const drift = () => {
      if (!hovered) {
        const list = pieces();
        if (list.length > 0) {
          const spot = gripSpot(list[k % list.length]);
          k += 1;
          if (spot) {
            const from = hookNow();
            const mid = { x: (from.x + spot.x) / 2, y: Math.min(from.y, spot.y) - 14 };
            if (Math.hypot(spot.x - from.x, spot.y - from.y) > 2) {
              placeHook(spot);
              moveHook(
                [
                  { ...from, offset: 0, easing: 'ease-in-out' },
                  { ...mid, offset: 0.5, easing: 'ease-in-out' },
                  { ...spot, offset: 1 },
                ],
                GRAB.idleMoveMs,
              );
            }
          }
        }
      }
      timer = setTimeout(drift, GRAB.idleMoveMs + GRAB.idleRestMs);
    };
    const pieceOf = (target: EventTarget | null) => (target instanceof Element ? target.closest<HTMLElement>(`[data-loose="${picking}"]`) : null);
    const enter = (target: EventTarget | null) => {
      const el = pieceOf(target);
      if (!el || (el as HTMLButtonElement).disabled) return;
      if (leave) clearTimeout(leave);
      leave = null;
      if (hovered === el) return;
      hovered = el;
      const spot = gripSpot(el);
      if (spot) glideHook(spot, GRAB.hoverMs);
    };
    const exit = (target: EventTarget | null, next: EventTarget | null) => {
      const el = pieceOf(target);
      if (!el || pieceOf(next) === el) return;
      // (crossing the gap to the next piece is no leaving: it waits a moment)
      if (leave) clearTimeout(leave);
      leave = setTimeout(() => {
        hovered = null;
      }, GRAB.hoverLeaveMs);
    };
    const over = (e: Event) => enter(e.target);
    const out = (e: Event) => exit(e.target, (e as PointerEvent | FocusEvent).relatedTarget ?? null);
    column.addEventListener('pointerover', over);
    column.addEventListener('pointerdown', over);
    column.addEventListener('focusin', over);
    column.addEventListener('pointerout', out);
    column.addEventListener('focusout', out);
    timer = setTimeout(drift, 120);
    return () => {
      if (timer) clearTimeout(timer);
      if (leave) clearTimeout(leave);
      column.removeEventListener('pointerover', over);
      column.removeEventListener('pointerdown', over);
      column.removeEventListener('focusin', over);
      column.removeEventListener('pointerout', out);
      column.removeEventListener('focusout', out);
    };
    // (the helpers read refs only)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking, reduced, carrying, L]);

  /**
   * The answer's piece (blocks, intensity, or the minutes' tank) taken by the crane from above: down
   * onto its top, closed, straight up, across (a piece turning upright, the tank shrinking into the
   * minutes piece), straight down onto the parked truck, let go; only then the truck drives under
   * the rocket with the piece rigidly on it (it rides the truck's own moves), the lift raises it,
   * dock, bolts.
   */
  const fitGrabbed = async (piece: PieceId, from: Take) => {
    const Lx = layoutRef.current;
    const root = rootRef.current;
    if (!Lx || !root) return;
    const lift = liftFor(Lx, piece);
    const box = root.getBoundingClientRect();
    const at = { x: from.rect.left - box.left, y: from.rect.top - box.top };
    const tank = from.tank;
    const b = Lx.pieces[piece];
    const w = tank ? tank.w : b.len;
    const h = tank ? tank.h : Lx.box;
    setTruckLift(lift);
    setCarrying(true);
    const shown = onPage();
    setMoving({ piece, mode: 'truck', from: at, label: from.label, tank });
    await shown;
    await truckFree.current;
    const outer = flyRef.current;
    const middle = outer?.firstElementChild as HTMLElement | null;
    const inner = middle?.firstElementChild as HTMLElement | null;
    const truck = truckRef.current;
    const platform = liftRef.current;
    const scissor = scissorRef.current;
    if (!alive.current || !outer || !middle || !inner || !truck || !platform || !scissor) {
      if (alive.current) place(piece);
      setCarrying(false);
      return;
    }
    const t = grabTimeline();
    const c0 = { x: at.x + w / 2, y: at.y + h / 2 };
    const attach = tank ? { from: { x: 0, y: -h / 2 }, to: { x: 0, y: -h / 2 } } : { from: { x: w / 2 - GRIP_IN * Lx.T, y: -Lx.T / 2 }, to: { x: w / 2, y: 0 } };
    const start = hookNow();
    const grip = grabPoint({ x: c0.x, y: c0.y, rot: 0, sx: 1, sy: 1 }, attach.from);
    const overY = Math.abs(start.x - grip.x) <= 6 && start.y < grip.y ? start.y : Lx.pick.parkY;
    const poses = grabPoses(
      {
        c0,
        attach,
        rot: tank ? 0 : -90,
        scale: tank ? { sx: Lx.box / w, sy: b.len / h } : { sx: 1, sy: 1 },
        endHalf: b.len / 2,
        hook: start,
        parkY: Lx.pick.parkY,
        clearY: Lx.pick.parkY + 14,
        loadX: Lx.pick.loadX,
        dropTop: b.top + lift,
        overY,
      },
      t,
    );
    const span = t.hookUp[1];
    // the piece in the grabber (it stops, exactly, where it is set down on the bed)
    const carry = inner.animate(
      poses.map((p) => ({ offset: p.t / span, transform: `translate(${(p.piece.x - c0.x).toFixed(2)}px, ${(p.piece.y - c0.y).toFixed(2)}px) rotate(${p.piece.rot.toFixed(2)}deg) scale(${p.piece.sx.toFixed(4)}, ${p.piece.sy.toFixed(4)})` })),
      { duration: span, fill: 'forwards' },
    );
    const anims: Animation[] = [carry];
    if (tank) {
      // the tank gives way to the piece while it is carried
      const swap = { delay: t.up[1], duration: t.carry[1] - t.up[1], fill: 'both' as const };
      const tankArt = inner.querySelector<HTMLElement>('[data-fly-tank]');
      const pieceArt = inner.querySelector<HTMLElement>('[data-fly-piece]');
      if (tankArt) anims.push(tankArt.animate([{ opacity: 1 }, { opacity: 0 }], swap));
      if (pieceArt) anims.push(pieceArt.animate([{ opacity: 0 }, { opacity: 1 }], swap));
    }
    // (its resting pose at the end, set first; the move animates there)
    placeHook(poses[poses.length - 1].hook);
    moveHook(
      poses.map((p) => ({ ...p.hook, offset: p.t / span })),
      span,
    );

    // the truck: (the tank's) from where it brought the tank, or (a loose piece's) in along the road,
    // to its loading spot, where it stops dead; after the release, under the rocket
    const shift = Lx.cx - Lx.pick.loadX;
    const inFrom = -(Lx.truck.stopLeft + Lx.truck.width + 16);
    const outTo = Lx.W - Lx.truck.stopLeft + 16;
    const parked = parkDx.current;
    truck.style.visibility = 'visible';
    if (tank && parked !== null) {
      anims.push(truck.animate([{ transform: `translateX(${parked}px)` }, { transform: `translateX(${-shift}px)` }], { delay: t.reposition[0], duration: t.reposition[1] - t.reposition[0], easing: EASE_STOP, fill: 'both' }));
      cue(t.reposition[0], 'truckIn');
      // (it holds the tank no more: the crane has it)
      parkDx.current = null;
    } else {
      anims.push(truck.animate([{ transform: `translateX(${inFrom}px)` }, { transform: `translateX(${-shift}px)` }], { duration: t.truckIn[1] - t.truckIn[0], easing: EASE_STOP, fill: 'both' }));
      cue(0, 'truckIn');
    }
    const drive = { delay: t.drive[0], duration: t.drive[1] - t.drive[0], easing: EASE_DRIVE, fill: 'forwards' as const };
    anims.push(truck.animate([{ transform: `translateX(${-shift}px)` }, { transform: 'translateX(0px)' }], drive));
    // (the piece on the bed rides the very same move, and then the very same lift)
    anims.push(outer.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${shift}px)` }], drive));
    const up = { delay: t.lift[0], duration: t.lift[1] - t.lift[0], easing: EASE_LIFT, fill: 'both' as const };
    const raise = platform.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${-lift}px)` }], up);
    const open = scissor.animate([{ transform: 'scaleY(0.04)' }, { transform: 'scaleY(1)' }], up);
    anims.push(middle.animate([{ transform: 'translateY(0px)' }, { transform: `translateY(${-lift}px)` }], { ...up, fill: 'forwards' }));
    cue(t.lift[0], 'liftUp');

    await sleep(t.grip[0]);
    if (!alive.current) return;
    // the grab: the jaws close on its top, a clang
    setGrip(true);
    creatorSfx('hookGrab');
    await sleep(t.release[0] - t.grip[0]);
    if (!alive.current) return;
    setGrip(false);
    creatorSfx('hookRelease');
    await sleep(t.dockAt - t.release[0]);
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
    anims.forEach((a) => a.cancel());
    place(piece);
    setBolting(false);
    setCarrying(false);

    // the lift comes down and the truck drives off
    truck.style.transform = 'translateX(0px)';
    const down = { duration: GRAB.lowerLiftMs, easing: EASE_LIFT, fill: 'both' as const };
    const lower = platform.animate([{ transform: `translateY(${-lift}px)` }, { transform: 'translateY(0px)' }], down);
    const close = scissor.animate([{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.04)' }], down);
    const away = truck.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${outTo}px)` }], {
      delay: GRAB.lowerLiftMs,
      duration: GRAB.driveOutMs,
      easing: 'cubic-bezier(0.5, 0, 0.75, 0.6)',
      fill: 'both',
    });
    truckFree.current = sleep(t.endAt - t.placedAt).then(() => {
      truck.style.visibility = 'hidden';
      truck.style.transform = '';
      [raise, open, lower, close, away].forEach((a) => a.cancel());
    });
  };

  const fitPiece = async (piece: PieceId, mode: FitMode) => {
    const from = takeRef.current;
    if (mode === 'truck' && from && from.piece === piece) {
      // (an answer: the crane takes the very piece tapped, or the minutes' tank)
      await fitGrabbed(piece, from);
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

  // ── the questions open, one thing after another; the minutes' tank comes on a truck ──────────
  // 'nose': the crane is still setting the carried nose in place (nothing of the question shows);
  // 'reveal': the porthole and the title come in; 'deliver': the grabber lets go of the nose and goes
  // down to its ring while a truck brings the tank and parks; 'ready': the tank can be dragged
  const minutesOn = minutes !== null;
  const [arrival, setArrival] = useState<'nose' | 'reveal' | 'deliver' | 'ready'>(noseHidden ? 'nose' : reduced ? 'ready' : 'reveal');
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    if (arrival === 'nose' && !noseHidden) t = setTimeout(() => setArrival('reveal'), 0);
    else if (arrival === 'reveal') {
      const plan = arrivalTimeline(minutesOn && !reduced);
      t = setTimeout(() => setArrival(plan.deliverAt !== null ? 'deliver' : 'ready'), plan.deliverAt ?? plan.readyAt);
    } else if (arrival === 'deliver') t = setTimeout(() => setArrival('ready'), ARRIVE.deliverMs);
    return () => {
      if (t) clearTimeout(t);
    };
  }, [arrival, noseHidden, minutesOn, reduced]);
  const revealed = arrival !== 'nose';
  const tankShown = minutesOn && (arrival === 'deliver' || arrival === 'ready');

  // where the tank stands: on the truck's bed, under the title (measured: it may wrap)
  const tankBoxRef = useRef<HTMLDivElement>(null);
  const [titleBottom, setTitleBottom] = useState<number | null>(null);
  useLayoutEffect(() => {
    const col = columnRef.current;
    const root = rootRef.current;
    const title = col?.firstElementChild?.firstElementChild;
    if (!col || !root || !minutesOn || !(title instanceof HTMLElement)) return;
    const read = () => {
      const y = Math.round(title.getBoundingClientRect().bottom - root.getBoundingClientRect().top);
      setTitleBottom((old) => (old === y ? old : y));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(title);
    return () => ro.disconnect();
  }, [L, minutesOn]);
  const tank =
    L && minutesOn
      ? (() => {
          const colW = L.column.right - L.column.left;
          const below = (titleBottom ?? L.column.top + L.column.titleMin) + 16;
          const h = Math.max(150, Math.min(360, Math.round(L.truck.bedTop - below)));
          const top = L.truck.bedTop - h;
          const w = tankWidth(colW);
          const ring = ringSpot(colW, h);
          return {
            colW,
            top,
            h,
            // the truck parks with its bed's middle under the tank
            dx: Math.round(L.column.left + TANK_LABELS + w / 2 - (L.truck.stopLeft + L.truck.bedW / 2)),
            ring: { x: L.column.left + ring.x, y: top + ring.y },
            // the grabber hangs open in the ring (its tip a little under the ring's middle)
            hang: { x: L.column.left + ring.x, y: top + ring.y + Math.round(hookGeometry(L).h / 2) },
          };
        })()
      : null;
  const tankRef = useRef(tank);
  useLayoutEffect(() => {
    tankRef.current = tank;
  });

  // the truck holding the tank: parked under it (its resting pose, set directly); once the tank has
  // gone without the crane (reduced motion), it simply goes too
  useLayoutEffect(() => {
    const truck = truckRef.current;
    if (!truck || carrying) return;
    if (tank && tankShown && !minutes?.hidden) {
      parkDx.current = tank.dx;
      truck.style.visibility = 'visible';
      truck.style.transform = `translateX(${tank.dx}px)`;
    } else if (!tankShown && parkDx.current !== null) {
      parkDx.current = null;
      truck.style.visibility = 'hidden';
      truck.style.transform = '';
    }
  });

  // the nose is in place: the grabber that brought it still holds it, at its top
  useLayoutEffect(() => {
    const Lx = layoutRef.current;
    if (arrival !== 'reveal' || !minutesOn || reduced || !Lx) return;
    placeHook({ x: Lx.cx, y: Lx.rocketTop });
    setGrip(true);
    // (once, as the question comes in)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival]);

  // the delivery: the truck comes along the road with the tank standing on its bed (one rigid
  // thing) and stops dead at the left; meanwhile the grabber lets go of the nose, slowly, and goes
  // up, along and down into its ring
  useLayoutEffect(() => {
    const Lx = layoutRef.current;
    const truck = truckRef.current;
    const box = tankBoxRef.current;
    const at = tankRef.current;
    if (arrival !== 'deliver' || !Lx || !truck || !box || !at) return;
    const inFrom = -(Lx.truck.stopLeft + Lx.truck.width + 16);
    const timing = { duration: ARRIVE.deliverMs, easing: EASE_STOP };
    const anims = [
      truck.animate([{ transform: `translateX(${inFrom}px)` }, { transform: `translateX(${at.dx}px)` }], timing),
      box.animate([{ transform: `translateX(${inFrom - at.dx}px)` }, { transform: 'translateX(0px)' }], timing),
    ];
    creatorSfx('truckIn');
    const from = { x: Lx.cx, y: Lx.rocketTop };
    const letGo = ARRIVE.letGoMs / ARRIVE.deliverMs;
    placeHook(at.hang);
    moveHook(
      [
        { ...from, offset: 0 },
        { ...from, offset: letGo, easing: 'cubic-bezier(0.45, 0, 0.3, 1)' },
        { x: from.x, y: Lx.pick.parkY, offset: letGo + 0.2, easing: 'cubic-bezier(0.45, 0, 0.3, 1)' },
        { x: at.hang.x, y: Lx.pick.parkY, offset: 0.8, easing: 'cubic-bezier(0.45, 0, 0.3, 1)' },
        { ...at.hang, offset: 1 },
      ],
      ARRIVE.deliverMs,
    );
    // (its jaws open slowly, a moment in)
    const open = setTimeout(() => {
      setGrip(false);
      creatorSfx('hookRelease');
    }, Math.round(ARRIVE.letGoMs * 0.4));
    return () => {
      clearTimeout(open);
      anims.forEach((a) => a.cancel());
    };
    // (once, as the delivery starts)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arrival]);

  // once it is there, the grabber hangs open in its ring (and stays there if the ring moves)
  const hangX = tank?.hang.x;
  const hangY = tank?.hang.y;
  useEffect(() => {
    if (!minutesOn || minutes?.hidden || arrival !== 'ready' || carrying || reduced || hangX === undefined || hangY === undefined) return;
    const now = hookNow();
    setGrip(false);
    if (Math.hypot(now.x - hangX, now.y - hangY) > 0.5) glideHook({ x: hangX, y: hangY }, GRAB.hoverMs);
    // (the helpers read refs only)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minutesOn, minutes?.hidden, arrival, carrying, reduced, hangX, hangY]);

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
          <Crane L={L} uid={uid} jibRef={jibRef} cableRef={cableRef} pickOut={!reduced && (picking !== null || carrying || (minutesOn && revealed))} reduced={reduced} />
          {/* the mechanics' platform on the tower, at the seam being bolted */}
          <MechanicsPlatform L={L} y={L.platform[seamPiece]} bolting={bolting} reduced={reduced} />
          <Truck L={L} lift={truckLift} truckRef={truckRef} liftRef={liftRef} scissorRef={scissorRef} />
          {/* the piece on its way (on the truck, or sliding up into place) */}
          {moving?.from ? (
            // the answer's piece (or the minutes' tank) on its way: it rides the truck's drive and the
            // lift (the two outer layers move exactly as they do), the grab moves it inside them
            <div ref={flyRef} className="pointer-events-none absolute left-0 top-0 z-[21]">
              <div>
                <div
                  className="absolute [transform-origin:50%_50%]"
                  style={{ left: moving.from.x, top: moving.from.y, width: moving.tank ? moving.tank.w : L.pieces[moving.piece].len, height: moving.tank ? moving.tank.h : L.box }}
                >
                  {moving.tank ? (
                    <>
                      <div data-fly-tank="" className="absolute inset-0">
                        <TankArt w={moving.tank.w} h={moving.tank.h} minutes={moving.tank.minutes} />
                      </div>
                      <div
                        data-fly-piece=""
                        className="absolute left-1/2 top-1/2"
                        style={{ opacity: 0, width: L.pieces.minutes.len, height: L.box, transform: `translate(-50%, -50%) rotate(-90deg) scale(${(moving.tank.h / L.pieces.minutes.len).toFixed(4)}, ${(moving.tank.w / L.box).toFixed(4)})` }}
                      >
                        <RocketPiece piece="minutes" L={L} label={moving.label ?? labels.minutes} measure={measure} lying className="block" />
                      </div>
                    </>
                  ) : (
                    <RocketPiece piece={moving.piece} L={L} label={moving.label ?? labels[moving.piece]} measure={measure} lying className="block" />
                  )}
                </div>
              </div>
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
            // (it comes in once the nose is in place)
            <div
              className="pointer-events-none absolute inset-0 z-[17]"
              style={{ opacity: revealed ? 1 : 0, transform: revealed ? 'none' : 'scale(0.94)', transformOrigin: `${porthole.x}px ${porthole.y}px`, transition: reduced ? 'none' : 'opacity 500ms ease-out, transform 500ms cubic-bezier(0.2, 0.8, 0.3, 1)' }}
            >
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
            </div>
          )}
          {/* the crane's picking hook over the loose answers (blocks, intensity) */}
          <PickHook L={L} shown={!reduced && (picking !== null || carrying || (minutesOn && revealed && !minutes?.hidden))} hookRef={hookRef} trolleyRef={trolleyRef} wireRef={wireRef} />
          {/* the minutes' tank on its truck's bed, and the ring the grabber waits in («Enganchar») */}
          {minutes && tank && (
            <>
              <div ref={tankBoxRef} className="absolute z-[21]" style={{ left: L.column.left, top: tank.top, visibility: tankShown ? undefined : 'hidden' }}>
                <MinutesTank value={minutes.value} onChange={minutes.onChange} width={tank.colW} height={tank.h} light={!ink} reduced={reduced} ready={arrival === 'ready'} hidden={minutes.hidden} />
              </div>
              <HookRing
                light={!ink}
                reduced={reduced}
                disabled={arrival !== 'ready' || minutes.hidden}
                onClick={(button) => {
                  const body = tankBoxRef.current?.querySelector<HTMLElement>('[data-tank]');
                  if (body) minutes.onHook(body, button);
                }}
                // (the ring's middle exactly at its spot: «Enganchar» hangs under it)
                style={{ left: tank.ring.x, top: tank.ring.y, translate: '-50% -28px', zIndex: 21, opacity: tankShown && !minutes.hidden ? 1 : 0, transition: reduced ? 'none' : 'opacity 300ms ease-out' }}
              />
            </>
          )}
          {/* the questions (or the sentence), on the left (they come in once the nose is in place) */}
          <div
            ref={columnRef}
            className="absolute z-20 overflow-y-auto overflow-x-hidden px-[14px] pb-4 [scrollbar-width:none]"
            style={{ left: L.column.left - 14, top: L.column.top, width: L.column.right - L.column.left + 28, bottom: L.H - L.cambiarTop - 44, opacity: revealed ? 1 : 0, transform: revealed ? 'none' : 'translateX(24px)', transition: reduced ? 'none' : 'opacity 450ms ease-out, transform 450ms cubic-bezier(0.2, 0.8, 0.3, 1)' }}
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

/** The grabber's sizes (scene px): its box (the jaws' tip at its bottom centre, the cable's shackle `eye` px down from its top), the trolley, where its wire starts. */
function hookGeometry(L: AssemblyLayout) {
  const u = L.T / 36;
  const h = Math.round(19 * u);
  return { w: Math.round(26 * u), h, eye: Math.round(h * 0.1), trolleyW: Math.round(16 * u), trolleyH: Math.max(3, Math.round(5 * u)), wireTop: L.jib.y + L.jib.h + Math.max(3, Math.round(5 * u)) };
}

/**
 * The crane's grabber: a trolley on the arm, its cable and a small claw (its jaws' tip at the bottom
 * centre of its box). Moved by the scene through refs (Web Animations, and its resting pose set
 * directly); parked over the waiting truck's spot until it is needed.
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
    // (shown at once, resting where it hangs: no entrance that must run first; it fades when it goes)
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-[22]" style={{ opacity: shown ? 1 : 0, transition: shown ? 'none' : 'opacity 300ms ease' }}>
      <div
        ref={trolleyRef}
        className="absolute left-0"
        style={{ top: L.jib.y + L.jib.h, width: g.trolleyW, height: g.trolleyH, background: DAWN.plate, boxShadow: `inset 0 0 0 1px ${STEEL}`, transform: `translateX(${park.x - g.trolleyW / 2}px)` }}
      />
      <div
        ref={wireRef}
        className="absolute left-0 origin-top"
        style={{ top: g.wireTop, width: 1.3, height: 1, background: C.ink, transform: `translateX(${park.x}px) scaleY(${Math.max(0.01, park.y - g.h + g.eye - g.wireTop)})` }}
      />
      {/* the grabber: its jaws open, closing on a piece's top under [data-grip] */}
      <div ref={hookRef} className="absolute left-0 top-0" style={{ width: g.w, height: g.h, transform: `translate(${park.x - g.w / 2}px, ${park.y - g.h}px)` }}>
        <svg viewBox="-12 -1 24 17.4" className="h-full w-full overflow-visible">
          <Claw />
        </svg>
      </div>
    </div>
  );
}

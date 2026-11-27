'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { useReducedMotion } from 'motion/react';
import { PadRocket } from '@/components/workout/PadRocket';
import { PAD_COLORS as C, padRocketGeometry, type LabelFit } from '@/components/workout/padRocketShape';
import { useTextMeasure } from '@/components/workout/textMeasure';
import { fitDrumLabel } from '@/components/workout/drumLabel';
import { stepsTo, type RandomLanding } from '@/components/workout/drumRandom';
import {
  LAUNCH,
  WHEEL,
  animSpeed,
  baseLayout,
  baseScene,
  centreIndex,
  clampsOpen,
  entrySpin,
  glide,
  glideEase,
  launchTimeline,
  nearestPos,
  rouletteEase,
  rouletteMs,
  rouletteSteps,
  rouletteSwapAt,
  standingWindow,
  ticksBetween,
  wheelSlot,
  wrapOffset,
  type BaseLayout,
  type BaseScene,
  type LaunchTimeline,
} from '@/components/workout/launchDrum';
import {
  CREW,
  HOP,
  boardingPlan,
  crewAirTarget,
  crewFacing,
  crewLift,
  crewMode,
  crewMove,
  crewPoint,
  hopMode,
  stepAir,
  stepSoundDue,
  stepsCrossed,
  trackPath,
  trackSpans,
  type CrewTrack,
} from '@/components/workout/padCrew';
import { getAudioContext } from '@/lib/audio';
import { creatorSfx } from '@/lib/audio/creatorSfx';
import { sfxCue } from '@/lib/audio/sfxCue';
import { DAWN, DawnClouds, RoadCars, RoadLamp, Skyline, SteelTower } from '@/components/workout/dawnScene';
import { BASE_DAY } from '@/components/workout/assembly';

/*
 * The rocket base of the first screen (phone). At rest it is calm: the dawn scene, a heading
 * («O elige una rutina hecha») with a small round Random button, and one translucent panel holding
 * a selection wheel of today's suggestions as rockets: five in sight, the chosen one full size in
 * the band across the middle (held by two clamps, its engine lit and trembling, the crew on its
 * top), its neighbours smaller and fainter, the outer ones smaller still, faint, blurred and cut by
 * the panel's edge. Dragging turns it with inertia (a flick glides on and slows down) and it always
 * settles on a rocket; it wraps around. Each time the screen loads it spins by itself and slows
 * down. While it turns the clamps open and the crew hop from rocket to rocket (up in the air if it
 * goes fast or long); as it settles the clamps snap shut and the crew land on the chosen one.
 * Random spins it like a roulette. Tapping a rocket off the centre brings it there; tapping the
 * centred one launches it: now the structure (towers, ladder, walkway) rises into view, the other
 * rockets, the panel and the heading go, the two astronauts board through the hatch, the rocket
 * stands up, the launch tower slides in and docks, ignition, lift-off; then `onLaunch` (the creator
 * carries on exactly as when a suggestion was picked).
 *
 * (The typed sentence no longer takes off from here: the page's crane carries its nose to the
 * questions. The crew stay with the wheel's chosen rocket.)
 *
 * Performance: nothing here re-renders per frame. One requestAnimationFrame loop (running only
 * while something moves) writes transforms, opacity and the outer rockets' blur through refs; a
 * rocket at rest has no transform left at all. React state changes only when the wheel settles,
 * on resize and when the fonts arrive (to fit the labels).
 */

interface LaunchBaseProps {
  suggestions: readonly string[];
  /** the rocket at the centre when it appears (the last one, after "Cambiar") */
  initialIndex: number;
  /** the wheel came to rest with this rocket at the centre */
  onCentre: (index: number) => void;
  /** the centred rocket was tapped: its launch starts (block the rest of the screen); inside the tap */
  onLaunchStart?: (suggestion: string) => void;
  /**
   * Asked once, as a launch starts: may it hold on the pad before ignition? It returns true and
   * calls go when the rocket may ignite (the routine is ready and its sentence has been read), or
   * false: the launch goes on as always.
   */
  liftGate?: (go: () => void, hold: LaunchHold) => boolean;
  /** a held launch (liftGate) lifts off now: where its pad is on the screen, px */
  onLiftOff?: (pad: { x: number; y: number }) => void;
  /** Random: where to land (any sentence of the bank; null: one of the wheel's at random) */
  onRandom?: (centre: number) => RandomLanding | null;
  /** ...and put that sentence on that rocket (called while it is out of sight) */
  onSwap?: (index: number, text: string) => void;
  /** the launched rocket is out of sight: go on with this suggestion */
  onLaunch: (suggestion: string) => void;
}

/** A launch held on the pad: where its rocket's window and top will be on the screen once it stands there, and in how long. */
export interface LaunchHold {
  window: { x: number; y: number; r: number };
  top: number;
  uprightInMs: number;
}

type Anim = { from: number; to: number; t0: number; dur: number; ease: (p: number) => number };
type Drag = { id: number; y0: number; pos0: number; lastY: number; lastT: number; v: number; moved: boolean };
/** How much of the structure is in sight: none (at rest), all (a launch). */
type Structure = '' | 'full';

const LABEL_MIN = 11;
const clockNow = () => performance.now();
const ASTRO_UNIT = 34; // astronaut drawing: body thickness / this = its scale
/** a release this long after the finger last moved has no flick left in it, ms */
const FLICK_STALE_MS = 90;

// (the labels are measured in the page's font: textMeasure.ts, shared with the creator's bar)
export { useTextMeasure };

export function LaunchBase({ suggestions, initialIndex, onCentre, onLaunchStart, onLaunch, onRandom, onSwap, liftGate, onLiftOff }: LaunchBaseProps) {
  const reduced = useReducedMotion() ?? false;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number; safe: number } | null>(null);
  const measure = useTextMeasure(rootRef);
  const n = suggestions.length;
  const [centre, setCentre] = useState(() => (n > 0 ? ((initialIndex % n) + n) % n : 0));

  // ── size, safe area, font ────────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const probe = root.querySelector<HTMLElement>('[data-safe-probe]');
    const read = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      if (w === 0 || h === 0) return;
      const safe = probe ? parseFloat(getComputedStyle(probe).paddingBottom) || 0 : 0;
      setSize((s) => (s && s.w === w && s.h === h && s.safe === safe ? s : { w, h, safe }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(root);
    return () => ro.disconnect();
  }, []);

  const L: BaseLayout | null = useMemo(() => (size ? baseLayout(size.w, size.h, size.safe) : null), [size]);
  const scene: BaseScene | null = useMemo(() => (L ? baseScene(L) : null), [L]);
  const G = useMemo(() => (L ? padRocketGeometry({ length: L.rocket.length, body: L.rocket.body, hatch: true }) : null), [L]);
  const fits: LabelFit[] = useMemo(() => {
    if (!G) return [];
    const room = G.label.x1 - G.label.x0;
    const max = Math.round(G.T * 0.52);
    return suggestions.map((s) => fitDrumLabel(s, room, { max, min: LABEL_MIN }, measure));
  }, [G, suggestions, measure]);

  const track: CrewTrack | null = useMemo(() => {
    if (!L || !G || !G.hatch) return null;
    const hatchX = L.rocket.left + G.hatch.x + G.hatch.w / 2;
    const ladderX = L.tower.rightX + L.tower.w / 2;
    const deckY = L.centreY - G.T / 2 - G.stroke / 2;
    const standB = Math.round(G.T * 0.1);
    return { hatchX, ladderX, deckY, ladderTop: L.tower.top + 16, standB, standA: standB + Math.round(G.T * 0.6) };
  }, [L, G]);
  const gap = G ? Math.round(G.T * 0.6) : 20;

  const trackRef = useRef<CrewTrack | null>(null);
  // a launch: the panel no longer cuts (freed), and only the launched rocket is left (kept)
  const [freed, setFreed] = useState(false);
  const [kept, setKept] = useState<number | null>(null);

  // ── the moving parts, through refs ───────────────────────────────────────────────────────
  const pos = useRef(centre);
  const anim = useRef<Anim | null>(null);
  const drag = useRef<Drag | null>(null);
  const rolling = useRef(false);
  const busy = useRef(false);
  const suppressClick = useRef(false);
  const lastTick = useRef(centre);
  const rockets = useRef<(HTMLButtonElement | null)[]>([]);
  const wheelLayer = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const shownIndex = useRef(-1);
  const astros = useRef<(HTMLDivElement | null)[]>([]);
  const crew = useRef({ a: 0, b: 0, facingA: -1 as 1 | -1, facingB: 1 as 1 | -1, boarding: false, air: 0, lifted: false, landUntil: 0 });
  const lastStep = useRef(-Infinity);
  const raf = useRef<number | null>(null);
  const frameRef = useRef<((now: number) => void) | null>(null);
  const last = useRef(0);
  const moving = useRef(false);
  const movedAt = useRef(0);
  const structure = useRef<Structure>('');
  const entered = useRef(false);
  const pending = useRef<(() => void)[]>([]);
  const alive = useRef(true);
  const callbacks = useRef({ onCentre, onLaunch, onLaunchStart, liftGate, onLiftOff });
  useLayoutEffect(() => {
    callbacks.current = { onCentre, onLaunch, onLaunchStart, liftGate, onLiftOff };
  });

  // a drag of this many px moves the wheel one rocket
  const stepPx = L ? L.wheel.y[1] : 60;

  /** How much of the structure shows (a launch's "all" stays). */
  const showStructure = useCallback((kind: Structure) => {
    const root = rootRef.current;
    if (!root || structure.current === 'full' || structure.current === kind) return;
    structure.current = kind;
    if (kind) root.setAttribute('data-structure', kind);
    else root.removeAttribute('data-structure');
  }, []);

  const paintWheel = useCallback(() => {
    if (!L) return;
    const p = pos.current;
    for (let i = 0; i < n; i++) {
      const el = rockets.current[i];
      if (!el) continue;
      const slot = wheelSlot(wrapOffset(i, p, n), L.wheel);
      // (at rest in the centre: no transform at all, so it stays crisp)
      const still = Math.abs(slot.y) < 0.01 && Math.abs(slot.scale - 1) < 1e-4;
      el.style.transform = still ? '' : `translate(0px, ${slot.y.toFixed(2)}px) scale(${slot.scale.toFixed(4)})`;
      el.style.opacity = slot.opacity.toFixed(3);
      el.style.zIndex = String(slot.z);
      const blur = slot.blur > 0 ? `blur(${slot.blur}px)` : '';
      if (el.style.filter !== blur) el.style.filter = blur;
      // (out of sight but still in the list: a screen reader can reach it, a finger can't)
      el.style.pointerEvents = slot.visible && slot.opacity > 0.02 ? 'auto' : 'none';
    }
    // the counter («3 de 9») follows the rocket passing through the band
    const idx = centreIndex(p, n);
    if (idx !== shownIndex.current && counterRef.current) {
      shownIndex.current = idx;
      counterRef.current.textContent = `${idx + 1} de ${n}`;
    }
    if (ticksBetween(lastTick.current, p) > 0) {
      lastTick.current = p;
      creatorSfx('wheelTick');
    }
  }, [L, n]);

  const paintCrew = useCallback((modeA: string, modeB: string, liftA = 0, liftB = 0) => {
    const T = trackRef.current;
    if (!T) return;
    const c = crew.current;
    const pts = [crewPoint(c.a, T), crewPoint(c.b, T)];
    const lifts = [liftA, liftB];
    const facing = [c.facingA, c.facingB];
    const modes = [modeA, modeB];
    astros.current.forEach((el, i) => {
      if (!el) return;
      el.style.transform = `translate(${pts[i].x.toFixed(2)}px, ${(pts[i].y - lifts[i]).toFixed(2)}px)`;
      const fig = el.firstElementChild as HTMLElement | null;
      if (fig) {
        if (fig.dataset.mode !== modes[i]) fig.dataset.mode = modes[i];
        fig.style.transform = `scaleX(${facing[i]})`;
      }
    });
  }, []);

  const setLive = useCallback(
    (index: number | null) => {
      for (let i = 0; i < n; i++) rockets.current[i]?.toggleAttribute('data-live', i === index);
    },
    [n],
  );

  const settle = useCallback(() => {
    moving.current = false;
    // the clamps snap shut on the chosen rocket («pum»: CSS), the crew land on it this same frame
    rootRef.current?.toggleAttribute('data-moving', clampsOpen(false));
    // «pum», and the chosen rocket's engine comes to life
    creatorSfx('clampShut');
    creatorSfx('engineStart');
    const idx = centreIndex(pos.current, n);
    pos.current = idx;
    lastTick.current = idx;
    paintWheel();
    setLive(idx);
    setCentre(idx);
    callbacks.current.onCentre(idx);
  }, [n, paintWheel, setLive]);

  const frame = useCallback(
    (now: number) => {
      raf.current = null;
      const dt = Math.min(64, now - (last.current || now));
      last.current = now;
      let active = false;
      // the wheel
      let speed = 0; // steps per second
      let remaining: number | null = null; // ms until it stops (null: a finger is on it)
      const a = anim.current;
      if (a) {
        const p = a.dur <= 0 ? 1 : (now - a.t0) / a.dur;
        pos.current = a.from + (a.to - a.from) * a.ease(p);
        speed = animSpeed(a.from, a.to, a.dur, Math.min(1, Math.max(0, p)), a.ease);
        remaining = Math.max(0, a.t0 + a.dur - now);
        if (p >= 1) {
          pos.current = a.to;
          anim.current = null;
          rolling.current = false;
          remaining = 0;
        } else active = true;
      }
      const d = drag.current;
      if (d?.moved) {
        active = true;
        speed = Math.abs(d.v) * 1000;
        remaining = null;
      }
      paintWheel();
      const isMoving = active;
      if (!isMoving && moving.current) settle();
      // the crew
      const c = crew.current;
      const T = trackRef.current;
      if (T && G && !c.boarding && !reduced) {
        // on the centred rocket, at their places
        const tA = Math.max(T.standA, c.b + gap);
        const prevA = c.a;
        c.a = crewMove(c.a, tA, dt, T);
        const tB = T.standB;
        const prevB = c.b;
        c.b = crewMove(c.b, tB, dt, T);
        if (c.a !== prevA) c.facingA = crewFacing(prevA, c.a, T, c.facingA);
        if (c.b !== prevB) c.facingB = crewFacing(prevB, c.b, T, c.facingB);
        // waiting: facing each other (A looks left, B right)
        if (Math.abs(c.a - tA) < 0.01) c.facingA = -1;
        if (Math.abs(c.b - tB) < 0.01) c.facingB = 1;
        // a footstep per stride on the walkways, a rung per rung on the ladder (the pair: one sound,
        // and never a rattle: CREW.soundGapMs between two)
        const was = crewPoint(prevA, T);
        const is = crewPoint(c.a, T);
        if (stepSoundDue(stepsCrossed(prevA, c.a, was.onLadder || is.onLadder ? CREW.rung : CREW.stride), now, lastStep.current)) {
          lastStep.current = now;
          creatorSfx(is.onLadder ? 'crewRung' : 'crewStep');
        }
        // on the centred rocket while the wheel turns: they hop from rocket to rocket (up in the air
        // if it goes fast or long), and land as it settles
        const { deck } = trackSpans(T);
        // (the hull ends at the nose's base: from there the walkway runs to the tower)
        const hullEnd = L ? L.rocket.left + G.body.x1 - T.hatchX : deck;
        const onRocket = c.a <= hullEnd + 0.5 && c.b <= hullEnd + 0.5;
        let liftA = 0;
        let liftB = 0;
        if (onRocket && isMoving) {
          c.air = stepAir(c.air, crewAirTarget(speed, now - movedAt.current), dt);
          liftA = crewLift({ pos: pos.current, air: c.air, t: now, remainingMs: remaining, T: G.T });
          liftB = crewLift({ pos: pos.current, lag: HOP.lag, air: c.air, t: now + HOP.bobMs * 0.37, remainingMs: remaining, T: G.T });
          if (Math.max(liftA, liftB) > 0.15 * G.T) c.lifted = true;
        } else {
          c.air = 0;
          if (c.lifted && !isMoving) {
            // touchdown: a little squash, and a step on the steel
            c.lifted = false;
            c.landUntil = now + HOP.landMs;
            creatorSfx('crewLand');
          }
        }
        const landing = now < c.landUntil;
        const modeA = liftA > 0 || (onRocket && isMoving) ? hopMode(liftA, c.air, G.T) : landing ? 'land' : crewMode(c.a, tA, T);
        const modeB = liftB > 0 || (onRocket && isMoving) ? hopMode(liftB, c.air, G.T) : landing ? 'land' : crewMode(c.b, tB, T);
        paintCrew(modeA, modeB, liftA, liftB);
        if (Math.abs(c.a - tA) > 0.01 || Math.abs(c.b - tB) > 0.01 || landing) active = true;
      }
      if (active) raf.current = requestAnimationFrame((t) => frameRef.current?.(t));
    },
    [paintWheel, paintCrew, settle, gap, reduced, G, L],
  );

  useLayoutEffect(() => {
    frameRef.current = frame;
  }, [frame]);
  const kick = useCallback(() => {
    if (raf.current === null) {
      last.current = performance.now();
      raf.current = requestAnimationFrame((t) => frameRef.current?.(t));
    }
  }, []);

  const startMoving = useCallback(() => {
    if (!moving.current) {
      moving.current = true;
      movedAt.current = performance.now();
      // the clamps open (CSS)
      rootRef.current?.toggleAttribute('data-moving', clampsOpen(true));
      setLive(null);
    }
  }, [setLive]);

  const animateTo = useCallback(
    (to: number, dur: number, ease: (p: number) => number) => {
      startMoving();
      anim.current = { from: pos.current, to, t0: performance.now(), dur: reduced ? Math.min(dur, 120) : dur, ease };
      kick();
    },
    [kick, reduced, startMoving],
  );

  // first paint, and again whenever the layout changes (resize, fonts)
  useLayoutEffect(() => {
    trackRef.current = track;
    if (!L || !track) return;
    paintWheel();
    if (!moving.current) setLive(centreIndex(pos.current, n));
    crew.current.a = track.standA;
    crew.current.b = track.standB;
    paintCrew('stand', 'stand');
  }, [L, track, paintWheel, paintCrew, setLive, n, fits]);

  // each time the start screen loads: the wheel spins by itself and slows down onto its rocket
  // (none with reduced motion)
  useEffect(() => {
    if (!L) return;
    if (entered.current) {
      if (anim.current) kick(); // (React's dev double mount cancelled the frame)
      return;
    }
    entered.current = true;
    if (reduced || n < 2 || busy.current) return;
    const spin = entrySpin(Math.round(pos.current), n);
    pos.current = spin.from;
    lastTick.current = spin.from;
    startMoving();
    anim.current = { from: spin.from, to: spin.to, t0: performance.now(), dur: spin.dur, ease: rouletteEase };
    kick();
  }, [L, n, reduced, kick, startMoving]);

  useEffect(() => {
    alive.current = true;
    return () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      // (cleared, or a later kick would think a frame is still coming: React's dev double mount)
      raf.current = null;
      alive.current = false;
      pending.current.forEach((fn) => fn());
      pending.current = [];
    };
  }, []);

  // ── input ────────────────────────────────────────────────────────────────────────────────
  /** Sound may start from here on (inside a touch). */
  const wake = () => {
    try {
      getAudioContext();
    } catch {
      // no sound, no problem
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (busy.current || rolling.current || !L) return;
    if ((e.target as Element).closest('[data-no-drag]')) return;
    wake();
    drag.current = { id: e.pointerId, y0: e.clientY, pos0: pos.current, lastY: e.clientY, lastT: e.timeStamp, v: 0, moved: false };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dy = e.clientY - d.y0;
    if (!d.moved) {
      if (Math.abs(dy) < WHEEL.dragSlop) return;
      d.moved = true;
      suppressClick.current = true;
      // (captured only now: a plain tap still reaches the rocket's button)
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // fine without
      }
      // (a finger on a turning wheel catches it where it is)
      anim.current = null;
      d.pos0 = pos.current + dy / stepPx;
      startMoving();
    }
    pos.current = d.pos0 - dy / stepPx;
    const dtv = Math.max(1, e.timeStamp - d.lastT);
    const v = -(e.clientY - d.lastY) / stepPx / dtv;
    d.v = d.v * 0.6 + v * 0.4;
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    kick();
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!d.moved) return;
    // let go: it glides on with the finger's speed and settles on a rocket
    const v = e.timeStamp - d.lastT > FLICK_STALE_MS ? 0 : d.v;
    const { to, dur } = glide(pos.current, v);
    animateTo(to, dur, glideEase);
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const go = (index: number) => {
    animateTo(nearestPos(anim.current ? anim.current.to : pos.current, index, n), 380, glideEase);
  };

  const step = (by: number) => {
    if (busy.current || rolling.current) return;
    const from = anim.current ? anim.current.to : Math.round(pos.current);
    const to = from + by;
    animateTo(to, WHEEL.snapMs, glideEase);
    rockets.current[centreIndex(to, n)]?.focus({ preventScroll: true });
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      step(-1);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      step(1);
    }
  };

  const random = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (busy.current || rolling.current || drag.current?.moved || n < 2) return;
    wake();
    creatorSfx('randomButton', { gesture: true });
    const button = e.currentTarget;
    button.setAttribute('data-hit', '');
    setTimeout(() => button.removeAttribute('data-hit'), 170);
    const from = anim.current ? anim.current.to : Math.round(pos.current);
    const pick = onRandom?.(centreIndex(from, n)) ?? null;
    const steps = pick ? stepsTo(centreIndex(from, n), pick.index, n) : rouletteSteps(n);
    const swapIn = pick && pick.text !== suggestions[pick.index] ? () => onSwap?.(pick.index, pick.text) : null;
    if (reduced) {
      // no roulette: the wheel fades, the new one is there, it fades back
      const layer = wheelLayer.current;
      const target = from + (steps % n === 0 ? 1 : steps % n);
      const out = layer?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
      const swap = () => {
        anim.current = null;
        swapIn?.();
        pos.current = target;
        startMoving();
        settle();
        layer?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
        out?.cancel();
      };
      if (out) out.onfinish = swap;
      else swap();
      return;
    }
    rolling.current = true;
    animateTo(from + steps, rouletteMs(steps), rouletteEase);
    if (swapIn) {
      const t = setTimeout(swapIn, rouletteSwapAt(from, steps, n, pick?.index ?? 0) * rouletteMs(steps));
      pending.current.push(() => clearTimeout(t));
    }
  };

  // ── the launch ───────────────────────────────────────────────────────────────────────────
  /** A step of the launch `ms` from now (cancelled if the base goes). */
  const later = (ms: number, fn: () => void) => {
    const t = setTimeout(fn, ms);
    pending.current.push(() => clearTimeout(t));
  };

  /**
   * From the pad on, the same for every launch: the rocket `el` stands up (from `onPad` to
   * `upright`), the launch tower slides in from the left and its arms dock, ignition, lift-off
   * out of the top of the screen; `onEnd` once it is out of sight. `body`: the hull's thickness on
   * the pad, px. A launch the page holds (liftGate) waits on the pad, docked, before ignition.
   */
  const padSequence = (
    el: HTMLElement,
    tl: LaunchTimeline,
    onPad: () => string,
    upright: string,
    liftTo: (out: number) => string,
    standY: number,
    k: number,
    body: number,
    onEnd: () => void,
    standing: { box: { W: number; H: number }; window: { cx: number; cy: number; r: number }; scale: number },
  ) => {
    const root = rootRef.current;
    if (!root || !L) return;
    // 7. ignition: flame, a harder tremble, smoke at the pad
    const ignite = () => {
      el.setAttribute('data-ignite', '');
      root.setAttribute('data-ignite', '');
    };
    // 8. lift-off: the arms let go and it climbs out of the top of the screen
    const lift = () => {
      root.querySelectorAll<SVGGElement>('[data-gantry-arm]').forEach((arm) =>
        arm.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.12)' }], { duration: 140, fill: 'forwards' }),
      );
      const top = root.getBoundingClientRect().top;
      const out = standY - (top + L.centreY + standY + (L.rocket.length * k) / 2 + 2 * body + 40);
      el.animate([{ transform: upright }, { transform: liftTo(out) }], {
        duration: LAUNCH.liftMs,
        easing: 'cubic-bezier(0.55, 0, 0.85, 0.35)',
        fill: 'forwards',
      });
    };

    // held on the pad until the page lets it go (both: its time has come, and the go)
    let due = false;
    let open = false;
    let fired = false;
    const fire = () => {
      if (fired || !due || !open || !alive.current) return;
      fired = true;
      ignite();
      creatorSfx('ignite');
      later(LAUNCH.igniteMs, () => {
        creatorSfx('liftOff');
        lift();
        const box = root.getBoundingClientRect();
        callbacks.current.onLiftOff?.({ x: box.left + L.rocket.cx, y: box.top + L.padY });
      });
      later(LAUNCH.igniteMs + LAUNCH.liftMs, onEnd);
    };
    // (where its window will be, on the screen, for the page's porthole to zoom into)
    const rb = root.getBoundingClientRect();
    const w = standingWindow(standing.box, standing.window, { cx: L.rocket.cx, cy: L.centreY, standY, scale: standing.scale });
    const held =
      callbacks.current.liftGate?.(
        () => {
          open = true;
          fire();
        },
        { window: { x: rb.left + w.x, y: rb.top + w.y, r: w.r }, top: rb.top + w.top, uprightInMs: tl.towerAt },
      ) ?? false;

    const cues = [
      sfxCue(clockNow() + tl.dockAt + LAUNCH.dockMs * 0.8, () => creatorSfx('gantryDock')),
      ...(held
        ? []
        : [sfxCue(clockNow() + tl.igniteAt, () => creatorSfx('ignite')), sfxCue(clockNow() + tl.liftAt, () => creatorSfx('liftOff'))]),
    ];
    pending.current.push(() => cues.forEach((cue) => cue?.cancel()));

    // 4. the rocket stands up over the pad
    later(tl.turnAt, () => {
      el.removeAttribute('data-live');
      el.animate([{ transform: onPad() }, { transform: upright }], { duration: LAUNCH.turnMs, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' });
    });

    // 5. the launch tower slides in from the left, 6. its arms dock
    const gantry = root.querySelector<SVGSVGElement>('[data-gantry]');
    later(tl.towerAt, () => {
      gantry?.animate([{ transform: `translateX(${-L.width}px)` }, { transform: 'translateX(0px)' }], {
        duration: LAUNCH.towerMs,
        easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.08)',
        fill: 'forwards',
      });
    });
    later(tl.dockAt, () => {
      root.querySelectorAll<SVGGElement>('[data-gantry-arm]').forEach((arm) =>
        arm.animate([{ transform: 'scaleX(0.12)' }, { transform: 'scaleX(1)' }], { duration: LAUNCH.dockMs, easing: 'cubic-bezier(0.3, 0, 0.2, 1.3)', fill: 'forwards' }),
      );
    });

    if (held) {
      later(tl.igniteAt, () => {
        due = true;
        fire();
      });
      return;
    }
    later(tl.igniteAt, ignite);
    later(tl.liftAt, lift);
    later(tl.endAt, onEnd);
  };

  /** The rocket's upright place over the pad: how much it shrinks (k) and how far down it stands. */
  const padPlace = (Lb: BaseLayout) => {
    const k = Math.min(1, (Lb.padY - 10) / Lb.rocket.length);
    return { k, standY: Lb.padY - (Lb.rocket.length * k) / 2 - Lb.centreY };
  };

  /**
   * The crew walk along the track to the door at `to` (s) and hop in one after the other through
   * it, at `door` (in the base): `walkMs` long (both arrive by then), hops at `hopAt`.
   */
  const boardCrew = (T: CrewTrack, to: number, walkMs: number, hopAt: [number, number], door: { x: number; y: number }, gtT: number) => {
    const c = crew.current;
    const top = crewPoint(to, T);
    const hop: Keyframe[] = [
      { transform: `translate(${top.x}px, ${top.y}px) scale(1)`, opacity: 1 },
      { transform: `translate(${top.x}px, ${top.y - gtT * 0.22}px) scale(0.95)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${door.x}px, ${door.y}px) scale(0.7)`, opacity: 0 },
    ];
    [c.b, c.a].forEach((s, i) => {
      const node = astros.current[i === 0 ? 1 : 0];
      const fig = node?.firstElementChild as HTMLElement | null;
      if (!node) return;
      if (walkMs > 0 && Math.abs(s - to) > 0.5) {
        if (fig) {
          fig.dataset.mode = 'walk';
          fig.style.transform = `scaleX(${top.x >= crewPoint(s, T).x ? 1 : -1})`;
        }
        node.animate(
          trackPath(s, to, T).map((p) => ({ transform: `translate(${p.x}px, ${p.y}px)`, offset: p.offset })),
          { duration: walkMs, fill: 'forwards' },
        );
      }
      later(walkMs, () => {
        if (fig) fig.dataset.mode = 'stand';
      });
      // the door opens, they step in one after the other, it closes
      later(hopAt[i], () => {
        creatorSfx('crewBoard');
        node.animate(hop, { duration: LAUNCH.hopMs, easing: 'ease-in', fill: 'forwards' });
      });
    });
  };

  /** The wheel goes: all its rockets but `keep`, its panel, the heading and Random. */
  const clearWheel = (keep: number | null) => {
    const root = rootRef.current;
    if (!root) return;
    const fade = { duration: LAUNCH.fadeMs, fill: 'forwards' as const };
    root.querySelectorAll<HTMLElement>('[data-chrome]').forEach((node) => node.animate([{ opacity: 1 }, { opacity: 0 }], fade));
    rockets.current.forEach((r, i) => {
      if (r && i !== keep) r.animate([{ opacity: r.style.opacity || '1' }, { opacity: 0 }], fade);
    });
  };

  /** The structure goes (the towers, the clamps, the walkway, the ladder). */
  const clearFittings = () => {
    const root = rootRef.current;
    if (!root) return;
    const fade = { duration: LAUNCH.fadeMs, fill: 'forwards' as const };
    root.querySelectorAll<HTMLElement | SVGElement>('[data-fitting]').forEach((node) => node.animate([{ opacity: 1 }, { opacity: 0 }], fade));
  };

  const launch = (index: number) => {
    const root = rootRef.current;
    const el = rockets.current[index];
    const T = trackRef.current;
    if (!root || !el || !L || !G || !T) return;
    busy.current = true;
    wake();
    callbacks.current.onLaunchStart?.(suggestions[index]);
    const text = suggestions[index];
    const finish = () => callbacks.current.onLaunch(text);

    // the whole structure comes into view (with reduced motion it is simply there)
    showStructure('full');
    if (reduced) {
      root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LAUNCH.reducedMs, fill: 'forwards' });
      later(LAUNCH.reducedMs, finish);
      return;
    }
    // the other rockets leave, the panel and the heading fade; then they are gone for good (out of
    // the layout too) and the panel's edge no longer cuts: the chosen one may stand up below it and
    // fly out of the top (never below the base: the page must not grow a scroll)
    clearWheel(index);
    // (in React state: a re-render, e.g. on a resize, must not bring the panel's cut back)
    later(LAUNCH.fadeMs, () => {
      setKept(index);
      setFreed(true);
    });

    const c = crew.current;
    c.boarding = true;
    const plan = boardingPlan(c.a, c.b, T, LAUNCH.maxWalkMs);
    const tl = launchTimeline(plan.walkMs);

    // 1. the crew walks to the hatch (down from the ladder or the bar first, if that is where they are)…
    // 2. …the door opens, they step in one after the other, it closes
    boardCrew(T, 0, plan.walkMs, tl.hopAt, { x: crewPoint(0, T).x, y: L.centreY + (G.hatch?.h ?? 20) * 0.3 }, G.T);
    later(tl.doorOpenAt, () => el.setAttribute('data-hatch-open', ''));
    later(tl.doorCloseAt, () => el.removeAttribute('data-hatch-open'));

    // 3. the structure goes
    later(tl.fadeAt, clearFittings);

    // 4–8. it stands up, the tower docks, ignition, lift-off
    const { k, standY } = padPlace(L);
    const upright = `translate(0px, ${standY}px) rotate(-90deg) scale(${k})`;
    padSequence(el, tl, () => el.style.transform || 'none', upright, (out) => `translate(0px, ${out}px) rotate(-90deg) scale(${k})`, standY, k, G.T, finish, { box: G, window: G.window, scale: k });
  };

  const onRocket = (index: number) => {
    if (suppressClick.current || busy.current || rolling.current) return;
    if (index === centreIndex(pos.current, n) && !moving.current && !anim.current) launch(index);
    else go(index);
  };

  // ── drawing ──────────────────────────────────────────────────────────────────────────────
  const P = L?.panel;
  return (
    <div
      ref={rootRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="relative z-20 h-[clamp(236px,calc(var(--pad-dvh,1dvh)*40),380px)] w-full touch-none select-none text-ink"
      // (the page's own dark: the dawn sky starts in it, so the base is no separate block)
      style={{ background: BASE_PAGE }}
    >
      <div data-safe-probe="" aria-hidden="true" className="pointer-events-none invisible absolute h-0 w-0 pb-[env(safe-area-inset-bottom)]" />
      {L && P && G && track && scene && (
        <>
          <Backdrop L={L} scene={scene} uid={uid} />
          {/* the heading and the small round Random */}
          <div data-chrome="" className="absolute z-[36] flex items-center justify-between gap-3" style={{ left: P.x + 4, right: L.width - P.x - P.w, top: L.head.y, height: L.head.h }}>
            <p id={`${uid}-title`} className="truncate text-[15px] font-semibold text-white">
              O elige una rutina hecha
            </p>
            <RandomButton onClick={random} />
          </div>
          {/* the wheel's panel, its selection band and the counter */}
          <div
            data-chrome=""
            aria-hidden="true"
            className="pointer-events-none absolute z-[5] border border-white/12 bg-[#161413]/62"
            style={{ left: P.x, top: P.y, width: P.w, height: P.h, borderRadius: P.r }}
          />
          <div
            data-chrome=""
            aria-hidden="true"
            className="pointer-events-none absolute z-[6] rounded-[14px] border-[1.2px] border-white/40 bg-white/8"
            style={{ left: L.band.x0 - 2, width: L.band.x1 - L.band.x0 + 4, top: L.centreY - L.wheel.band, height: 2 * L.wheel.band }}
          />
          <FlightBox height={L.height} className="z-10">
          <div
            ref={wheelLayer}
            // (the panel's rounded edge cuts the outer rockets until a launch frees the chosen one)
            className="absolute inset-0"
            style={freed ? undefined : { clipPath: `inset(${P.y}px ${L.width - P.x - P.w}px ${L.height - P.y - P.h}px ${P.x}px round ${P.r}px)` }}
          >
            <ul role="list" aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-hint`} className="contents">
              {suggestions.map((s, i) => (
                <li key={i} className="contents">
                  <button
                    ref={(node) => {
                      rockets.current[i] = node;
                    }}
                    type="button"
                    tabIndex={i === centre ? 0 : -1}
                    aria-current={i === centre ? 'true' : undefined}
                    aria-label={i === centre ? `${s}: despegar` : s}
                    onClick={() => onRocket(i)}
                    onKeyDown={onKey}
                    className="pad-drum-rocket absolute cursor-pointer rounded-full outline-none [transform-origin:50%_50%] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                    style={{ left: L.rocket.left, top: L.centreY - G.H / 2, width: G.W, height: G.H, opacity: 0, display: kept !== null && i !== kept ? 'none' : undefined }}
                  >
                    <span className="pad-shake pointer-events-none absolute inset-0">
                      <PadRocket g={G} label={fits[i] ? { text: fits[i].text, px: fits[i].px } : null} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          </FlightBox>
          <span
            ref={counterRef}
            data-chrome=""
            aria-hidden="true"
            className="pointer-events-none absolute z-[12] text-[12px] font-semibold tabular-nums text-white/70"
            style={{ right: L.width - P.x - P.w + 12, top: P.y + P.h - 24 }}
          />
          <Clamps L={L} G={G} />
          <Foreground L={L} G={G} track={track} />
          {/* the crew: one pair, living in the base */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-30" data-crew="">
            {[0, 1].map((i) => (
              <div
                key={i}
                ref={(node) => {
                  astros.current[i] = node;
                }}
                className="absolute left-0 top-0"
              >
                <Astronaut scale={G.T / ASTRO_UNIT} delay={i === 0 ? 0 : -2.3} />
              </div>
            ))}
          </div>
          <Gantry L={L} G={G} />
          <p id={`${uid}-hint`} className="sr-only">
            Desliza arriba o abajo, o usa las flechas, para girar la rueda. Toca el cohete del centro para despegar.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Where the rockets fly: the base's own box, reaching far up above it (they fly out of the top of
 * the screen, uncut) but cut at its bottom and sides, so a lit flame or a rocket out of sight never
 * makes the page longer than the screen.
 */
function FlightBox({ height, className, children }: { height: number; className: string; children: React.ReactNode }) {
  return (
    <div className={`pointer-events-none absolute inset-x-0 bottom-0 top-[-100vh] overflow-hidden ${className}`}>
      <div className="absolute inset-x-0 bottom-0" style={{ height }}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The pieces of the base (static SVG; only the clamps and the cars move). The scene is "Amanecer"
// (approved 26-11-2026, fondos-base.html, variant A): numbers in launchDrum.ts (baseScene), colours
// in dawnScene.tsx.

type Geo = ReturnType<typeof padRocketGeometry>;

/** The base page itself, behind its scene (the same dark as the page, so nothing shows as a block). */
export const BASE_PAGE = DAWN.page;

/**
 * Behind everything: the dawn sky (from the page's dark), the sun low on the horizon, two thin lit
 * clouds, the far skyline, the ground and its road with two lamps and a few cars passing.
 */
function Backdrop({ L, scene, uid }: { L: BaseLayout; scene: BaseScene; uid: string }) {
  const { width: W, height: H } = L;
  const { k, horizon: hz, road } = scene;
  const X = (x: number) => x * k;
  const q = road.h / 20; // the sketch's road is 20 px
  return (
    <svg aria-hidden="true" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0">
      <defs>
        <linearGradient id={`${uid}-sky`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={hz + 1}>
          {DAWN.sky.map((c, i) => (
            <stop key={c} offset={DAWN.skyAt[i]} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={`${uid}-day`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={hz + 1}>
          {BASE_DAY.map(([at, c]) => (
            <stop key={c} offset={at} stopColor={c} />
          ))}
        </linearGradient>
        <linearGradient id={`${uid}-gnd`} gradientUnits="userSpaceOnUse" x1={0} y1={hz} x2={0} y2={H}>
          <stop offset={0} stopColor={DAWN.ground[0]} />
          <stop offset={1} stopColor={DAWN.ground[1]} />
        </linearGradient>
        <radialGradient id={`${uid}-glow`}>
          <stop offset={0} stopColor={DAWN.glow} stopOpacity={0.85} />
          <stop offset={1} stopColor={DAWN.glow} stopOpacity={0} />
        </radialGradient>
        <clipPath id={`${uid}-sky-clip`}>
          <rect width={W} height={hz + 1} />
        </clipPath>
      </defs>
      {/* the sky, the sun half under the horizon, two thin lit clouds */}
      <rect width={W} height={hz + 1} fill={`url(#${uid}-sky)`} />
      {/* (the day, over the dawn: off unless the page sets --pad-day to 1, while a routine takes off
          straight from here; the sun climbs with it) */}
      <rect width={W} height={hz + 1} fill={`url(#${uid}-day)`} className="pad-day" />
      <g clipPath={`url(#${uid}-sky-clip)`}>
        <g className="pad-sun" style={{ ['--pad-sun-up' as string]: `${-Math.round(hz * 0.5)}px` }}>
          <circle cx={X(92)} cy={hz - 1} r={118 * k} fill={`url(#${uid}-glow)`} />
          <circle cx={X(92)} cy={hz - 1} r={22 * k} fill={DAWN.sun} />
        </g>
      </g>
      <DawnClouds hz={hz} k={k} />
      {/* the far skyline: hills, a hangar, a small gantry with its rocket, a water tower */}
      <Skyline W={W} hz={hz} k={k} />
      {/* the ground and its road: shoulders, the dashed centre line, two lamps */}
      <rect y={hz} width={W} height={H - hz} fill={`url(#${uid}-gnd)`} />
      <rect y={road.top} width={W} height={road.h} fill={DAWN.road} />
      <path d={`M0 ${road.top}H${W}M0 ${road.top + road.h}H${W}`} stroke={DAWN.roadEdge} strokeOpacity={0.7} strokeWidth={0.8} />
      <path d={`M0 ${road.top + road.h / 2}H${W}`} stroke={DAWN.roadLine} strokeOpacity={0.55} strokeWidth={1} strokeDasharray={`${9 * q} ${8 * q}`} />
      <RoadLamp x={X(118)} top={road.top} q={q} />
      <RoadLamp x={X(204)} top={road.top} q={q} />
      {/* a few cars, both ways, long gaps between them (CSS: pad-car-*; parked with reduced motion) */}
      <RoadCars W={W} top={road.top} q={q} />
    </svg>
  );
}

/** A lattice tower's outline path (the launch tower's): frame, X bracing. */
function towerPath(x: number, w: number, top: number, bottom: number): string {
  const bay = Math.round(w * 1.4);
  let d = `M${x} ${top}V${bottom}M${x + w} ${top}V${bottom}`;
  let y = top;
  let flip = false;
  while (y < bottom - 1) {
    const y2 = Math.min(bottom, y + bay);
    d += flip ? `M${x + w} ${y}L${x} ${y2}` : `M${x} ${y}L${x + w} ${y2}`;
    d += `M${x} ${y2}H${x + w}`;
    y = y2;
    flip = !flip;
  }
  return d;
}

/**
 * The structure, out of sight at rest (CSS: pad-st, shown by the base's data-structure): the left
 * tower with its hose (for a launch), and the right tower with the crew's ladder and the walkway
 * from it to the centred rocket's top (both for a launch).
 */
function Foreground({ L, G, track }: { L: BaseLayout; G: Geo; track: CrewTrack }) {
  const { width: W, height: H, tower: t } = L;
  const top = t.top + 6;
  const bottom = H;
  const ladderX = track.ladderX;
  const rungs: number[] = [];
  for (let y = top + 8; y < bottom - 4; y += 7) rungs.push(y);
  const walkX0 = L.rocket.left + G.body.x1;
  const walkX1 = t.rightX;
  const railY = track.deckY - G.T * 0.55;
  return (
    <svg aria-hidden="true" data-fitting="" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 z-20">
      <g className="pad-st pad-st-left">
        <SteelTower x={t.leftX} w={t.w} top={top} bottom={bottom} />
        {/* the hose from the left tower down into the base */}
        <path d={`M${t.leftX + t.w / 2} ${bottom - 7}Q${t.leftX + t.w + 8} ${bottom} ${L.rocket.left + 22} ${bottom - 6}`} fill="none" stroke={DAWN.steel} strokeWidth={1.2} />
      </g>
      <g className="pad-st pad-st-right">
        <SteelTower x={t.rightX} w={t.w} top={top} bottom={bottom} />
        {/* the ladder on the right tower (light, to read on the steel) */}
        <g stroke={DAWN.ladder} strokeWidth={0.9} fill="none">
          <path d={`M${ladderX - 4} ${top + 2}V${bottom - 2}M${ladderX + 4} ${top + 2}V${bottom - 2}`} strokeWidth={1.2} />
          <path d={rungs.map((y) => `M${ladderX - 4} ${y}H${ladderX + 4}`).join('')} />
        </g>
        {/* the crew walkway, from the right tower to the hatch's side of the nose */}
        <g stroke={DAWN.steel} strokeWidth={1} fill={DAWN.plate}>
          <rect x={walkX0} y={track.deckY} width={walkX1 - walkX0} height={3.4} />
          <path d={`M${walkX0 + 4} ${railY}H${walkX1}M${walkX0 + 4} ${railY}V${track.deckY}M${(walkX0 + walkX1) / 2} ${railY}V${track.deckY}`} fill="none" strokeWidth={0.9} />
        </g>
      </g>
    </svg>
  );
}

/**
 * The two clamps either side of the selection band (the towers' inner edges, where the towers come
 * for a launch): two hooks over and under the engine ring (left) and a cradle at the antenna
 * (right). Shut on the centred rocket at rest; open while the wheel turns (the base's
 * data-moving); they snap shut as it settles (CSS).
 */
function Clamps({ L, G }: { L: BaseLayout; G: Geo }) {
  const { width: W, height: H } = L;
  const cy = L.centreY;
  const ringX = L.rocket.left + G.ring.x + G.ring.w / 2;
  const hullTop = cy - G.T / 2;
  const hullBottom = cy + G.T / 2;
  const leftEdge = L.band.x0;
  const rightEdge = L.band.x1;
  const noseEnd = L.rocket.left + G.W;
  return (
    <svg aria-hidden="true" data-fitting="" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 z-20">
      <g stroke={DAWN.steel} strokeWidth={1} fill={DAWN.plate} strokeLinejoin="round">
        <g className="pad-hook-top">
          <path d={`M${leftEdge} ${hullTop - 9}H${ringX + 3}V${hullTop + 1}H${ringX - 3}V${hullTop - 4}H${leftEdge}Z`} />
          <circle cx={leftEdge + 4} cy={hullTop - 6.5} r={1.1} fill={DAWN.steel} stroke="none" />
        </g>
        <g className="pad-hook-bottom">
          <path d={`M${leftEdge} ${hullBottom + 9}H${ringX + 3}V${hullBottom - 1}H${ringX - 3}V${hullBottom + 4}H${leftEdge}Z`} />
          <circle cx={leftEdge + 4} cy={hullBottom + 6.5} r={1.1} fill={DAWN.steel} stroke="none" />
        </g>
        <g className="pad-cradle">
          <path d={`M${rightEdge} ${cy - 3}H${noseEnd + 4}V${cy - 7}H${noseEnd - 2}V${cy - 5}M${rightEdge} ${cy + 3}H${noseEnd + 4}V${cy + 7}H${noseEnd - 2}V${cy + 5}`} />
          <rect x={noseEnd + 2} y={cy - 3} width={Math.max(0, rightEdge - noseEnd - 2)} height={6} />
        </g>
      </g>
    </svg>
  );
}

/** An astronaut, drawn with its feet at (0, 0); `data-mode` (stand, walk, climb, hop, float, land) picks its moves. */
function Astronaut({ scale, delay }: { scale: number; delay: number }) {
  const w = 18 * scale;
  const h = 22 * scale;
  return (
    <div className="pad-astro absolute" data-mode="stand" style={{ left: -w / 2, top: -h, width: w, height: h, ['--pad-delay' as string]: `${delay}s` }}>
      <svg width={w} height={h} viewBox="-9 -21.5 18 22" style={{ overflow: 'visible' }}>
        <g className="pad-sway" stroke={C.ink} strokeLinecap="round" strokeLinejoin="round">
          <rect x={-5.7} y={-12.4} width={3} height={6} rx={1} fill={C.shade} strokeWidth={0.9} />
          <line className="pad-leg pad-leg-a" x1={-1.1} y1={-5.2} x2={-1.5} y2={-0.4} strokeWidth={1.8} />
          <line className="pad-leg pad-leg-b" x1={1.1} y1={-5.2} x2={1.5} y2={-0.4} strokeWidth={1.8} />
          <rect x={-3} y={-12.5} width={6} height={8} rx={2} fill={C.hull} strokeWidth={1} />
          <path d="M-3 -8.6H3" stroke={C.red} strokeWidth={1} />
          <line className="pad-arm" x1={1.8} y1={-11} x2={3.9} y2={-7.2} strokeWidth={1.4} />
          <g className="pad-head">
            <circle cx={0} cy={-15.8} r={3.7} fill={C.hull} strokeWidth={1} />
            <ellipse cx={1.4} cy={-15.8} rx={1.7} ry={2} fill={C.glass} strokeWidth={0.6} />
          </g>
        </g>
      </svg>
    </div>
  );
}

/**
 * Random: a small round red button (the emergency mushroom in its yellow and black hazard ring)
 * beside the heading, with the word «Random» before it. It spins the wheel like a roulette.
 */
function RandomButton({ onClick }: { onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button
      type="button"
      data-no-drag=""
      onClick={onClick}
      aria-label="Random: girar la ruleta"
      className="pad-random -mr-1 flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full pl-2 pr-1 text-[13px] font-medium text-white/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
    >
      <span aria-hidden="true">Random</span>
      <svg width={30} height={30} viewBox="-16 -16 32 32" aria-hidden="true">
        <circle r={15} fill={DAWN.dark} />
        <circle r={13} fill="none" stroke={DAWN.hazard} strokeWidth={3} strokeDasharray="3.4 3.4" />
        <circle r={10.6} fill={DAWN.dark} />
        <circle cy={1.4} r={9} fill="#a8241c" />
        <g className="pad-dome">
          <circle cy={-1.2} r={9} fill={C.red} stroke={DAWN.dark} strokeWidth={1} />
          <ellipse cx={-3.3} cy={-4.6} rx={3.3} ry={1.7} fill={C.flameMid} transform="rotate(-28 -3.3 -4.6)" />
        </g>
      </svg>
    </button>
  );
}

/** The launch tower and its pad, in the same dark steel: off to the left until the launch, when it slides in and docks. */
function Gantry({ L, G }: { L: BaseLayout; G: Geo }) {
  const { width: W, height: H, padY } = L;
  const k = Math.min(1, (padY - 10) / L.rocket.length);
  const hull = G.T * k;
  const rocketTop = padY - L.rocket.length * k;
  const tw = Math.max(18, Math.round(L.tower.w * 1.15));
  const cx = L.rocket.cx;
  const tx = cx - hull / 2 - 12 - tw;
  const ttop = Math.max(6, rocketTop + 6);
  const gapHalf = hull / 2 + 6;
  const arms = [0.24, 0.52, 0.8].map((f) => padY - L.rocket.length * k * f);
  return (
    <svg
      aria-hidden="true"
      data-gantry=""
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="pointer-events-none absolute inset-0 z-40"
      style={{ transform: `translateX(${-W}px)`, overflow: 'visible' }}
    >
      <g stroke={DAWN.steel} strokeWidth={1.1} fill={DAWN.plate} strokeLinejoin="round">
        {/* the pad: a deck either side of the flame's opening, on legs */}
        <rect x={tx - 12} y={padY} width={cx - gapHalf - (tx - 12)} height={9} rx={1.5} />
        <rect x={cx + gapHalf} y={padY} width={cx - gapHalf - (tx - 12) - 10} height={9} rx={1.5} />
        {/* (its legs reach the ground: the pad stands above the flame's room) */}
        <path d={`M${tx - 4} ${padY + 9}V${H}M${cx - gapHalf - 6} ${padY + 9}V${H}M${cx + gapHalf + 6} ${padY + 9}V${H}`} fill="none" strokeWidth={2} />
        {/* the tower: a steel lattice, no fill */}
        <path d={towerPath(tx, tw, ttop, padY)} fill="none" stroke={DAWN.brace} strokeWidth={1} />
        <path d={`M${tx} ${ttop}V${padY}M${tx + tw} ${ttop}V${padY}`} fill="none" strokeWidth={2.2} />
        <rect x={tx - 4} y={ttop - 6} width={tw + 30} height={5} rx={1} />
        <path d={`M${tx + tw / 2} ${ttop - 6}V${ttop - 18}`} fill="none" strokeWidth={1.2} />
        {/* the swing arms, folded until they dock */}
        {arms.map((y) => (
          <g key={y} data-gantry-arm="" style={{ transformOrigin: `${tx + tw}px ${y}px`, transform: 'scaleX(0.12)' }}>
            <rect x={tx + tw} y={y - 3} width={cx - hull / 2 - (tx + tw) + 1} height={6} />
            <path d={`M${tx + tw + 4} ${y - 3}L${tx + tw + 10} ${y + 3}M${tx + tw + 10} ${y - 3}L${tx + tw + 16} ${y + 3}`} fill="none" stroke={DAWN.brace} strokeWidth={1} />
            <rect x={cx - hull / 2 - 3} y={y - 6} width={5} height={12} rx={1.5} fill={DAWN.steel} stroke="none" />
          </g>
        ))}
      </g>
      <circle cx={tx + tw / 2} cy={ttop - 20} r={6} fill={C.red} opacity={0.25} />
      <circle cx={tx + tw / 2} cy={ttop - 20} r={2.4} fill={C.red} />
      {/* smoke at ignition */}
      {[-1, 1, -1, 1, -1, 1].map((dir, i) => (
        <circle
          key={i}
          className="pad-smoke"
          cx={cx + dir * (hull / 2 + 4)}
          cy={padY - 4 + (i % 3) * 3}
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

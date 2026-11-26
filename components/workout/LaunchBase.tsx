'use client';

import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
  type RefObject,
} from 'react';
import { flushSync } from 'react-dom';
import { useReducedMotion } from 'motion/react';
import { PadRocket } from '@/components/workout/PadRocket';
import { PAD_COLORS as C, padRocketGeometry, type LabelFit, type PadRocketGeometry } from '@/components/workout/padRocketShape';
import { useTextMeasure } from '@/components/workout/textMeasure';
import { fitDrumLabel } from '@/components/workout/drumLabel';
import { stepsTo, type RandomLanding } from '@/components/workout/drumRandom';
import {
  BAR_LAUNCH,
  DRUM,
  LAUNCH,
  barLaunchTimeline,
  barOnPad,
  baseLayout,
  baseScene,
  centreIndex,
  drumSlot,
  launchTimeline,
  nearestPos,
  rouletteEase,
  rouletteMs,
  rouletteSteps,
  rouletteSwapAt,
  snapEase,
  snapTarget,
  ticksBetween,
  wrapOffset,
  SCENE,
  type BaseLayout,
  type BaseScene,
  type LaunchTimeline,
} from '@/components/workout/launchDrum';
import {
  CREW,
  barRoof,
  boardingPlan,
  climbTarget,
  crewFacing,
  crewMode,
  crewMove,
  crewPoint,
  onRoof,
  remapOnTrack,
  roofSpot,
  roofStands,
  stepSoundDue,
  stepsCrossed,
  trackPath,
  trackSpans,
  type CrewTrack,
} from '@/components/workout/padCrew';
import { getAudioContext } from '@/lib/audio';
import { playSfx } from '@/lib/audio/sfx';
import { sfxCue } from '@/lib/audio/sfxCue';
import { DAWN, RoadCars, RoadLamp, Skyline, SteelTower } from '@/components/workout/dawnScene';
import { BASE_DAY } from '@/components/workout/assembly';

/*
 * The rocket base of the first screen (phone): today's suggestions as rockets on a vertical drum
 * between two lattice towers. Dragging turns the drum like a wheel seen from above and it snaps to
 * a rocket on release; the centred one is held by the clamps, its engine lit and trembling. The red
 * button spins it like a roulette. Tapping a rocket off the centre brings it there; tapping the
 * centred one launches it: the two astronauts board through the hatch, the rest of the base goes,
 * the rocket stands up, the launch tower slides in and docks, ignition, lift-off; then `onLaunch`
 * (the creator carries on exactly as when a suggestion was picked).
 *
 * The text bar above the base (the sentence's rocket) is part of the show: while its field has
 * focus (`crewUp`) the right tower's ladder telescopes up to the bar and the crew climb onto the
 * bar's top to wait there; a typed sentence (`launchBar`, through the ref) takes off with the same
 * launch: the crew get in through its round window, it comes down to the pad while the drum
 * clears away, stands up, the tower docks, lift-off.
 *
 * Performance: nothing here re-renders per frame. One requestAnimationFrame loop (running only
 * while something moves) writes transforms and opacity through refs; React state changes only when
 * the drum settles, on resize and when the fonts arrive (to fit the labels).
 */

interface LaunchBaseProps {
  suggestions: readonly string[];
  /** the rocket at the centre when it appears (the last one, after "Cambiar") */
  initialIndex: number;
  /** the drum came to rest with this rocket at the centre */
  onCentre: (index: number) => void;
  /** the centred rocket was tapped: its launch starts (block the rest of the screen); inside the tap */
  onLaunchStart?: (suggestion: string) => void;
  /**
   * Asked once, as a launch starts: may it hold on the pad before ignition? It returns true and
   * calls go when the rocket may ignite (the routine is ready and its sentence has been read), or
   * false: the launch goes on as always.
   */
  liftGate?: (go: () => void) => boolean;
  /** a held launch (liftGate) lifts off now: where its pad is on the screen, px */
  onLiftOff?: (pad: { x: number; y: number }) => void;
  /** Random: where to land (any sentence of the bank; null: one of the drum's at random) */
  onRandom?: (centre: number) => RandomLanding | null;
  /** ...and put that sentence on that rocket (called while it is out of sight) */
  onSwap?: (index: number, text: string) => void;
  /** the launched rocket is out of sight: go on with this suggestion */
  onLaunch: (suggestion: string) => void;
  /** the sentence's field has focus: the crew climb onto the text bar's top and wait there */
  crewUp?: boolean;
  /** the text bar (its box), its rocket's geometry, and how far that rocket reaches left of the box, px */
  barRef?: RefObject<HTMLElement | null>;
  barG?: PadRocketGeometry;
  barHang?: number;
  ref?: Ref<LaunchBaseHandle>;
}

export interface LaunchBaseHandle {
  /**
   * The typed sentence takes off from the base with the text bar's rocket; `onGone` once it is out
   * of sight. False when it cannot (reduced motion, no base on screen, a launch already going):
   * the caller then flies it as before.
   */
  launchBar: (text: string, onGone: () => void) => boolean;
}

/** The text bar's rocket while it flies from the base: its drawing, label, start and size on the pad. */
interface Visitor {
  g: PadRocketGeometry;
  label: { text: string; px: number };
  /** its box's top-left in the base when it starts (the bar's place) */
  box: { x: number; y: number };
  from: string;
  scale: number;
  body: number;
}

type Anim = { from: number; to: number; t0: number; dur: number; ease: (p: number) => number };
type Drag = { id: number; y0: number; pos0: number; lastY: number; lastT: number; v: number; moved: boolean };

const LABEL_MIN = 11;
const clockNow = () => performance.now();
const ASTRO_UNIT = 34; // astronaut drawing: body thickness / this = its scale

// (the labels are measured in the page's font: textMeasure.ts, shared with the creator's bar)
export { useTextMeasure };

export function LaunchBase({ suggestions, initialIndex, onCentre, onLaunchStart, onLaunch, onRandom, onSwap, liftGate, onLiftOff, crewUp = false, barRef, barG, barHang = 0, ref }: LaunchBaseProps) {
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

  // ── the text bar above the base: where its rocket is, in the base (no transforms: offsets) ──
  const [barBox, setBarBox] = useState<{ x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const bar = barRef?.current;
    if (!root || !bar || !L) return;
    const read = () => {
      let x: number;
      let y: number;
      if (bar.offsetParent && bar.offsetParent === root.offsetParent) {
        x = bar.offsetLeft - root.offsetLeft;
        y = bar.offsetTop - root.offsetTop;
      } else {
        const a = bar.getBoundingClientRect();
        const b = root.getBoundingClientRect();
        x = a.left - b.left;
        y = a.top - b.top;
      }
      // (the base draws inside its border: its top border is 2 px)
      x -= barHang + root.clientLeft;
      y -= root.clientTop;
      setBarBox((old) => (old && old.x === x && old.y === y ? old : { x, y }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(bar);
    ro.observe(root);
    return () => ro.disconnect();
  }, [L, barRef, barHang, crewUp]);
  const roof = useMemo(
    () => (track && barBox && barG ? barRoof(barBox.x, barBox.y, { bodyTop: barG.body.top, stroke: barG.stroke, noseX: barG.body.x1 }, track.ladderTop, gap) : null),
    [track, barBox, barG, gap],
  );
  // the whole track (the base's, and the bar's top once it is measured)
  const fullTrack: CrewTrack | null = useMemo(() => (track ? { ...track, roof } : null), [track, roof]);
  const trackRef = useRef<CrewTrack | null>(null);
  // the ladder's extension and the bar's gangway are out (they telescope up while the crew go there)
  const [roofOut, setRoofOut] = useState(false);
  const roofOutRef = useRef(false);
  const crewUpRef = useRef(crewUp);
  const [visitor, setVisitor] = useState<Visitor | null>(null);
  const visitorRef = useRef<HTMLDivElement>(null);

  // ── the moving parts, through refs ───────────────────────────────────────────────────────
  const pos = useRef(centre);
  const anim = useRef<Anim | null>(null);
  const drag = useRef<Drag | null>(null);
  const rolling = useRef(false);
  const busy = useRef(false);
  const suppressClick = useRef(false);
  const lastTick = useRef(centre);
  const rockets = useRef<(HTMLButtonElement | null)[]>([]);
  const drumLayer = useRef<HTMLDivElement>(null);
  const rails = useRef<(SVGGElement | null)[]>([]);
  const astros = useRef<(HTMLDivElement | null)[]>([]);
  const crew = useRef({ a: 0, b: 0, up: true, facingA: -1 as 1 | -1, facingB: 1 as 1 | -1, boarding: false });
  const lastStep = useRef(-Infinity);
  const raf = useRef<number | null>(null);
  const frameRef = useRef<((now: number) => void) | null>(null);
  const last = useRef(0);
  const moving = useRef(false);
  const pending = useRef<(() => void)[]>([]);
  const alive = useRef(true);
  const callbacks = useRef({ onCentre, onLaunch, onLaunchStart, liftGate, onLiftOff });
  useLayoutEffect(() => {
    callbacks.current = { onCentre, onLaunch, onLaunchStart, liftGate, onLiftOff };
  });

  const stepPx = L ? L.radius * Math.sin(DRUM.step) : 60;

  const paintDrum = useCallback(() => {
    if (!L) return;
    const p = pos.current;
    for (let i = 0; i < n; i++) {
      const el = rockets.current[i];
      if (!el) continue;
      const slot = drumSlot(wrapOffset(i, p, n), L.radius);
      el.style.transform = `translate3d(0, ${slot.y.toFixed(2)}px, 0) scale(${slot.scale.toFixed(4)})`;
      el.style.opacity = slot.opacity.toFixed(3);
      el.style.zIndex = String(slot.z);
      // (out of sight but still in the list: a screen reader can reach it, a finger can't)
      el.style.pointerEvents = slot.visible && slot.opacity > 0.02 ? 'auto' : 'none';
    }
    // the rails' light marks run with the drum (where the chains used to)
    const travel = p * stepPx;
    const pitch = SCENE.railPitch;
    const off = -(((travel % pitch) + pitch) % pitch);
    rails.current.forEach((g) => g?.setAttribute('transform', `translate(0 ${off.toFixed(2)})`));
    if (ticksBetween(lastTick.current, p) > 0) {
      lastTick.current = p;
      playSfx('drumClick');
    }
  }, [L, n, stepPx]);

  const paintCrew = useCallback(
    (modeA: string, modeB: string) => {
      const T = trackRef.current;
      if (!T) return;
      const c = crew.current;
      const pts = [crewPoint(c.a, T), crewPoint(c.b, T)];
      const facing = [c.facingA, c.facingB];
      const modes = [modeA, modeB];
      astros.current.forEach((el, i) => {
        if (!el) return;
        el.style.transform = `translate3d(${pts[i].x.toFixed(2)}px, ${pts[i].y.toFixed(2)}px, 0)`;
        const fig = el.firstElementChild as HTMLElement | null;
        if (fig) {
          if (fig.dataset.mode !== modes[i]) fig.dataset.mode = modes[i];
          fig.style.transform = `scaleX(${facing[i]})`;
        }
      });
    },
    [],
  );

  const setLive = useCallback(
    (index: number | null) => {
      for (let i = 0; i < n; i++) rockets.current[i]?.toggleAttribute('data-live', i === index);
    },
    [n],
  );

  const settle = useCallback(() => {
    moving.current = false;
    rootRef.current?.removeAttribute('data-moving');
    const idx = centreIndex(pos.current, n);
    pos.current = idx;
    lastTick.current = idx;
    paintDrum();
    setLive(idx);
    setCentre(idx);
    callbacks.current.onCentre(idx);
  }, [n, paintDrum, setLive]);

  const frame = useCallback(
    (now: number) => {
      raf.current = null;
      const dt = Math.min(64, now - (last.current || now));
      last.current = now;
      let active = false;
      // the drum
      const a = anim.current;
      if (a) {
        const p = a.dur <= 0 ? 1 : (now - a.t0) / a.dur;
        pos.current = a.from + (a.to - a.from) * a.ease(p);
        if (p >= 1) {
          pos.current = a.to;
          anim.current = null;
          rolling.current = false;
        } else active = true;
      }
      if (drag.current?.moved) active = true;
      paintDrum();
      const isMoving = active;
      if (!isMoving && moving.current) settle();
      // the crew
      const c = crew.current;
      const T = trackRef.current;
      if (T && !c.boarding && !reduced) {
        // up on the bar while its field has focus (once the ladder is out); else the drum's way
        const stands = crewUpRef.current && roofOutRef.current ? roofStands(T, gap) : null;
        const tA = stands ? stands.a : isMoving ? climbTarget(c.up, T) : Math.max(T.standA, c.b + gap);
        const prevA = c.a;
        c.a = crewMove(c.a, tA, dt, T);
        if (!stands && isMoving && Math.abs(c.a - tA) < 0.01) c.up = !c.up;
        const tB = stands ? Math.max(0, Math.min(stands.b, c.a - gap)) : isMoving ? Math.max(0, c.a - gap) : T.standB;
        const prevB = c.b;
        c.b = crewMove(c.b, tB, dt, T);
        if (c.a !== prevA) c.facingA = crewFacing(prevA, c.a, T, c.facingA);
        if (c.b !== prevB) c.facingB = crewFacing(prevB, c.b, T, c.facingB);
        // waiting: facing each other (on the base A looks left, B right; on the bar the other way round)
        if (Math.abs(c.a - tA) < 0.01 && !isMoving) c.facingA = onRoof(c.a, T) ? 1 : -1;
        if (Math.abs(c.b - tB) < 0.01 && !isMoving) c.facingB = onRoof(c.b, T) ? -1 : 1;
        // a footstep per stride on the walkways, a rung per rung on the ladder (the pair: one sound,
        // and never a rattle: CREW.soundGapMs between two)
        const was = crewPoint(prevA, T);
        const is = crewPoint(c.a, T);
        if (stepSoundDue(stepsCrossed(prevA, c.a, was.onLadder || is.onLadder ? CREW.rung : CREW.stride), now, lastStep.current)) {
          lastStep.current = now;
          playSfx(is.onLadder ? 'ladderStep' : 'metalStep');
        }
        paintCrew(crewMode(c.a, tA, T), crewMode(c.b, tB, T));
        if (Math.abs(c.a - tA) > 0.01 || Math.abs(c.b - tB) > 0.01) active = true;
        // both back below the tower's top and not wanted up there: the ladder folds away
        const { deck, up } = trackSpans(T);
        if (!crewUpRef.current && roofOutRef.current && c.a <= deck + up + 0.5 && c.b <= deck + up + 0.5) {
          roofOutRef.current = false;
          setRoofOut(false);
        }
      }
      if (active) raf.current = requestAnimationFrame((t) => frameRef.current?.(t));
    },
    [paintDrum, paintCrew, settle, gap, reduced],
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
      rootRef.current?.setAttribute('data-moving', '');
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

  // the track changed (the bar grew a line, the bar was measured): everyone stays where they stand
  useLayoutEffect(() => {
    const prev = trackRef.current;
    trackRef.current = fullTrack;
    if (!fullTrack || !prev) return;
    const c = crew.current;
    c.a = remapOnTrack(c.a, prev, fullTrack);
    c.b = remapOnTrack(c.b, prev, fullTrack);
    if (!c.boarding) paintCrew('stand', 'stand');
    kick();
  }, [fullTrack, paintCrew, kick]);

  // the field took or lost focus: the ladder telescopes up at once (it folds once they are down)
  useEffect(() => {
    crewUpRef.current = crewUp;
    if (crewUp && roof && !roofOutRef.current) {
      roofOutRef.current = true;
      setRoofOut(true);
    }
    kick();
  }, [crewUp, roof, kick]);

  // first paint, and again whenever the layout changes (resize, fonts)
  useLayoutEffect(() => {
    if (!L || !track) return;
    paintDrum();
    if (!moving.current) setLive(centreIndex(pos.current, n));
    crew.current.a = track.standA;
    crew.current.b = track.standB;
    paintCrew('stand', 'stand');
  }, [L, track, paintDrum, paintCrew, setLive, n, fits]);

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
      if (Math.abs(dy) < DRUM.dragSlop) return;
      d.moved = true;
      suppressClick.current = true;
      // (captured only now: a plain tap still reaches the rocket's button)
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // fine without
      }
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
    animateTo(snapTarget(pos.current, d.v), DRUM.snapMs, snapEase);
    setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const go = (index: number) => {
    animateTo(nearestPos(anim.current ? anim.current.to : pos.current, index, n), 380, snapEase);
  };

  const step = (by: number) => {
    if (busy.current || rolling.current) return;
    const from = anim.current ? anim.current.to : Math.round(pos.current);
    const to = from + by;
    animateTo(to, DRUM.snapMs, snapEase);
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
    playSfx('buttonThunk', { gesture: true });
    const button = e.currentTarget;
    button.setAttribute('data-hit', '');
    setTimeout(() => button.removeAttribute('data-hit'), 170);
    const from = anim.current ? anim.current.to : Math.round(pos.current);
    const pick = onRandom?.(centreIndex(from, n)) ?? null;
    const steps = pick ? stepsTo(centreIndex(from, n), pick.index, n) : rouletteSteps(n);
    const swapIn = pick && pick.text !== suggestions[pick.index] ? () => onSwap?.(pick.index, pick.text) : null;
    if (reduced) {
      // no roulette: the drum fades, the new one is there, it fades back
      const layer = drumLayer.current;
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
  /**
   * From the pad on, the same for every launch: the rocket `el` stands up (from `onPad` to
   * `upright`), the launch tower slides in from the left and its arms dock, ignition, lift-off
   * out of the top of the screen; `onEnd` once it is out of sight. `body`: the hull's thickness on
   * the pad, px. A launch the page holds (liftGate) waits on the pad, docked, before ignition.
   */
  const padSequence = (el: HTMLElement, tl: LaunchTimeline, onPad: () => string, upright: string, liftTo: (out: number) => string, standY: number, k: number, body: number, onEnd: () => void) => {
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
      playSfx('ignite');
      later(LAUNCH.igniteMs, () => {
        playSfx('launch');
        lift();
        const box = root.getBoundingClientRect();
        callbacks.current.onLiftOff?.({ x: box.left + L.rocket.cx, y: box.top + L.padY });
      });
      later(LAUNCH.igniteMs + LAUNCH.liftMs, onEnd);
    };
    const held =
      callbacks.current.liftGate?.(() => {
        open = true;
        fire();
      }) ?? false;

    const cues = [
      sfxCue(clockNow() + tl.dockAt + LAUNCH.dockMs * 0.8, () => playSfx('towerDock')),
      ...(held
        ? []
        : [sfxCue(clockNow() + tl.igniteAt, () => playSfx('ignite')), sfxCue(clockNow() + tl.liftAt, () => playSfx('launch'))]),
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
      { transform: `translate3d(${top.x}px, ${top.y}px, 0) scale(1)`, opacity: 1 },
      { transform: `translate3d(${top.x}px, ${top.y - gtT * 0.22}px, 0) scale(0.95)`, opacity: 1, offset: 0.35 },
      { transform: `translate3d(${door.x}px, ${door.y}px, 0) scale(0.7)`, opacity: 0 },
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
          trackPath(s, to, T).map((p) => ({ transform: `translate3d(${p.x}px, ${p.y}px, 0)`, offset: p.offset })),
          { duration: walkMs, fill: 'forwards' },
        );
      }
      later(walkMs, () => {
        if (fig) fig.dataset.mode = 'stand';
      });
      // the door opens, they step in one after the other, it closes
      later(hopAt[i], () => {
        playSfx('metalStep');
        node.animate(hop, { duration: LAUNCH.hopMs, easing: 'ease-in', fill: 'forwards' });
      });
    });
  };

  /** The other rockets and the drum's fittings go (all the rockets but `keep`). */
  const clearDrum = (keep: number | null) => {
    const root = rootRef.current;
    if (!root) return;
    const fade = { duration: LAUNCH.fadeMs, fill: 'forwards' as const };
    root.querySelectorAll<HTMLElement | SVGElement>('[data-fitting]').forEach((node) => node.animate([{ opacity: 1 }, { opacity: 0 }], fade));
    rockets.current.forEach((r, i) => {
      if (r && i !== keep) r.animate([{ opacity: r.style.opacity || '1' }, { opacity: 0 }], fade);
    });
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

    if (reduced) {
      root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LAUNCH.reducedMs, fill: 'forwards' });
      later(LAUNCH.reducedMs, finish);
      return;
    }

    const c = crew.current;
    c.boarding = true;
    const plan = boardingPlan(c.a, c.b, T, LAUNCH.maxWalkMs);
    const tl = launchTimeline(plan.walkMs);

    // 1. the crew walks to the hatch (down from the ladder or the bar first, if that is where they are)…
    // 2. …the door opens, they step in one after the other, it closes
    boardCrew(T, 0, plan.walkMs, tl.hopAt, { x: crewPoint(0, T).x, y: L.centreY + (G.hatch?.h ?? 20) * 0.3 }, G.T);
    later(tl.doorOpenAt, () => el.setAttribute('data-hatch-open', ''));
    later(tl.doorCloseAt, () => el.removeAttribute('data-hatch-open'));

    // 3. the other rockets and the drum's fittings go
    later(tl.fadeAt, () => clearDrum(index));

    // 4–8. it stands up, the tower docks, ignition, lift-off
    const { k, standY } = padPlace(L);
    const upright = `translate3d(0, ${standY}px, 0) rotate(-90deg) scale(${k})`;
    padSequence(el, tl, () => el.style.transform || 'none', upright, (out) => `translate3d(0, ${out}px, 0) rotate(-90deg) scale(${k})`, standY, k, G.T, finish);
  };

  /** The typed sentence's launch (see LaunchBaseHandle): the text bar's rocket flies from the base. */
  const launchBar = (text: string, onGone: () => void): boolean => {
    const root = rootRef.current;
    const T = trackRef.current;
    if (reduced || busy.current || !root || !L || !G || !T || !barG || !barBox || !T.roof) return false;
    busy.current = true;
    wake();
    // whatever the drum was doing, it stops: it is about to clear away
    anim.current = null;
    drag.current = null;
    rolling.current = false;
    // the ladder is out (the crew may still be on their way up)
    roofOutRef.current = true;
    const room = barG.label.x1 - barG.label.x0;
    const fit = fitDrumLabel(text, room, { max: Math.round(barG.Tf * 0.52), min: LABEL_MIN }, measure);
    const pad = barOnPad(L, barG.W, barG.T);
    const box = { ...barBox };
    const dx = box.x + barG.W / 2 - L.rocket.cx;
    const dy = box.y + barG.H / 2 - L.centreY;
    const at = (x: number, y: number, rz: number, s: number) => `translate3d(${x}px, ${y}px, 0) rotate(${rz}deg) scale(${s})`;
    const v: Visitor = { g: barG, label: { text: fit.text, px: fit.px }, box, from: at(dx, dy, 0, 1), scale: pad.scale, body: pad.body };
    // (drawn now, in the bar's place, before the screen paints: the bar under it can go)
    flushSync(() => {
      setRoofOut(true);
      setVisitor(v);
    });
    const el = visitorRef.current;
    if (!el) return true;

    const c = crew.current;
    c.boarding = true;
    const door = roofSpot(box.x + barG.window.cx, T);
    const plan = boardingPlan(c.a, c.b, T, BAR_LAUNCH.maxWalkMs, door);
    const tl = barLaunchTimeline(plan.walkMs);

    // 1. the crew walk (or hurry) over the bar's top to its round window, 2. it opens, they get in, it closes
    boardCrew(T, door, plan.walkMs, tl.hopAt, { x: box.x + barG.window.cx, y: box.y + barG.window.cy }, G.T);
    later(tl.doorOpenAt, () => el.setAttribute('data-window-open', ''));
    later(tl.doorCloseAt, () => el.removeAttribute('data-window-open'));

    // 3. the drum clears away (all its rockets: this one takes the centre) and it comes down to the pad
    const onPad = at(0, 0, 0, pad.scale);
    later(tl.fadeAt, () => clearDrum(null));
    later(tl.descendAt, () => {
      el.animate([{ transform: v.from }, { transform: onPad }], { duration: BAR_LAUNCH.descendMs, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' });
    });

    // 4–8. as every launch
    const { k, standY } = padPlace(L);
    padSequence(el, tl, () => onPad, at(0, standY, -90, k * pad.scale), (out) => at(0, out, -90, k * pad.scale), standY, k, pad.body, onGone);
    return true;
  };
  const launchBarRef = useRef(launchBar);
  useLayoutEffect(() => {
    launchBarRef.current = launchBar;
  });
  useImperativeHandle(ref, () => ({ launchBar: (text, onGone) => launchBarRef.current(text, onGone) }), []);

  const onRocket = (index: number) => {
    if (suppressClick.current || busy.current || rolling.current) return;
    if (index === centreIndex(pos.current, n) && !moving.current && !anim.current) launch(index);
    else go(index);
  };

  // ── drawing ──────────────────────────────────────────────────────────────────────────────
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
      {L && G && track && scene && (
        <>
          <Backdrop L={L} G={G} track={track} scene={scene} uid={uid} />
          <div ref={drumLayer} className="absolute inset-0 z-10">
            <ul role="list" aria-label="Rutinas sugeridas" aria-describedby={`${uid}-hint`} className="contents">
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
                    style={{ left: L.rocket.left, top: L.centreY - G.H / 2, width: G.W, height: G.H, opacity: 0 }}
                  >
                    <span className="pad-shake pointer-events-none absolute inset-0">
                      <PadRocket g={G} label={fits[i] ? { text: fits[i].text, px: fits[i].px } : null} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {fullTrack?.roof && barBox && barG && (
            <RoofLadder L={L} G={G} track={fullTrack} noseX={barBox.x + barG.body.x1} out={roofOut} uid={uid} />
          )}
          <Foreground L={L} G={G} track={track} scene={scene} uid={uid} rails={rails} />
          {/* the text bar's rocket, flying from the base (the typed sentence's launch) */}
          {visitor && (
            <div
              ref={visitorRef}
              aria-hidden="true"
              className="pad-visitor pointer-events-none absolute z-[25] [transform-origin:50%_50%]"
              style={{ left: L.rocket.cx - visitor.g.W / 2, top: L.centreY - visitor.g.H / 2, width: visitor.g.W, height: visitor.g.H, transform: visitor.from }}
            >
              <span className="pad-shake pointer-events-none absolute inset-0">
                <PadRocket g={visitor.g} label={visitor.label} flame={0.3} parts={{ hatch: false }} windowDoor />
              </span>
            </div>
          )}
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
          <RandomButton L={L} onClick={random} />
          <Gantry L={L} G={G} body={visitor?.body} />
          <p id={`${uid}-hint`} className="sr-only">
            Desliza arriba o abajo, o usa las flechas, para girar el tambor. Toca el cohete del centro para despegar.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The pieces of the base (static SVG; only the rails' marks, the clamps and the cars move). The
// scene is "Amanecer" (approved 26-11-2026, fondos-base.html, variant A): numbers in launchDrum.ts
// (baseScene), colours here.

type Geo = ReturnType<typeof padRocketGeometry>;

/** The base page itself, behind its scene (the same dark as the page, so nothing shows as a block). */
export const BASE_PAGE = DAWN.page;

/**
 * Behind everything: the dawn sky (from the page's dark), the sun low on the horizon, two thin lit
 * clouds, the far skyline, the ground and its road with two lamps and a few cars passing (behind
 * the towers and the console), the drum's upper dotted arc and the crew walkway in steel.
 */
function Backdrop({ L, G, track, scene, uid }: { L: BaseLayout; G: Geo; track: CrewTrack; scene: BaseScene; uid: string }) {
  const { width: W, height: H } = L;
  const { k, horizon: hz, road } = scene;
  const X = (x: number) => x * k;
  const Y = (y: number) => hz + (y - 235) * k; // a sketch y (horizon at 235) to the base
  const wellX = L.tower.leftX + L.tower.w + 3;
  const wellW = L.tower.rightX - 3 - wellX;
  const rimTop = Math.max(10, L.centreY - L.radius * 0.95);
  const walkX0 = L.rocket.left + G.body.x1;
  const walkX1 = L.tower.rightX;
  const railY = track.deckY - G.T * 0.55;
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
      <path
        d={`M${X(150)} ${Y(204)}Q${X(200)} ${Y(199)} ${X(262)} ${Y(203)}Q${X(300)} ${Y(205)} ${X(320)} ${Y(201)}V${Y(206)}Q${X(280)} ${Y(209)} ${X(240)} ${Y(207)}Q${X(190)} ${Y(205)} ${X(150)} ${Y(207)}Z`}
        fill={DAWN.cloud}
        opacity={0.38}
      />
      <path d={`M0 ${Y(214)}Q${X(30)} ${Y(211)} ${X(60)} ${Y(214)}Q${X(40)} ${Y(217)} 0 ${Y(217)}Z`} fill={DAWN.cloud} opacity={0.3} />
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
      <g data-fitting="">
        {/* the drum's upper dotted arc */}
        <path
          d={`M${wellX + 6} ${rimTop + 18}Q${W / 2} ${rimTop - 14} ${wellX + wellW - 6} ${rimTop + 18}`}
          stroke="rgba(255,255,255,0.4)"
          strokeWidth={1.2}
          strokeDasharray="3 5"
          fill="none"
        />
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
 * The right tower's ladder reaching up to the text bar's top, and a gangway from the ladder over the
 * bar rocket's nose to its hull (like the base's walkway to a drum rocket). Folded into the tower
 * until the crew go up (`out`): the ladder slides up out of the tower's top (nothing of it shows
 * below that), then the gangway unfolds; back the other way once they are down.
 */
function RoofLadder({ L, G, track, noseX, out, uid }: { L: BaseLayout; G: Geo; track: CrewTrack; noseX: number; out: boolean; uid: string }) {
  const roof = track.roof;
  if (!roof) return null;
  const { width: W, height: H } = L;
  const towerTop = L.tower.top + 6;
  const x = track.ladderX;
  const railY = roof.deckY - G.T * 0.55;
  // from the handrail above the bar's top down into the tower (clipped at the tower's top)
  const y0 = railY;
  const y1 = towerTop + 10;
  const rungs: number[] = [];
  for (let y = towerTop + 1; y > roof.deckY + 1; y -= 7) rungs.push(y);
  const walkX0 = Math.min(noseX, x - 8);
  return (
    <svg
      aria-hidden="true"
      data-fitting=""
      data-roof-out={out ? '' : undefined}
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      className="pointer-events-none absolute inset-0 z-[15]"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <clipPath id={`${uid}-ext`}>
          <rect x={x - 12} y={y0 - 4000} width={24} height={4000 + towerTop + 4 - y0} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}-ext)`}>
        <g className="pad-ext" stroke={DAWN.ladder} strokeWidth={0.9} fill="none" style={{ ['--pad-ext' as string]: `${y1 - y0 + 4}px` }}>
          <path d={`M${x - 4} ${y0}V${y1}M${x + 4} ${y0}V${y1}`} strokeWidth={1.2} />
          <path d={rungs.map((y) => `M${x - 4} ${y}H${x + 4}`).join('')} />
        </g>
      </g>
      <g className="pad-gangway" stroke={DAWN.steel} strokeWidth={1} fill={DAWN.plate} style={{ transformOrigin: `${x + 4}px ${roof.deckY}px` }}>
        <rect x={walkX0} y={roof.deckY} width={x + 4 - walkX0} height={3.4} />
        <path d={`M${walkX0 + 4} ${railY}H${x}M${walkX0 + 4} ${railY}V${roof.deckY}M${(walkX0 + x) / 2} ${railY}V${roof.deckY}`} fill="none" strokeWidth={0.9} />
      </g>
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

function Foreground({ L, G, track, scene, uid, rails }: { L: BaseLayout; G: Geo; track: CrewTrack; scene: BaseScene; uid: string; rails: React.RefObject<(SVGGElement | null)[]> }) {
  const { width: W, height: H, tower: t } = L;
  const top = t.top + 6;
  const bottom = H;
  // a slim rail down each tower's inner side, its light marks running while the drum turns
  const railX = [t.leftX + t.w + 5, t.rightX - 5];
  const railTop = top + 8;
  const railBottom = scene.horizon - 2;
  const marks: number[] = [];
  for (let y = railTop - SCENE.railPitch; y < railBottom + SCENE.railPitch; y += SCENE.railPitch) marks.push(y);
  const cy = L.centreY;
  // the clamps: two hooks over and under the engine ring (left), a cradle at the antenna (right)
  const ringX = L.rocket.left + G.ring.x + G.ring.w / 2;
  const hullTop = cy - G.T / 2;
  const hullBottom = cy + G.T / 2;
  const leftEdge = t.leftX + t.w;
  const noseEnd = L.rocket.left + G.W;
  const ladderX = track.ladderX;
  const rungs: number[] = [];
  for (let y = top + 8; y < bottom - 4; y += 7) rungs.push(y);
  const c = scene.console;
  return (
    <svg aria-hidden="true" data-fitting="" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 z-20">
      <defs>
        <clipPath id={`${uid}-rails`}>
          <rect x={0} y={railTop} width={W} height={railBottom - railTop} />
        </clipPath>
      </defs>
      {/* the towers, in dark steel */}
      <SteelTower x={t.leftX} w={t.w} top={top} bottom={bottom} />
      <SteelTower x={t.rightX} w={t.w} top={top} bottom={bottom} />
      {/* the hose from the left tower down into the base */}
      <path d={`M${t.leftX + t.w / 2} ${bottom - 7}Q${t.leftX + t.w + 8} ${bottom} ${L.rocket.left + 22} ${bottom - 6}`} fill="none" stroke={DAWN.steel} strokeWidth={1.2} />
      {/* the rails and their marks */}
      <path d={railX.map((x) => `M${x} ${railTop}V${railBottom}`).join('')} fill="none" stroke={DAWN.brace} strokeWidth={1.2} />
      {railX.map((x, i) => (
        <g key={x} clipPath={`url(#${uid}-rails)`}>
          <g
            ref={(node) => {
              rails.current[i] = node;
            }}
          >
            <path d={marks.map((y) => (i === 0 ? `M${x} ${y}h-4` : `M${x} ${y}h4`)).join('')} fill="none" stroke={DAWN.mark} strokeWidth={1.1} />
          </g>
        </g>
      ))}
      {/* the ladder on the right tower (light, to read on the steel) */}
      <g stroke={DAWN.ladder} strokeWidth={0.9} fill="none">
        <path d={`M${ladderX - 4} ${top + 2}V${bottom - 2}M${ladderX + 4} ${top + 2}V${bottom - 2}`} strokeWidth={1.2} />
        <path d={rungs.map((y) => `M${ladderX - 4} ${y}H${ladderX + 4}`).join('')} />
      </g>
      {/* the clamps */}
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
          <path d={`M${t.rightX} ${cy - 3}H${noseEnd + 4}V${cy - 7}H${noseEnd - 2}V${cy - 5}M${t.rightX} ${cy + 3}H${noseEnd + 4}V${cy + 7}H${noseEnd - 2}V${cy + 5}`} />
          <rect x={noseEnd + 2} y={cy - 3} width={t.rightX - noseEnd - 2} height={6} />
        </g>
      </g>
      {/* the Random console's two brackets to the right tower and its two legs on the ground */}
      <g fill={DAWN.plate} stroke={DAWN.steel} strokeWidth={1.1}>
        {c.brackets.map((y) => (
          <rect key={y} x={c.x0} y={y - 1.7} width={c.x1 - c.x0} height={3.4} />
        ))}
        {c.legs.map((x) => (
          <rect key={x} x={x - 1.7} y={c.legTop} width={3.4} height={H - c.legTop + 2} />
        ))}
      </g>
    </svg>
  );
}

/** An astronaut, drawn with its feet at (0, 0); `data-mode` (stand, walk, climb) picks its moves. */
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
 * The red emergency button on its console: the mushroom in its yellow and black hazard ring on a
 * dark bolted plate (bolted to the right tower and standing on the ground: Foreground draws the
 * brackets and the legs), the word RANDOM in light letters under it.
 */
function RandomButton({ L, onClick }: { L: BaseLayout; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  const { x, y, w, h } = L.random;
  return (
    <button
      type="button"
      data-no-drag=""
      data-fitting=""
      onClick={onClick}
      aria-label="Random: girar la ruleta"
      className="pad-random absolute z-[35] cursor-pointer rounded-[8px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      style={{ left: x, top: y, width: w, height: h }}
    >
      <svg width={w} height={h} viewBox="0 0 64 72" aria-hidden="true" className="absolute inset-0">
        <rect x={1} y={1} width={62} height={70} rx={6} fill={DAWN.plate} stroke={DAWN.steel} strokeWidth={1.1} />
        {[
          [7, 7],
          [57, 7],
          [7, 65],
          [57, 65],
        ].map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.1} fill={DAWN.steel} />
        ))}
        <g transform="translate(32 28) scale(0.95)">
          <circle r={22} fill={DAWN.dark} />
          <circle r={19.5} fill="none" stroke={DAWN.hazard} strokeWidth={4} strokeDasharray="5.1 5.1" />
          <circle r={16} fill={DAWN.dark} />
          <circle cy={2} r={13.5} fill="#a8241c" />
          <g className="pad-dome">
            <circle cy={-2} r={13.5} fill={C.red} stroke={DAWN.dark} strokeWidth={1.4} />
            <ellipse cx={-5} cy={-7} rx={5} ry={2.6} fill={C.flameMid} transform="rotate(-28 -5 -7)" />
          </g>
        </g>
        <text
          x={32}
          y={62}
          textAnchor="middle"
          fill={DAWN.label}
          style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 1.3, fontFamily: 'var(--font-display), system-ui, sans-serif' }}
        >
          RANDOM
        </text>
      </svg>
    </button>
  );
}

/** The launch tower and its pad, in the same dark steel: off to the left until the launch, when it slides in and docks. */
function Gantry({ L, G, body }: { L: BaseLayout; G: Geo; body?: number }) {
  const { width: W, height: H, padY } = L;
  const k = Math.min(1, (padY - 10) / L.rocket.length);
  // (the hull on the pad: a drum rocket's, or the text bar's rocket brought down to that length)
  const hull = (body ?? G.T) * k;
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
        <path d={`M${tx - 4} ${padY + 9}V${padY + 15}M${cx - gapHalf - 6} ${padY + 9}V${padY + 15}M${cx + gapHalf + 6} ${padY + 9}V${padY + 15}`} fill="none" strokeWidth={2} />
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

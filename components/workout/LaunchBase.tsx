'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useReducedMotion } from 'motion/react';
import { PadRocket } from '@/components/workout/PadRocket';
import { PAD_COLORS as C, estimateTextWidth, fitLabel, padRocketGeometry, type LabelFit, type MeasureText } from '@/components/workout/padRocketShape';
import {
  DRUM,
  LAUNCH,
  baseLayout,
  centreIndex,
  drumSlot,
  launchTimeline,
  nearestPos,
  rouletteEase,
  rouletteMs,
  rouletteSteps,
  snapEase,
  snapTarget,
  ticksBetween,
  wrapOffset,
  type BaseLayout,
} from '@/components/workout/launchDrum';
import { CREW, boardingPlan, climbTarget, crewMode, crewMove, crewPoint, stepsCrossed, trackSpans, type CrewTrack } from '@/components/workout/padCrew';
import { getAudioContext } from '@/lib/audio';
import { playSfx } from '@/lib/audio/sfx';
import { sfxCue } from '@/lib/audio/sfxCue';

/*
 * The rocket base of the first screen (phone): today's suggestions as rockets on a vertical drum
 * between two lattice towers. Dragging turns the drum like a wheel seen from above and it snaps to
 * a rocket on release; the centred one is held by the clamps, its engine lit and trembling. The red
 * button spins it like a roulette. Tapping a rocket off the centre brings it there; tapping the
 * centred one launches it: the two astronauts board through the hatch, the rest of the base goes,
 * the rocket stands up, the launch tower slides in and docks, ignition, lift-off; then `onLaunch`
 * (the creator carries on exactly as when a suggestion was picked).
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
  /** the centred rocket was tapped: its launch starts (block the rest of the screen) */
  onLaunchStart?: () => void;
  /** the launched rocket is out of sight: go on with this suggestion */
  onLaunch: (suggestion: string) => void;
}

type Anim = { from: number; to: number; t0: number; dur: number; ease: (p: number) => number };
type Drag = { id: number; y0: number; pos0: number; lastY: number; lastT: number; v: number; moved: boolean };

const LABEL_MIN = 11;
const clockNow = () => performance.now();
const ASTRO_UNIT = 34; // astronaut drawing: body thickness / this = its scale

/** The real width of a label in the page's font (a canvas measurement), once it can be made. */
function canvasMeasure(family: string): MeasureText | null {
  if (typeof document === 'undefined') return null;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  return (text, px) => {
    ctx.font = `600 ${px}px ${family}`;
    // a hair of margin for the rendering's rounding
    return ctx.measureText(text).width * 1.03 + 1;
  };
}

/**
 * Measures labels in the font `ref`'s element uses: an estimate until the browser can measure,
 * then the real widths (again once the web font has arrived).
 */
export function useTextMeasure(ref: React.RefObject<HTMLElement | null>): MeasureText {
  const [measure, setMeasure] = useState<MeasureText>(() => estimateTextWidth);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const real = () => {
      const m = canvasMeasure(getComputedStyle(el).fontFamily);
      if (alive && m) setMeasure(() => m);
    };
    real();
    document.fonts?.ready.then(real).catch(() => {});
    return () => {
      alive = false;
    };
  }, [ref]);
  return measure;
}

export function LaunchBase({ suggestions, initialIndex, onCentre, onLaunchStart, onLaunch }: LaunchBaseProps) {
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
  const G = useMemo(() => (L ? padRocketGeometry({ length: L.rocket.length, body: L.rocket.body, hatch: true }) : null), [L]);
  const fits: LabelFit[] = useMemo(() => {
    if (!G) return [];
    const room = G.label.x1 - G.label.x0;
    const max = Math.round(G.T * 0.52);
    return suggestions.map((s) => fitLabel(s, room, { max, min: LABEL_MIN }, measure));
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
  const chains = useRef<(SVGGElement | null)[]>([]);
  const gears = useRef<(SVGGElement | null)[]>([]);
  const astros = useRef<(HTMLDivElement | null)[]>([]);
  const crew = useRef({ a: 0, b: 0, up: true, facingA: -1, facingB: 1, boarding: false });
  const raf = useRef<number | null>(null);
  const frameRef = useRef<((now: number) => void) | null>(null);
  const last = useRef(0);
  const moving = useRef(false);
  const pending = useRef<(() => void)[]>([]);
  const callbacks = useRef({ onCentre, onLaunch, onLaunchStart });
  useLayoutEffect(() => {
    callbacks.current = { onCentre, onLaunch, onLaunchStart };
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
    const travel = p * stepPx;
    const pitch = 9;
    const off = -(((travel % pitch) + pitch) % pitch);
    chains.current.forEach((g) => g?.setAttribute('transform', `translate(0 ${off.toFixed(2)})`));
    gears.current.forEach((g) => {
      if (!g) return;
      const cx = Number(g.dataset.cx);
      const cy = Number(g.dataset.cy);
      g.setAttribute('transform', `rotate(${((travel / 6) * (180 / Math.PI)).toFixed(1)} ${cx} ${cy})`);
    });
    if (ticksBetween(lastTick.current, p) > 0) {
      lastTick.current = p;
      playSfx('drumClick');
    }
  }, [L, n, stepPx]);

  const paintCrew = useCallback(
    (modeA: string, modeB: string) => {
      if (!track) return;
      const c = crew.current;
      const pts = [crewPoint(c.a, track), crewPoint(c.b, track)];
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
    [track],
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
      if (track && !c.boarding && !reduced) {
        const tA = isMoving ? climbTarget(c.up, track) : track.standA;
        const prevA = c.a;
        c.a = crewMove(c.a, tA, dt, track);
        if (isMoving && Math.abs(c.a - tA) < 0.01) c.up = !c.up;
        const tB = isMoving ? Math.max(0, c.a - gap) : track.standB;
        const prevB = c.b;
        c.b = crewMove(c.b, tB, dt, track);
        const { deck } = trackSpans(track);
        if (c.a !== prevA) c.facingA = c.a > deck ? c.facingA : c.a > prevA ? 1 : -1;
        if (c.b !== prevB) c.facingB = c.b > deck ? c.facingB : c.b > prevB ? 1 : -1;
        if (Math.abs(c.a - tA) < 0.01 && !isMoving) c.facingA = -1;
        if (Math.abs(c.b - tB) < 0.01 && !isMoving) c.facingB = 1;
        // a footstep per stride on the walkway, a rung per rung on the ladder (the pair: one sound)
        if (stepsCrossed(prevA, c.a, prevA > deck || c.a > deck ? CREW.rung : CREW.stride) > 0) playSfx(c.a > deck ? 'ladderStep' : 'metalStep');
        paintCrew(crewMode(c.a, tA, track), crewMode(c.b, tB, track));
        if (Math.abs(c.a - tA) > 0.01 || Math.abs(c.b - tB) > 0.01) active = true;
      }
      if (active) raf.current = requestAnimationFrame((t) => frameRef.current?.(t));
    },
    [paintDrum, paintCrew, settle, track, gap, reduced],
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

  // first paint, and again whenever the layout changes (resize, fonts)
  useLayoutEffect(() => {
    if (!L || !track) return;
    paintDrum();
    if (!moving.current) setLive(centreIndex(pos.current, n));
    crew.current.a = track.standA;
    crew.current.b = track.standB;
    paintCrew('stand', 'stand');
  }, [L, track, paintDrum, paintCrew, setLive, n, fits]);

  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
      pending.current.forEach((fn) => fn());
    },
    [],
  );

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
    const steps = rouletteSteps(n);
    const from = anim.current ? anim.current.to : Math.round(pos.current);
    if (reduced) {
      // no roulette: the drum fades, the new one is there, it fades back
      const layer = drumLayer.current;
      const target = from + (steps % n === 0 ? 1 : steps % n);
      const out = layer?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, fill: 'forwards' });
      const swap = () => {
        anim.current = null;
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
  };

  // ── the launch ───────────────────────────────────────────────────────────────────────────
  const launch = (index: number) => {
    const root = rootRef.current;
    const el = rockets.current[index];
    if (!root || !el || !L || !G || !track) return;
    busy.current = true;
    wake();
    callbacks.current.onLaunchStart?.();
    const text = suggestions[index];
    const later = (ms: number, fn: () => void) => {
      const t = setTimeout(fn, ms);
      pending.current.push(() => clearTimeout(t));
    };
    const finish = () => callbacks.current.onLaunch(text);

    if (reduced) {
      root.animate([{ opacity: 1 }, { opacity: 0 }], { duration: LAUNCH.reducedMs, fill: 'forwards' });
      later(LAUNCH.reducedMs, finish);
      return;
    }

    const c = crew.current;
    c.boarding = true;
    const plan = boardingPlan(c.a, c.b, track, LAUNCH.maxWalkMs);
    const tl = launchTimeline(plan.walkMs);
    const t0 = clockNow();
    const cues = [
      sfxCue(t0 + tl.dockAt + LAUNCH.dockMs * 0.8, () => playSfx('towerDock')),
      sfxCue(t0 + tl.igniteAt, () => playSfx('ignite')),
      sfxCue(t0 + tl.liftAt, () => playSfx('launch')),
    ];
    pending.current.push(() => cues.forEach((cue) => cue?.cancel()));

    // 1. the crew walks to the hatch (down the ladder first, if that is where they are)…
    const { deck } = trackSpans(track);
    const hatchTop = crewPoint(0, track);
    const walkTo = (s: number) => {
      const from = crewPoint(s, track);
      const frames: Keyframe[] = [{ transform: `translate3d(${from.x}px, ${from.y}px, 0)` }];
      if (s > deck) frames.push({ transform: `translate3d(${track.ladderX}px, ${track.deckY}px, 0)`, offset: (s - deck) / s });
      frames.push({ transform: `translate3d(${hatchTop.x}px, ${hatchTop.y}px, 0)` });
      return frames;
    };
    const hop: Keyframe[] = [
      { transform: `translate3d(${hatchTop.x}px, ${hatchTop.y}px, 0) scale(1)`, opacity: 1 },
      { transform: `translate3d(${hatchTop.x}px, ${hatchTop.y - G.T * 0.22}px, 0) scale(0.95)`, opacity: 1, offset: 0.35 },
      { transform: `translate3d(${hatchTop.x}px, ${L.centreY + (G.hatch?.h ?? 20) * 0.3}px, 0) scale(0.7)`, opacity: 0 },
    ];
    [c.b, c.a].forEach((s, i) => {
      const node = astros.current[i === 0 ? 1 : 0];
      const fig = node?.firstElementChild as HTMLElement | null;
      if (!node) return;
      if (plan.walkMs > 0 && s > 0.5) {
        if (fig) {
          fig.dataset.mode = 'walk';
          fig.style.transform = 'scaleX(-1)';
        }
        node.animate(walkTo(s), { duration: plan.walkMs, fill: 'forwards' });
      }
      later(plan.walkMs, () => {
        if (fig) fig.dataset.mode = 'stand';
      });
      // 2. …the door opens, they step in one after the other, it closes
      later(tl.hopAt[i], () => {
        playSfx('metalStep');
        node.animate(hop, { duration: LAUNCH.hopMs, easing: 'ease-in', fill: 'forwards' });
      });
    });
    later(tl.doorOpenAt, () => el.setAttribute('data-hatch-open', ''));
    later(tl.doorCloseAt, () => el.removeAttribute('data-hatch-open'));

    // 3. the other rockets and the drum's fittings go
    later(tl.fadeAt, () => {
      const fade = { duration: LAUNCH.fadeMs, fill: 'forwards' as const };
      root.querySelectorAll<HTMLElement | SVGElement>('[data-fitting]').forEach((node) => node.animate([{ opacity: 1 }, { opacity: 0 }], fade));
      rockets.current.forEach((r, i) => {
        if (r && i !== index) r.animate([{ opacity: r.style.opacity || '1' }, { opacity: 0 }], fade);
      });
    });

    // 4. the rocket stands up over the pad
    const k = Math.min(1, (L.padY - 10) / L.rocket.length);
    const standY = L.padY - (L.rocket.length * k) / 2 - L.centreY;
    const upright = `translate3d(0, ${standY}px, 0) rotate(-90deg) scale(${k})`;
    later(tl.turnAt, () => {
      el.removeAttribute('data-live');
      el.animate([{ transform: el.style.transform || 'none' }, { transform: upright }], { duration: LAUNCH.turnMs, easing: 'cubic-bezier(0.45, 0, 0.25, 1)', fill: 'forwards' });
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

    // 7. ignition: flame, a harder tremble, smoke at the pad
    later(tl.igniteAt, () => {
      el.setAttribute('data-ignite', '');
      root.setAttribute('data-ignite', '');
    });

    // 8. lift-off: the arms let go and it climbs out of the top of the screen
    later(tl.liftAt, () => {
      root.querySelectorAll<SVGGElement>('[data-gantry-arm]').forEach((arm) =>
        arm.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0.12)' }], { duration: 140, fill: 'forwards' }),
      );
      const top = root.getBoundingClientRect().top;
      const out = standY - (top + L.centreY + standY + (L.rocket.length * k) / 2 + 2 * G.T + 40);
      el.animate([{ transform: upright }, { transform: `translate3d(0, ${out}px, 0) rotate(-90deg) scale(${k})` }], {
        duration: LAUNCH.liftMs,
        easing: 'cubic-bezier(0.55, 0, 0.85, 0.35)',
        fill: 'forwards',
      });
    });
    later(tl.endAt, finish);
  };

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
      className="relative z-20 h-[clamp(236px,40dvh,380px)] w-full touch-none select-none rounded-t-[24px] border-t-2 border-ink bg-[#f4f3f0] text-ink"
    >
      <div data-safe-probe="" aria-hidden="true" className="pointer-events-none invisible absolute h-0 w-0 pb-[env(safe-area-inset-bottom)]" />
      {L && G && track && (
        <>
          <Backdrop L={L} G={G} track={track} />
          <div ref={drumLayer} className="absolute inset-0 z-10">
            <ul role="list" aria-label="Rutinas sugeridas" aria-describedby={`${uid}-hint`} className="contents">
              {suggestions.map((s, i) => (
                <li key={s} className="contents">
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
                    className="pad-drum-rocket absolute cursor-pointer rounded-full outline-none [transform-origin:50%_50%] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
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
          <Foreground L={L} G={G} track={track} uid={uid} chains={chains} gears={gears} />
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
          <Gantry L={L} G={G} />
          <p id={`${uid}-hint`} className="sr-only">
            Desliza arriba o abajo, o usa las flechas, para girar el tambor. Toca el cohete del centro para despegar.
          </p>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The pieces of the base (static SVG; only the chain, the gears and the clamps move)

type Geo = ReturnType<typeof padRocketGeometry>;

/** Behind the rockets: the drum's well and rims, the shadow under the centred one, the crew walkway. */
function Backdrop({ L, G, track }: { L: BaseLayout; G: Geo; track: CrewTrack }) {
  const { width: W, height: H } = L;
  const wellX = L.tower.leftX + L.tower.w + 3;
  const wellW = L.tower.rightX - 3 - wellX;
  const rimTop = Math.max(10, L.centreY - L.radius * 0.95);
  const rimBottom = Math.min(H - 10, L.centreY + L.radius * 0.95);
  const walkX0 = L.rocket.left + G.body.x1;
  const walkX1 = L.tower.rightX;
  const railY = track.deckY - G.T * 0.55;
  return (
    <svg aria-hidden="true" data-fitting="" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0">
      <rect x={wellX} y={6} width={wellW} height={H - 12} rx={20} fill="#e7e5e0" />
      <path
        d={`M${wellX + 6} ${rimTop + 18}Q${W / 2} ${rimTop - 14} ${wellX + wellW - 6} ${rimTop + 18}M${wellX + 6} ${rimBottom - 18}Q${W / 2} ${rimBottom + 14} ${wellX + wellW - 6} ${rimBottom - 18}`}
        stroke="#b4b2a9"
        strokeWidth={1.2}
        strokeDasharray="3 5"
        fill="none"
      />
      <ellipse cx={L.rocket.cx} cy={L.centreY + G.H / 2 - 2} rx={L.rocket.length * 0.36} ry={4} fill="#d3d1c7" />
      {/* the crew walkway, from the right tower to the hatch's side of the nose */}
      <g stroke={C.ink} strokeWidth={1.2} fill={C.hull}>
        <rect x={walkX0} y={track.deckY} width={walkX1 - walkX0} height={3} />
        <path d={`M${walkX0 + 4} ${railY}H${walkX1}M${walkX0 + 4} ${railY}V${track.deckY}M${(walkX0 + walkX1) / 2} ${railY}V${track.deckY}`} fill="none" />
      </g>
    </svg>
  );
}

/** A lattice tower: frame, X bracing, struts, a platform with a red light on top, its footing. */
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

function Foreground({
  L,
  G,
  track,
  uid,
  chains,
  gears,
}: {
  L: BaseLayout;
  G: Geo;
  track: CrewTrack;
  uid: string;
  chains: React.RefObject<(SVGGElement | null)[]>;
  gears: React.RefObject<(SVGGElement | null)[]>;
}) {
  const { width: W, height: H, tower: t } = L;
  const top = t.top + 6;
  const bottom = H - 6;
  // the chains run down the towers' inner faces, between two sprockets
  const chainX = [t.leftX + t.w + 1, t.rightX - 6];
  const chainTop = top + 10;
  const chainBottom = bottom - 10;
  const links: number[] = [];
  for (let y = chainTop - 18; y < chainBottom + 18; y += 9) links.push(y);
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
  const sprockets = [
    [chainX[0] + 2.5, chainTop],
    [chainX[0] + 2.5, chainBottom],
    [chainX[1] + 2.5, chainTop],
    [chainX[1] + 2.5, chainBottom],
  ];
  return (
    <svg aria-hidden="true" data-fitting="" width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-0 z-20">
      <defs>
        {chainX.map((x, i) => (
          <clipPath key={x} id={`${uid}-chain-${i}`}>
            <rect x={x - 1} y={chainTop} width={7} height={chainBottom - chainTop} />
          </clipPath>
        ))}
      </defs>
      {/* towers */}
      <g stroke={C.ink} strokeWidth={1.2} fill="none" strokeLinejoin="round">
        {[t.leftX, t.rightX].map((x) => (
          <g key={x}>
            <rect x={x} y={top} width={t.w} height={bottom - top} fill={C.hull} />
            <path d={towerPath(x, t.w, top, bottom)} />
            <rect x={x - 3} y={top - 6} width={t.w + 6} height={6} rx={1} fill={C.hull} />
            <path d={`M${x - 3} ${top - 6}V${top - 11}H${x + t.w + 3}V${top - 6}M${x + t.w / 2} ${top - 11}V${top - 6}`} />
            <rect x={x - 4} y={bottom - 3} width={t.w + 8} height={6} rx={1} fill={C.shade} />
          </g>
        ))}
        {/* the hose from the left tower down into the base */}
        <path d={`M${t.leftX + t.w / 2} ${bottom - 3}Q${t.leftX + t.w + 8} ${bottom + 4} ${L.rocket.left + 22} ${bottom - 2}`} />
      </g>
      <circle cx={t.leftX + t.w / 2} cy={top - 14} r={2.6} fill={C.red} />
      <circle cx={t.rightX + t.w / 2} cy={top - 14} r={2.6} fill={C.red} />
      {/* chains and sprockets */}
      {chainX.map((x, i) => (
        <g key={x} clipPath={`url(#${uid}-chain-${i})`}>
          <g
            ref={(node) => {
              chains.current[i] = node;
            }}
            fill={C.ink}
          >
            {links.map((y) => (
              <g key={y}>
                <rect x={x} y={y} width={5} height={6.4} rx={1.6} />
                <rect x={x + 1.7} y={y + 6.2} width={1.6} height={3} fill={C.rib} />
              </g>
            ))}
          </g>
        </g>
      ))}
      {sprockets.map(([x, y], i) => (
        <g
          key={i}
          data-cx={x}
          data-cy={y}
          ref={(node) => {
            gears.current[i] = node;
          }}
        >
          <circle cx={x} cy={y} r={5.4} fill="none" stroke={C.ink} strokeWidth={2.6} strokeDasharray="2 1.8" />
          <circle cx={x} cy={y} r={3.6} fill={C.hull} stroke={C.ink} strokeWidth={1} />
          <circle cx={x} cy={y} r={1} fill={C.ink} />
        </g>
      ))}
      {/* the ladder on the right tower */}
      <g stroke={C.ink} strokeWidth={1.1} fill="none">
        <path d={`M${ladderX - 4} ${top + 2}V${bottom - 2}M${ladderX + 4} ${top + 2}V${bottom - 2}`} strokeWidth={1.4} />
        <path d={rungs.map((y) => `M${ladderX - 4} ${y}H${ladderX + 4}`).join('')} />
      </g>
      {/* the clamps */}
      <g stroke={C.ink} strokeWidth={1.2} fill={C.hull} strokeLinejoin="round">
        <g className="pad-hook-top">
          <path d={`M${leftEdge} ${hullTop - 9}H${ringX + 3}V${hullTop + 1}H${ringX - 3}V${hullTop - 4}H${leftEdge}Z`} />
          <circle cx={leftEdge + 4} cy={hullTop - 6.5} r={1.1} fill={C.ink} stroke="none" />
        </g>
        <g className="pad-hook-bottom">
          <path d={`M${leftEdge} ${hullBottom + 9}H${ringX + 3}V${hullBottom - 1}H${ringX - 3}V${hullBottom + 4}H${leftEdge}Z`} />
          <circle cx={leftEdge + 4} cy={hullBottom + 6.5} r={1.1} fill={C.ink} stroke="none" />
        </g>
        <g className="pad-cradle">
          <path d={`M${t.rightX} ${cy - 3}H${noseEnd + 4}V${cy - 7}H${noseEnd - 2}V${cy - 5}M${t.rightX} ${cy + 3}H${noseEnd + 4}V${cy + 7}H${noseEnd - 2}V${cy + 5}`} />
          <rect x={noseEnd + 2} y={cy - 3} width={t.rightX - noseEnd - 2} height={6} />
        </g>
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

/** The red emergency button: a dome in a striped ring on a bolted plate, the word under it. */
function RandomButton({ L, onClick }: { L: BaseLayout; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void }) {
  const { x, y, w, h } = L.random;
  return (
    <button
      type="button"
      data-no-drag=""
      data-fitting=""
      onClick={onClick}
      aria-label="Random: girar la ruleta"
      className="pad-random absolute z-[35] cursor-pointer rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      style={{ left: x, top: y, width: w, height: h }}
    >
      <svg width={w} height={h} viewBox="0 0 64 72" aria-hidden="true" className="absolute inset-0">
        <rect x={2} y={2} width={60} height={68} rx={8} fill={C.hull} stroke={C.ink} strokeWidth={1.6} />
        <rect x={5} y={5} width={54} height={62} rx={6} fill="none" stroke={C.shade} strokeWidth={1} />
        {[
          [8.5, 8.5],
          [55.5, 8.5],
          [8.5, 63.5],
          [55.5, 63.5],
        ].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r={2} fill={C.shade} stroke={C.ink} strokeWidth={0.8} />
            <path d={`M${cx - 1.1} ${cy}H${cx + 1.1}`} stroke={C.ink} strokeWidth={0.7} />
          </g>
        ))}
        <circle cx={32} cy={29} r={21.5} fill={C.ink} />
        <circle cx={32} cy={29} r={19} fill="none" stroke="#ffd60a" strokeWidth={4} strokeDasharray="5 5" />
        <circle cx={32} cy={29} r={15.5} fill={C.ink} />
        <circle cx={32} cy={31} r={13.5} fill="#a8241c" />
        <g className="pad-dome">
          <circle cx={32} cy={27} r={13.5} fill={C.red} stroke={C.ink} strokeWidth={1.4} />
          <ellipse cx={27} cy={22} rx={5} ry={2.6} fill={C.flameMid} transform="rotate(-28 27 22)" />
        </g>
        <text x={32} y={62} textAnchor="middle" fill={C.ink} style={{ fontSize: 11.5, fontWeight: 700, fontFamily: 'var(--font-display), system-ui, sans-serif' }}>
          Random
        </text>
      </svg>
    </button>
  );
}

/** The launch tower and its pad: off to the left until the launch, when it slides in and docks. */
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
      <g stroke={C.ink} strokeWidth={1.3} fill={C.hull} strokeLinejoin="round">
        {/* the pad: a deck either side of the flame's opening, on legs */}
        <rect x={tx - 12} y={padY} width={cx - gapHalf - (tx - 12)} height={9} rx={1.5} />
        <rect x={cx + gapHalf} y={padY} width={cx - gapHalf - (tx - 12) - 10} height={9} rx={1.5} />
        <path d={`M${tx - 4} ${padY + 9}V${padY + 15}M${cx - gapHalf - 6} ${padY + 9}V${padY + 15}M${cx + gapHalf + 6} ${padY + 9}V${padY + 15}`} fill="none" />
        {/* the tower */}
        <rect x={tx} y={ttop} width={tw} height={padY - ttop} />
        <path d={towerPath(tx, tw, ttop, padY)} fill="none" />
        <rect x={tx - 4} y={ttop - 6} width={tw + 30} height={6} rx={1} />
        <path d={`M${tx + tw / 2} ${ttop - 6}V${ttop - 18}`} fill="none" />
        {/* the swing arms, folded until they dock */}
        {arms.map((y) => (
          <g key={y} data-gantry-arm="" style={{ transformOrigin: `${tx + tw}px ${y}px`, transform: 'scaleX(0.12)' }}>
            <rect x={tx + tw} y={y - 3} width={cx - hull / 2 - (tx + tw) + 1} height={6} />
            <path d={`M${tx + tw + 4} ${y - 3}L${tx + tw + 10} ${y + 3}M${tx + tw + 10} ${y - 3}L${tx + tw + 16} ${y + 3}`} fill="none" strokeWidth={1} />
            <rect x={cx - hull / 2 - 3} y={y - 6} width={5} height={12} rx={1.5} fill={C.ink} stroke="none" />
          </g>
        ))}
      </g>
      <circle cx={tx + tw / 2} cy={ttop - 20} r={2.8} fill={C.red} />
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

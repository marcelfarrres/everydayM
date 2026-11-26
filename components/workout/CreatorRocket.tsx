'use client';

import { useLayoutEffect, useMemo, useRef, type CSSProperties, type MouseEvent, type ReactNode, type Ref } from 'react';
import { FlameDrawing, RocketFigure, RocketShip, flameBox, piecesOf, scaledBox } from '@/components/workout/RocketShip';
import { HOP, LAUNCH_OFFSCREEN_AT, POD, launchKeyframes, podPopKeyframes, podRetractKeyframes, riseKeyframes } from '@/components/workout/rocketFlight';
import { BANNER, SHIP_ENDS, shipGeometry, widgetLayout } from '@/components/workout/rocketShape';
import type { StepState } from '@/components/workout/player/model';
import { useRocketWidth } from '@/components/workout/player/hooks';
import { playSfx } from '@/lib/audio/sfx';
import { sfxCue } from '@/lib/audio/sfxCue';

/*
 * The rocket of the routine creator (phone only): the same drawing as the player's (RocketShip),
 * there from the sentence to the warm-up. The bar where the sentence is written is its body; at
 * each question, and at "Empezar", it waits at the bottom, half tilted, its engine just lit; each
 * tap launches it out of the top of the screen and it comes back up for the next step.
 *
 * A launch flies a copy of the rocket (a clone of its DOM, outside React) so that the tap acts at
 * once: the step changes under it, and the copy removes itself when it is out of sight. With
 * reduced motion nothing flies: the next rocket fades in. On a computer none of this runs.
 */

/** Its size here: a little bigger than the player's, so a finger and 16 px text fit in the body. */
export const CREATOR = {
  /** the bar of the sentence */
  barScale: 1.15,
  /** the rocket that waits for a tap */
  waitScale: 1.25,
  waitMaxPx: 330,
  /** degrees, nose up */
  tilt: -12,
} as const;

const DESKTOP = '(min-width: 64rem)';
const REDUCED = '(prefers-reduced-motion: reduce)';

/**
 * Launches a copy of the rocket `el` out of the top of the screen (tilted `tilt` degrees as it
 * stands), taking `ms`. A rocket with a banner (`data-pod`, "Empezar") folds it in first: no
 * rocket moves with its banner out. Returns how long until it is out of sight (0 when nothing
 * flies: on a computer, with reduced motion, or with no rocket).
 */
export function launchRocket(el: HTMLElement | null, { ms, tilt = 0, text }: { ms: number; tilt?: number; text?: string }): number {
  if (!el || typeof window === 'undefined') return 0;
  if (window.matchMedia(DESKTOP).matches || window.matchMedia(REDUCED).matches) return 0;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0) return 0;
  // (inside the tap: it may wake the sound up)
  playSfx('ignite', { gesture: true });
  const clone = flyingCopy(el, rect, text);
  document.body.appendChild(clone);
  const pod = clone.querySelector<HTMLElement>('[data-pod]');
  const fold = pod ? POD.outMs : 0;
  pod?.animate(podRetractKeyframes(), { duration: POD.outMs, fill: 'forwards' });
  const flight = clone.animate(launchKeyframes(tilt), { duration: ms, delay: fold, fill: 'forwards' });
  const done = () => clone.remove();
  flight.onfinish = done;
  flight.oncancel = done;
  return fold + ms * LAUNCH_OFFSCREEN_AT;
}

/** A copy of the rocket `el` (at `rect`) to fly over everything: no ids, inert, its engine at full. */
function flyingCopy(el: HTMLElement, rect: DOMRect, text?: string): HTMLElement {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const clone = el.cloneNode(true) as HTMLElement;
  // what was typed (a clone carries the field's first value, not the current one)
  const fields = clone.querySelectorAll('textarea');
  el.querySelectorAll('textarea').forEach((field, i) => {
    fields[i].value = text ?? field.value;
  });
  [clone, ...Array.from(clone.querySelectorAll('[id]'))].forEach((node) => node.removeAttribute('id'));
  clone.setAttribute('aria-hidden', 'true');
  clone.inert = true;
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${rect.left + rect.width / 2 - w / 2}px`,
    top: `${rect.top + rect.height / 2 - h / 2}px`,
    right: 'auto',
    bottom: 'auto',
    width: `${w}px`,
    height: `${h}px`,
    margin: '0',
    translate: 'none',
    zIndex: '70',
    pointerEvents: 'none',
    transformOrigin: '50% 50%',
  } satisfies Partial<CSSStyleDeclaration>);
  // the engine at full
  clone.querySelectorAll<HTMLElement>('[data-rocket-flame]').forEach((flame) => {
    flame.style.transform = 'scale(1, 1)';
  });
  return clone;
}

/** Plays the rocket's way (back) up into its place, `delay` ms from now (a fade with reduced motion). */
export function useRise(el: React.RefObject<HTMLElement | null>, tilt: number, delay: number | null) {
  const first = useRef(delay);
  useLayoutEffect(() => {
    const node = el.current;
    const wait = first.current;
    if (!node || wait === null || window.matchMedia(DESKTOP).matches) return;
    const animation = window.matchMedia(REDUCED).matches
      ? node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: wait, fill: 'backwards' })
      : node.animate(riseKeyframes(tilt), { duration: HOP.riseMs, delay: wait, fill: 'backwards' });
    return () => animation.cancel();
  }, [el, tilt]);
}

/** The geometry of a rocket `px` long at scale `k` (and, for the bar, a thicker body). */
export function useCreatorShip(px: number, k: number, thickness?: number) {
  return useMemo(() => shipGeometry(px / k, thickness), [px, k, thickness]);
}

/**
 * The rocket waiting for a tap, at the bottom of a step: half tilted, its engine just lit and
 * trembling a little. With `onClick` it is the step's button and `label` is written in its body;
 * without, it only waits (aria-hidden) and flies when the step moves on.
 */
export function WaitingRocket({
  ref,
  label,
  ariaLabel,
  onClick,
  riseDelay,
  flame = 0.3,
  shake = 0.5,
  pullUp = 0,
  room,
  className = '',
}: {
  ref?: Ref<HTMLElement | null>;
  label?: ReactNode;
  ariaLabel?: string;
  onClick?: () => void;
  /** how lit its engine is while it waits (0.3; on the minutes from almost nothing to a long flare) */
  flame?: number;
  /** how hard it trembles (0.5; on the minutes, harder the more minutes) */
  shake?: number;
  /** px it stands closer to what is above it (its tilt's margin is there anyway) */
  pullUp?: number;
  /** null: it is there already; a number: it comes up from below after that many ms */
  riseDelay: number | null;
  /** px it may take across (the screen less the margins, by default) */
  room?: number;
  className?: string;
}) {
  const width = useRocketWidth();
  const px = Math.min(CREATOR.waitMaxPx, room ?? width - 28);
  const k = CREATOR.waitScale;
  const g = useCreatorShip(px, k);
  const own = useRef<HTMLElement | null>(null);
  const setRef = (node: HTMLElement | null) => {
    own.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };
  useRise(own, CREATOR.tilt, riseDelay);

  // (tilted, it reaches above and below its box: the margin keeps it clear of what is around)
  const reach = Math.ceil((g.W * k * Math.sin((-CREATOR.tilt * Math.PI) / 180)) / 2);
  const box: CSSProperties = { width: g.W * k, height: g.H * k, marginBlock: reach, marginTop: reach - pullUp, transform: `rotate(${CREATOR.tilt}deg)` };
  // (harder is also quicker)
  const period = Math.max(0.07, 0.14 - Math.max(0, shake - 0.5) * 0.025);
  const drawing = (
    <span aria-hidden="true" className="rw-shake pointer-events-none absolute inset-0" style={{ '--rw-amp': shake, '--rw-shake-s': `${period.toFixed(3)}s` } as CSSProperties}>
      <RocketFigure g={g} scale={k} flame={flame} className="absolute left-0 top-0" />
      {label && (
        <span className="absolute flex items-center justify-center gap-2 text-[20px] font-semibold leading-none text-ink" style={scaledBox(g.content, k)}>
          {label}
        </span>
      )}
    </span>
  );
  return onClick ? (
    <button
      ref={setRef}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`rw-lift relative shrink-0 cursor-pointer self-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink lg:hidden ${className}`}
      style={box}
    >
      {drawing}
    </button>
  ) : (
    <div ref={setRef} aria-hidden="true" className={`relative shrink-0 self-center lg:hidden ${className}`} style={box}>
      {drawing}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Small rockets to pick from: the suggestions under the bar, and the options of a question. Each is
// a real button with its words in the body; the one tapped takes off (launchRocket).

// px per character of the label (15 px semibold), and the rocket around it (rocket units at scale 1)
const CHAR_PX = 8.2;
// (the tail: flame room, nozzle and its livery; the nose with its antenna: rocketShape's SHIP_ENDS)
// (and a little air between the checker strip and the words)
const LABEL_AIR = 5;
const AROUND = { tail: Math.ceil(SHIP_ENDS.tail) + LABEL_AIR, nose: Math.ceil(SHIP_ENDS.nose), flameRoom: 14 } as const;

/** How long a choice rocket is for a label of `chars` characters (px, at most the room there is). */
const choicePx = (chars: number, room: number) => Math.min(room + AROUND.flameRoom, Math.round(chars * CHAR_PX + 12 + AROUND.tail + AROUND.nose));

/** A choice as a small rocket, lying (nose right): 56 px tall, as long as its words (or `minChars`). */
export function ChoiceRocket({
  ref,
  text,
  minChars = 0,
  room,
  onClick,
  className = '',
}: {
  ref?: Ref<HTMLButtonElement | null>;
  text: string;
  /** the same length for a set of them (the options of a question) */
  minChars?: number;
  /** px it may take across (the screen less the margins, by default) */
  room?: number;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}) {
  const width = useRocketWidth();
  const g = useCreatorShip(choicePx(Math.max(minChars, text.length), room ?? width - 28), 1);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      data-choice=""
      className={`rw-lift relative shrink-0 cursor-pointer rounded-full active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:hidden ${className}`}
      style={{ width: g.W - AROUND.flameRoom, height: g.H }}
    >
      <RocketFigure g={g} hoverFlame className="pointer-events-none absolute top-0" style={{ left: -AROUND.flameRoom }} />
      <span
        className="pointer-events-none absolute flex items-center text-[15px] font-semibold leading-none text-ink"
        style={{ ...scaledBox(g.content, 1), left: g.content.left - AROUND.flameRoom + LABEL_AIR, width: g.content.right - g.content.left - LABEL_AIR }}
      >
        <span className="truncate">{text}</span>
      </span>
    </button>
  );
}

/**
 * "Random": a rocket standing on its tail (the same drawing, turned nose up) with its word along
 * the body. `px`: how tall it stands. The button inside is the turned rocket, so a launch takes it
 * off from where it stands.
 */
export function RandomRocket({ px, onClick }: { px: number; onClick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  const g = useCreatorShip(px + AROUND.flameRoom, 1);
  const long = g.W - AROUND.flameRoom;
  return (
    <div className="relative shrink-0 lg:hidden" style={{ width: g.H, height: long }}>
      <button
        type="button"
        onClick={onClick}
        aria-label="Random: una frase al azar"
        className="rw-lift absolute cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        style={{ width: long, height: g.H, left: (g.H - long) / 2, top: (long - g.H) / 2, transform: 'rotate(-90deg)' }}
      >
        <RocketFigure g={g} flame={0.25} className="pointer-events-none absolute top-0" style={{ left: -AROUND.flameRoom }} />
        <span
          className="pointer-events-none absolute flex items-center justify-center text-[15px] font-semibold uppercase leading-none tracking-[0.12em] text-ink"
          style={{ ...scaledBox(g.content, 1), left: g.content.left - AROUND.flameRoom }}
        >
          Random
        </span>
      </button>
    </div>
  );
}

/** A group of rockets (the options of a question) that comes up from below `delay` ms after it mounts. */
export function RiseIn({ delay, className = '', children }: { delay: number; className?: string; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  useRise(el, 0, delay);
  return (
    <div ref={el} className={className}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// "Empezar": the routine's own rocket, put together piece by piece.

/** The routine's rocket goes together a piece at a time: this long between one piece and the next. */
export const ASSEMBLY = { stepMs: 200, pieceMs: 300 } as const;

/**
 * The routine's rocket (phone): a segment per block with the lines of its series, the nose, and
 * the boosters if it has a warm-up, the same size and drawing as the player's. Once the routine is
 * ready it goes together piece by piece (tail first, then the nose, then the boosters), each with
 * a bump, and then "Empezar" springs out of it on a banner, as the player's does. The whole of it
 * is the button: a tap launches it (and the player's rocket is this same one landing).
 */
export function LaunchRocket({
  ref,
  blocks,
  boosters,
  onClick,
}: {
  ref?: Ref<HTMLElement | null>;
  /** each block's series (all to do) */
  blocks: StepState[][];
  boosters: boolean;
  onClick: () => void;
}) {
  const width = useRocketWidth();
  const L = useMemo(() => widgetLayout(width, { blocks: blocks.length, first: 1, boosters }), [width, blocks.length, boosters]);
  const { g } = L;
  const own = useRef<HTMLElement | null>(null);
  const banner = useRef<HTMLDivElement>(null);
  const ship = useRef<HTMLDivElement>(null);
  const setRef = (node: HTMLButtonElement | null) => {
    own.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  };

  useLayoutEffect(() => {
    const root = own.current;
    if (!root || !banner.current || !ship.current || window.matchMedia('(min-width: 64rem)').matches) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pieces = piecesOf(g);
    const done = pieces.length * ASSEMBLY.stepMs + ASSEMBLY.pieceMs;
    if (reduced) {
      root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250 });
      return;
    }
    pieces.forEach((piece, i) => {
      // each piece comes in from where it belongs (the tail's from behind, the nose from ahead, the
      // boosters from above and below) and lands with a bump
      const from = piece === 'nose' ? 'translate(34px, 0px)' : piece === 'boosters' ? 'scale(1, 1.6)' : 'translate(-34px, -6px)';
      root.querySelectorAll<HTMLElement | SVGElement>(`[data-piece="${piece}"]`).forEach((node) => {
        node.style.transformOrigin = `${g.x0}px ${g.cy}px`;
        node.animate(
          [
            { transform: from, opacity: 0, easing: 'cubic-bezier(0.3, 0, 0.6, 1)' },
            { transform: 'translate(1px, 1px) scale(1.02, 0.92)', opacity: 1, offset: 0.62, easing: 'cubic-bezier(0.3, 0, 0.4, 1)' },
            { transform: 'translate(-1px, 0px) scale(1, 1.02)', opacity: 1, offset: 0.82 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: ASSEMBLY.pieceMs, delay: i * ASSEMBLY.stepMs, fill: 'backwards' },
        );
      });
      // ...and the whole rocket takes the knock
      ship.current?.animate(
        [{ transform: 'none' }, { transform: 'translate(1.5px, 1px) scale(1.01, 0.96)', offset: 0.35 }, { transform: 'translate(-1px, 0px)', offset: 0.65 }, { transform: 'none' }],
        { duration: 220, delay: i * ASSEMBLY.stepMs + ASSEMBLY.pieceMs * 0.6 },
      );
    });
    banner.current.animate(podPopKeyframes(), { duration: POD.inMs, delay: done, fill: 'backwards' });
    // each piece clacks into place as the whole rocket takes its knock
    const now = performance.now();
    const clacks = pieces.map((_, i) => sfxCue(now + i * ASSEMBLY.stepMs + ASSEMBLY.pieceMs * 0.6, () => playSfx('clack')));
    // (the animations play once, when it appears; not cancelled, so React's dev double mount doesn't
    // lose them; the sounds go if it does, and come again with the second mount)
    return () => clacks.forEach((cue) => cue?.cancel());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const bw = 176;
  return (
    <button
      ref={setRef}
      type="button"
      onClick={onClick}
      aria-label="Empezar"
      className="rw-lift relative shrink-0 cursor-pointer rounded-[20px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:hidden"
      style={{ width: L.B, height: L.box }}
    >
      {/* "Empezar" on its banner, on a mast from the rocket (as the player's banner) */}
      <div ref={banner} data-pod="" aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ transformOrigin: `${L.fold.x}px ${L.fold.y}px` }}>
        <div
          className="absolute border-x-2 border-ink bg-white"
          style={{ left: L.mast.x - BANNER.MAST_W / 2, top: L.mast.top, width: BANNER.MAST_W, height: L.mast.bottom - L.mast.top }}
        />
        <div
          className="absolute flex items-center justify-center gap-2 rounded-[18px] border-2 border-ink bg-white text-[18px] font-semibold text-ink"
          style={{ left: (L.B - bw) / 2, top: 0, width: bw, height: BANNER.H }}
        >
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current" aria-hidden="true">
            <path d="M7 4.5v15l12-7.5z" />
          </svg>
          Empezar
        </div>
      </div>
      <div ref={ship} className="pointer-events-none absolute" style={{ left: L.ship.left, top: L.ship.top, width: g.W, height: g.H }}>
        <RocketShip
          g={g}
          hilo={blocks}
          className="absolute left-0 top-0"
          behind={
            <div data-rocket-flame="" data-unlit="" className="absolute" style={{ ...flameBox(g), transform: 'scale(0.3, 0.65)' }}>
              <FlameDrawing />
            </div>
          }
        />
      </div>
    </button>
  );
}

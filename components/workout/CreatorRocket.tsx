'use client';

import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode, type Ref } from 'react';
import { RocketFigure, scaledBox } from '@/components/workout/RocketShip';
import { HOP, LAUNCH_OFFSCREEN_AT, launchKeyframes, riseKeyframes } from '@/components/workout/rocketFlight';
import { shipGeometry } from '@/components/workout/rocketShape';
import { useRocketWidth } from '@/components/workout/player/hooks';

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
 * stands), taking `ms`. Returns how long until it is out of sight (0 when nothing flies: on a
 * computer, with reduced motion, or with no rocket).
 */
export function launchRocket(el: HTMLElement | null, { ms, tilt = 0, text }: { ms: number; tilt?: number; text?: string }): number {
  if (!el || typeof window === 'undefined') return 0;
  if (window.matchMedia(DESKTOP).matches || window.matchMedia(REDUCED).matches) return 0;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0) return 0;
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
  document.body.appendChild(clone);
  const flight = clone.animate(launchKeyframes(tilt), { duration: ms, fill: 'forwards' });
  const done = () => clone.remove();
  flight.onfinish = done;
  flight.oncancel = done;
  return ms * LAUNCH_OFFSCREEN_AT;
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

/** The geometry of a rocket `px` long at scale `k`. */
export function useCreatorShip(px: number, k: number) {
  return useMemo(() => shipGeometry(px / k), [px, k]);
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
  className = '',
}: {
  ref?: Ref<HTMLElement | null>;
  label?: ReactNode;
  ariaLabel?: string;
  onClick?: () => void;
  /** null: it is there already; a number: it comes up from below after that many ms */
  riseDelay: number | null;
  className?: string;
}) {
  const width = useRocketWidth();
  const px = Math.min(CREATOR.waitMaxPx, width - 28);
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
  const box: CSSProperties = { width: g.W * k, height: g.H * k, marginBlock: reach, transform: `rotate(${CREATOR.tilt}deg)` };
  const drawing = (
    <span aria-hidden="true" className="rw-shake pointer-events-none absolute inset-0" style={{ '--rw-amp': 0.5, '--rw-shake-s': '0.14s' } as CSSProperties}>
      <RocketFigure g={g} scale={k} flame={0.3} className="absolute left-0 top-0" />
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
      className={`relative shrink-0 cursor-pointer self-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink lg:hidden ${className}`}
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

'use client';

import { useLayoutEffect, useMemo, useRef, type CSSProperties, type MouseEvent, type ReactNode, type Ref } from 'react';
import { RocketFigure, scaledBox } from '@/components/workout/RocketShip';
import { HOP, LAUNCH_OFFSCREEN_AT, launchKeyframes, riseKeyframes } from '@/components/workout/rocketFlight';
import { SHIP, shipGeometry } from '@/components/workout/rocketShape';
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
  const clone = flyingCopy(el, rect, text);
  document.body.appendChild(clone);
  const flight = clone.animate(launchKeyframes(tilt), { duration: ms, fill: 'forwards' });
  const done = () => clone.remove();
  flight.onfinish = done;
  flight.oncancel = done;
  return ms * LAUNCH_OFFSCREEN_AT;
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
  className = '',
}: {
  ref?: Ref<HTMLElement | null>;
  label?: ReactNode;
  ariaLabel?: string;
  onClick?: () => void;
  /** how lit its engine is while it waits (0.3; more on the minutes, the more minutes) */
  flame?: number;
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

// ---------------------------------------------------------------------------------------------
// The suggestions under the bar: small rockets, the sentence in the body.

// px per character of the label (15 px semibold), and the rocket around it (rocket units at scale 1)
const CHAR_PX = 7.6;
const AROUND = { tail: 46, nose: SHIP.NOSE + 8, flameRoom: 14 } as const;

/** A suggestion as a small rocket (the same drawing, at its own size): a real button, 56 px tall. */
export function SuggestionRocket({ ref, text, onClick }: { ref?: Ref<HTMLButtonElement | null>; text: string; onClick: (e: MouseEvent<HTMLButtonElement>) => void }) {
  const width = useRocketWidth();
  const px = Math.min(width - 28 + AROUND.flameRoom, Math.round(text.length * CHAR_PX + 12 + AROUND.tail + AROUND.nose));
  const g = useCreatorShip(px, 1);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      data-suggestion=""
      className="relative shrink-0 cursor-pointer rounded-full transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink lg:hidden"
      style={{ width: g.W - AROUND.flameRoom, height: g.H }}
    >
      <RocketFigure g={g} className="pointer-events-none absolute top-0" style={{ left: -AROUND.flameRoom }} />
      <span
        className="pointer-events-none absolute flex items-center text-[15px] font-semibold leading-none text-ink"
        style={{ ...scaledBox(g.content, 1), left: g.content.left - AROUND.flameRoom }}
      >
        <span className="truncate">{text}</span>
      </span>
    </button>
  );
}

/**
 * The bar picks a suggestion up: it shoots a cable from its tail to the small rocket's nose, hooks
 * it and pulls it in behind its tail, and takes off with it hanging below. Copies of both fly (the
 * step has already changed under them). `hookX`: the bar's nozzle, px from its left edge. Returns
 * how long until they are out of sight (0 when nothing flies).
 */
export function towRocket(bar: HTMLElement | null, towed: HTMLElement | null, { hookX, text }: { hookX: number; text: string }): number {
  if (!bar || !towed || typeof window === 'undefined') return 0;
  if (window.matchMedia(DESKTOP).matches || window.matchMedia(REDUCED).matches) return 0;
  const b = bar.getBoundingClientRect();
  const t = towed.getBoundingClientRect();
  if (b.width === 0 || t.width === 0) return 0;
  const { shootMs, pullMs } = TOW;
  const total = shootMs + pullMs + HOP.launchMs;
  const at = (ms: number) => Math.round((ms / total) * 1000) / 1000;

  // the bar's copy flies as a plain launch, after the cable and the pull
  const ship = flyingCopy(bar, b, text);
  const hook = { x: hookX, y: b.height / 2 };
  // The small rocket's copy goes inside the bar's (so it goes wherever the bar goes), hanging from
  // an arm that turns about the hook: the cable runs along the arm and the copy's nose is always
  // at its end (the copy turns back by as much, so it stays level). One move for all three.
  const nose0 = { x: t.left - b.left + t.width - 2, y: t.top - b.top + t.height / 2 };
  const d0 = Math.max(1, Math.hypot(nose0.x - hook.x, nose0.y - hook.y));
  const a0 = (Math.atan2(nose0.y - hook.y, nose0.x - hook.x) * 180) / Math.PI;
  // pulled in behind the tail: its nose a short cable away, level with the tail
  const d1 = TOW.cablePx;
  const a1 = a0 > 0 ? 180 : -180;
  const place = (node: HTMLElement, style: Partial<CSSStyleDeclaration>) => Object.assign(node.style, { position: 'absolute', margin: '0', ...style });
  const arm = document.createElement('div');
  place(arm, { left: `${hook.x}px`, top: `${hook.y}px`, width: '0px', height: '0px', transformOrigin: '0 0' });
  const cable = document.createElement('div');
  place(cable, { left: '0px', top: '-1px', width: `${d0}px`, height: '2px', background: '#131313', borderRadius: '1px', transformOrigin: '0 50%' });
  const holder = document.createElement('div');
  place(holder, { left: '0px', top: '0px', width: '0px', height: '0px' });
  const copy = towed.cloneNode(true) as HTMLElement;
  copy.removeAttribute('data-suggestion');
  place(copy, {
    left: `${-(t.width - 2)}px`,
    top: `${-t.height / 2}px`,
    width: `${t.width}px`,
    height: `${t.height}px`,
    transformOrigin: `${t.width - 2}px ${t.height / 2}px`,
  });
  holder.append(copy);
  arm.append(holder, cable);
  ship.prepend(arm);
  document.body.appendChild(ship);

  const hold = at(shootMs + 60);
  const pulled = at(shootMs + pullMs);
  const deg = (n: number) => `${n.toFixed(2)}deg`;
  const options = { duration: total, fill: 'forwards' as const };
  arm.animate(
    [
      { offset: 0, transform: `rotate(${deg(a0)})` },
      { offset: hold, transform: `rotate(${deg(a0)})`, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
      { offset: pulled, transform: `rotate(${deg(a1)})` },
      { offset: 1, transform: `rotate(${deg(a1)})` },
    ],
    options,
  );
  cable.animate(
    [
      { offset: 0, transform: 'scaleX(0)', easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
      { offset: at(shootMs), transform: 'scaleX(1)' },
      { offset: hold, transform: 'scaleX(1)', easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
      { offset: pulled, transform: `scaleX(${(d1 / d0).toFixed(4)})` },
      { offset: 1, transform: `scaleX(${(d1 / d0).toFixed(4)})` },
    ],
    options,
  );
  holder.animate(
    [
      { offset: 0, transform: `translateX(${d0.toFixed(1)}px)` },
      { offset: hold, transform: `translateX(${d0.toFixed(1)}px)`, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
      { offset: pulled, transform: `translateX(${d1}px)` },
      { offset: 1, transform: `translateX(${d1}px)` },
    ],
    options,
  );
  copy.animate(
    [
      { offset: 0, transform: `rotate(${deg(-a0)})` },
      // hooked: a jolt, then pulled in
      { offset: at(shootMs), transform: `rotate(${deg(-a0)})`, easing: 'cubic-bezier(0.3, 0, 0.2, 1)' },
      { offset: hold, transform: `rotate(${deg(-a0 - 7)})`, easing: 'cubic-bezier(0.5, 0, 0.3, 1)' },
      { offset: pulled, transform: `rotate(${deg(-a1)})` },
      { offset: 1, transform: `rotate(${deg(-a1)})` },
    ],
    options,
  );
  const launch = launchKeyframes();
  const flight = ship.animate(
    [{ offset: 0, transform: launch[0].transform, opacity: 1 }, ...launch.map((k) => ({ ...k, offset: at(shootMs + pullMs + k.offset * HOP.launchMs) }))],
    { duration: total, fill: 'forwards' },
  );
  const done = () => ship.remove();
  flight.onfinish = done;
  flight.oncancel = done;
  return shootMs + pullMs + HOP.launchMs * LAUNCH_OFFSCREEN_AT;
}

/** The tow: the cable shoots out, then pulls the small rocket in behind the tail (ms, px). */
export const TOW = { shootMs: 240, pullMs: 220, cablePx: 26 } as const;

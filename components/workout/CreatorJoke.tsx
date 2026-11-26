'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'motion/react';
import type { CreatorJokeKind } from '@/lib/intent/creatorJoke';

/*
 * The routine creator's joke (phone only; the rule is lib/intent/creatorJoke.ts): a big message
 * stamped over the screen while everything is frozen for about two seconds, and then the user is
 * back where they were. The error sound is played by the caller, inside the tap.
 *
 * Robust first: the freeze is two plain timers (fade out, then unmount) that do not wait for any
 * animation, cleared on unmount; nothing here can keep the veil up. Transform and opacity only.
 */

/** Durations, ms. The whole freeze is `freezeMs`; the message fades out over its last `exitMs`. */
export const JOKE = {
  freezeMs: 2000,
  exitMs: 260,
  stampMs: 340,
  veilInMs: 120,
  flashMs: 240,
  shakeMs: 320,
  flameMs: 150,
} as const;

export const JOKE_LINES: Record<CreatorJokeKind, { title: string; sub?: string }> = {
  time: { title: '¿Tan poco tiempo tenemos?' },
  intensity: { title: '¿Tan poco hemos dormido hoy?', sub: 'Va, piénsatelo.' },
};

type Point = { x: number; y: number };

/** Where the tapped rocket coughs its smoke (its tail) and loses its nut (mid-body), on screen. */
export interface JokeOrigin {
  tail: Point;
  body: Point;
}

export interface ActiveJoke {
  id: number;
  kind: CreatorJokeKind;
  /** the rocket that was tapped (its flame goes out), if any */
  anchor: HTMLElement | null;
  /** null: the rocket is not on screen; the smoke and the nut come from the message instead */
  origin: JokeOrigin | null;
  /** the control the user was on, focused again when the joke ends */
  focus: HTMLElement | null;
}

/** The rocket's tail and body on screen (lying, nose right), or null when it is not visible. */
export function jokeOrigin(anchor: HTMLElement | null): JokeOrigin | null {
  if (!anchor) return null;
  const r = anchor.getBoundingClientRect();
  if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= window.innerHeight) return null;
  const y = r.top + r.height / 2;
  return { tail: { x: r.left + r.width * 0.08, y }, body: { x: r.left + r.width * 0.45, y } };
}

const inBrowser = typeof document !== 'undefined';

export function CreatorJoke({
  joke,
  shakeTarget,
  onDone,
}: {
  joke: ActiveJoke | null;
  /** what shakes for a moment (the creator's page) */
  shakeTarget: RefObject<HTMLElement | null>;
  onDone: () => void;
}) {
  if (!joke || !inBrowser) return null;
  return createPortal(<JokeOverlay key={joke.id} joke={joke} shakeTarget={shakeTarget} onDone={onDone} />, document.body);
}

function JokeOverlay({ joke, shakeTarget, onDone }: { joke: ActiveJoke; shakeTarget: RefObject<HTMLElement | null>; onDone: () => void }) {
  const reduced = useReducedMotion() ?? false;
  const [leaving, setLeaving] = useState(false);
  const done = useRef(onDone);
  useLayoutEffect(() => {
    done.current = onDone;
  });

  // The freeze: fade out, then gone, on timers alone. Keys are swallowed meanwhile (taps hit the veil).
  useEffect(() => {
    const block = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', block, true);
    const fade = setTimeout(() => setLeaving(true), JOKE.freezeMs - JOKE.exitMs);
    const end = setTimeout(() => {
      window.removeEventListener('keydown', block, true);
      const back = joke.focus;
      if (back?.isConnected && document.activeElement !== back) back.focus({ preventScroll: true });
      done.current();
    }, JOKE.freezeMs);
    return () => {
      clearTimeout(fade);
      clearTimeout(end);
      window.removeEventListener('keydown', block, true);
    };
  }, [joke]);

  // The page takes the hit (not with reduced motion).
  useEffect(() => {
    const page = shakeTarget.current;
    if (reduced || !page) return;
    const shake = page.animate(
      [
        { transform: 'none' },
        { transform: 'translate(-9px, 2px)', offset: 0.15 },
        { transform: 'translate(8px, -2px)', offset: 0.35 },
        { transform: 'translate(-5px, 1px)', offset: 0.55 },
        { transform: 'translate(3px, 0px)', offset: 0.75 },
        { transform: 'none' },
      ],
      { duration: JOKE.shakeMs, easing: 'ease-out' },
    );
    return () => shake.cancel();
  }, [shakeTarget, reduced]);

  // The tapped rocket's engine goes out, and comes back as the message leaves.
  const flames = useRef<{ node: HTMLElement; opacity: string; out: Animation | null }[]>([]);
  useEffect(() => {
    const list = Array.from(joke.anchor?.querySelectorAll<HTMLElement>('[data-rocket-flame]') ?? []).map((node) => {
      const opacity = getComputedStyle(node).opacity;
      let out: Animation | null = null;
      try {
        out = node.animate([{ opacity }, { opacity: 0 }], { duration: JOKE.flameMs, fill: 'forwards' });
      } catch {
        // no Web Animations: the flame simply stays lit
      }
      return { node, opacity, out };
    });
    flames.current = list;
    return () => list.forEach((f) => f.out?.cancel());
  }, [joke]);
  useEffect(() => {
    if (!leaving) return;
    const back = flames.current.map((f) => {
      f.out?.cancel();
      f.out = null;
      try {
        return f.node.animate([{ opacity: 0 }, { opacity: f.opacity }], { duration: JOKE.exitMs });
      } catch {
        return null;
      }
    });
    return () => back.forEach((a) => a?.cancel());
  }, [leaving]);

  const lines = JOKE_LINES[joke.kind];
  const exit = { duration: JOKE.exitMs / 1000, ease: 'easeIn' } as const;
  const debris = !reduced;

  return (
    <div className="fixed inset-0 z-[90] overflow-hidden font-[family-name:var(--font-display)] text-ink">
      {/* the veil: takes every tap while the joke is up */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 touch-none bg-white/70"
        initial={{ opacity: 0 }}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={leaving ? exit : { duration: JOKE.veilInMs / 1000 }}
      />
      {!reduced && (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-heat"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.3, 0] }}
          transition={{ duration: JOKE.flashMs / 1000, times: [0, 0.25, 1] }}
        />
      )}
      {debris && joke.origin && (
        <>
          <Smoke style={{ position: 'fixed', left: joke.origin.tail.x, top: joke.origin.tail.y }} />
          <Nut style={{ position: 'fixed', left: joke.origin.body.x, top: joke.origin.body.y }} />
        </>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[55dvh] items-center justify-center px-4 pt-[env(safe-area-inset-top)]">
        <motion.div
          role="alert"
          className="relative w-full max-w-[26rem] rounded-[28px] border-[3px] border-heat bg-white px-6 py-7 text-center shadow-[0_22px_40px_-24px_rgba(0,0,0,0.45)]"
          initial={reduced ? { opacity: 0, rotate: -4 } : { opacity: 0, scale: 2.2, rotate: -12 }}
          animate={
            leaving
              ? { opacity: 0, ...(reduced ? {} : { scale: 0.96 }) }
              : reduced
                ? { opacity: 1 }
                : { opacity: [0, 1, 1], scale: [2.2, 0.94, 1], rotate: [-12, -3, -4] }
          }
          transition={
            leaving
              ? exit
              : reduced
                ? { duration: 0.2 }
                : { duration: JOKE.stampMs / 1000, times: [0, 0.7, 1], ease: ['easeIn', 'easeOut'] }
          }
        >
          <p className="text-balance text-[clamp(2.4rem,11vw,3.5rem)] font-semibold leading-[0.98] tracking-[-0.035em]">{lines.title}</p>
          {lines.sub && <p className="mt-4 text-xl font-medium text-ink/60">{lines.sub}</p>}
          {/* no rocket on screen: the smoke and the nut come off the message's top edge */}
          {debris && !joke.origin && (
            <>
              <Smoke style={{ position: 'absolute', left: '22%', top: 0 }} />
              <Nut style={{ position: 'absolute', left: '62%', top: 0 }} />
            </>
          )}
        </motion.div>
      </div>
    </div>
  );
}

// Black smoke: three coughs, each a small cloud that swells, drifts back and up, and fades.
const PUFFS = [
  { delay: 0.1, x: -26, y: -30, size: 22 },
  { delay: 0.45, x: -42, y: -44, size: 28 },
  { delay: 0.8, x: -30, y: -56, size: 20 },
] as const;

function Smoke({ style }: { style: CSSProperties }) {
  return (
    <span aria-hidden="true" className="pointer-events-none h-0 w-0" style={style}>
      {PUFFS.map((p) => (
        <motion.svg
          key={p.delay}
          viewBox="0 0 24 18"
          className="absolute left-0 top-0 fill-ink"
          style={{ width: p.size, height: (p.size * 18) / 24, marginLeft: -p.size / 2, marginTop: (-p.size * 9) / 24 }}
          initial={{ opacity: 0, scale: 0.3, x: 0, y: 0 }}
          animate={{ opacity: [0, 0.85, 0], scale: [0.3, 1, 1.5], x: p.x, y: p.y }}
          transition={{ duration: 0.9, delay: p.delay, ease: 'easeOut' }}
        >
          <circle cx="7" cy="11" r="6" />
          <circle cx="13" cy="7" r="6.5" />
          <circle cx="18" cy="12" r="5.5" />
        </motion.svg>
      ))}
    </span>
  );
}

// A nut drops off, hits the floor, bounces twice as it rolls away, and is gone.
function Nut({ style }: { style: CSSProperties }) {
  return (
    <span aria-hidden="true" className="pointer-events-none h-0 w-0" style={style}>
      <motion.svg
        viewBox="0 0 20 20"
        className="absolute -left-[9px] -top-[9px] h-[18px] w-[18px]"
        initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
        animate={{ x: [0, 12, 30, 46, 60, 74], y: [0, 110, 60, 110, 92, 110], rotate: [0, 160, 300, 400, 470, 540], opacity: [1, 1, 1, 1, 1, 0] }}
        transition={{ duration: 1.2, delay: 0.15, times: [0, 0.36, 0.56, 0.72, 0.84, 1], ease: ['easeIn', 'easeOut', 'easeIn', 'easeOut', 'easeIn'] }}
      >
        <polygon points="10,1.5 17.4,5.75 17.4,14.25 10,18.5 2.6,14.25 2.6,5.75" className="fill-white stroke-ink" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="10" cy="10" r="3.4" className="fill-white stroke-ink" strokeWidth="2" />
      </motion.svg>
    </span>
  );
}

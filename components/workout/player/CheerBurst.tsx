'use client';

import type { CSSProperties } from 'react';
import { motion } from 'motion/react';

/*
 * One comic "golpe": a white starburst with an ink outline and a flat red copy behind it, and one
 * short exclamation in the middle. It pops in, holds a little over a second and leaves growing
 * while it fades (HIT_MS in all). Only transform and opacity move; it never takes a tap.
 *
 * It sits inside CheerHits' safe zone (custom properties --s, --side, --top, --bottom on an
 * ancestor that is a size container) at a place drawn from `seed`, so a re-render never moves it.
 */

const POINTS = 14;
const CENTRE = 100;
// The text must fit inside the smallest inner radius (70): a line ~40 units tall may be ~130 wide.
const TEXT_WIDTH = 128;
const TEXT_SIZE = 46;
// The burst grows to 1.35 on its way out: the zone keeps that much room round it.
const ROOM = 1.36;

/** mulberry32: the same numbers for the same seed. */
function numbers(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Look {
  points: string;
  tilt: number; // degrees
  x: number; // 0..1 across the safe zone
  y: number; // 0..1 down the safe zone
}

/** The star (radii a little different every time, so it never looks like a stamp), tilt and place. */
function lookOf(seed: number): Look {
  const r = numbers(seed);
  const corners: string[] = [];
  for (let i = 0; i < POINTS * 2; i++) {
    const radius = i % 2 === 0 ? 89 + r() * 9 : 70 + r() * 7;
    const angle = (Math.PI * i) / POINTS - Math.PI / 2;
    corners.push(`${(CENTRE + radius * Math.cos(angle)).toFixed(1)},${(CENTRE + radius * Math.sin(angle)).toFixed(1)}`);
  }
  // About one in three perfectly straight; the rest between 4° and 14° either way.
  const straight = r() < 1 / 3;
  const side = r() < 0.5 ? -1 : 1;
  const tilt = straight ? 0 : side * (4 + r() * 10);
  return { points: corners.join(' '), tilt, x: r(), y: r() };
}

/** Shrinks the word to the burst if it would not fit (measured once the comic face is in). */
function fitText(el: SVGTextElement | null) {
  if (!el) return;
  const fit = () => {
    try {
      el.style.fontSize = '';
      const width = el.getBBox().width;
      if (width > TEXT_WIDTH) el.style.fontSize = `${(TEXT_SIZE * TEXT_WIDTH) / width}px`;
    } catch {
      // not laid out (already gone): nothing to fit
    }
  };
  fit();
  loadComicFace(el.textContent ?? '').then(fit, () => {});
}

const COMIC_FAMILY = 'var(--font-comic), Impact, "Arial Black", sans-serif';

/** Fetches the comic face now (it is used only here), so a hit never pops in the fallback. */
export function loadComicFace(text = '¡Vamos!'): Promise<unknown> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-comic').trim();
  return family ? document.fonts.load(`${TEXT_SIZE}px ${family}`, text) : Promise.resolve();
}

export function CheerBurst({
  word,
  seed,
  reduced,
  onStart,
  onDone,
}: {
  word: string;
  seed: number;
  reduced: boolean;
  onStart?: () => void;
  onDone: () => void;
}) {
  const look = lookOf(seed);
  const place: CSSProperties = {
    width: 'var(--s)',
    height: 'var(--s)',
    left: `calc(var(--side) + var(--s) * ${(ROOM - 1) / 2} + (100cqw - 2 * var(--side) - var(--s) * ${ROOM}) * ${look.x.toFixed(3)})`,
    top: `calc(var(--top) + var(--s) * ${(ROOM - 1) / 2} + (100cqh - var(--top) - var(--bottom) - var(--s) * ${ROOM}) * ${look.y.toFixed(3)})`,
  };

  const motionProps = reduced
    ? {
        initial: { opacity: 0, rotate: look.tilt },
        animate: { opacity: [0, 1, 1, 0] },
        transition: { duration: 1.2, times: [0, 0.12, 0.84, 1], ease: 'linear' as const },
      }
    : {
        initial: { opacity: 0, scale: 0.2, rotate: look.tilt - 25 },
        animate: {
          scale: [0.2, 1.15, 1, 1, 1.35],
          rotate: [look.tilt - 25, look.tilt, look.tilt, look.tilt, look.tilt],
          opacity: [0, 1, 1, 1, 0],
        },
        // 0.18 s pop, 0.1 s settle, ~1 s hold, 0.2 s out: 1.5 s (HIT_MS)
        transition: {
          duration: 1.5,
          times: [0, 0.12, 0.19, 0.87, 1],
          ease: ['easeOut' as const, 'easeInOut' as const, 'linear' as const, 'easeIn' as const],
        },
      };

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none absolute"
      style={place}
      {...motionProps}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      onAnimationStart={onStart}
      onAnimationComplete={onDone}
    >
      <svg viewBox="-4 -4 216 216" className="block h-full w-full overflow-visible">
        <polygon points={look.points} transform="translate(7 8)" fill="#ff3b30" />
        <polygon points={look.points} fill="#ffffff" stroke="#131313" strokeWidth={5} strokeLinejoin="round" />
        <text
          ref={fitText}
          x={CENTRE}
          y={CENTRE + 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#131313"
          fontSize={TEXT_SIZE}
          style={{ fontFamily: COMIC_FAMILY }}
        >
          {word}
        </text>
      </svg>
    </motion.div>
  );
}

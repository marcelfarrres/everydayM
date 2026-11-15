'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useReducedMotion } from 'motion/react';
import type { RoutineItem, TimelineSegment } from '@/types/workout';

type Part = { key: string; label: string; count: number; seconds: number; color: string };

const ROUND_COLORS = ['#ff3b30', '#ff6a61', '#e0261c', '#ff8f88', '#c41f14', '#ffb0aa'];

/** The routine in order: warm-up, then each round (its rests included), sized by real time. */
function partsOf(queue: RoutineItem[], timeline: TimelineSegment[]): Part[] {
  const parts: Part[] = [];
  queue.forEach((item, i) => {
    const seconds = Math.max(0, timeline[i]?.duration ?? 0);
    const owner = item.kind === 'rest' ? queue[i - 1] : item;
    if (owner?.kind !== 'warmup' && owner?.kind !== 'workout') return;
    const key = owner.kind === 'warmup' ? 'warm' : `r${owner.round}`;
    let part = parts.find((p) => p.key === key);
    if (!part) {
      const rounds = parts.filter((p) => p.key !== 'warm').length;
      part = {
        key,
        label: owner.kind === 'warmup' ? 'Calentamiento' : `Ronda ${owner.round}`,
        count: 0,
        seconds: 0,
        color: owner.kind === 'warmup' ? '#ff9f0a' : ROUND_COLORS[rounds % ROUND_COLORS.length],
      };
      parts.push(part);
    }
    part.seconds += seconds;
    if (item.kind !== 'rest') part.count += 1;
  });
  return parts;
}

/** SVG path of a ring slice between two angles (degrees, 0 = top, clockwise). */
function arc(a0: number, a1: number, r0: number, r1: number): string {
  const p = (a: number, r: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return `${(100 + r * Math.cos(rad)).toFixed(2)} ${(100 + r * Math.sin(rad)).toFixed(2)}`;
  };
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${p(a0, r1)}A${r1} ${r1} 0 ${large} 1 ${p(a1, r1)}L${p(a1, r0)}A${r0} ${r0} 0 ${large} 0 ${p(a0, r0)}Z`;
}

/**
 * The plan as a clock: the routine's parts around a ring, in order. A hand sweeps round once
 * over `seconds`; the part it is passing grows out of the ring and says what it is in the middle.
 */
export function RoutinePlan({ queue, timeline, seconds }: { queue: RoutineItem[]; timeline: TimelineSegment[]; seconds: number }) {
  const reduced = useReducedMotion();
  const parts = partsOf(queue, timeline);
  const total = parts.reduce((a, p) => a + p.seconds, 0) || 1;
  const shapes = parts.map((p, i) => {
    const before = parts.slice(0, i).reduce((a, x) => a + x.seconds, 0);
    const a0 = (before / total) * 360;
    const a1 = ((before + p.seconds) / total) * 360;
    return { ...p, a0, a1, mid: (a0 + a1) / 2 };
  });

  const angle = useMotionValue(0);
  const [active, setActive] = useState(0);
  const handRef = useRef<SVGGElement>(null);
  useEffect(() => {
    const controls = animate(angle, 359.9, { duration: Math.max(4, seconds - 0.5), ease: 'linear' });
    return () => controls.stop();
  }, [angle, seconds]);
  useMotionValueEvent(angle, 'change', (a) => {
    // rotate with SVG's own transform: exact centre, no CSS transform-origin quirks
    handRef.current?.setAttribute('transform', `rotate(${a.toFixed(2)} 100 100)`);
    const i = shapes.findIndex((s) => a >= s.a0 && a < s.a1);
    if (i !== -1 && i !== active) setActive(i);
  });

  const now = shapes[active];

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="relative aspect-square w-[min(78cqw,19rem)]">
        <svg viewBox="-34 -34 268 268" className="h-full w-full overflow-visible" aria-hidden="true">
          {shapes.map((s, i) => {
            const on = i === active;
            const passed = i < active;
            const rad = ((s.mid - 90) * Math.PI) / 180;
            const gap = shapes.length > 1 ? 1.4 : 0;
            return (
              <g key={s.key}>
                {/* the part being passed grows outwards: same shape, bigger radii */}
                <motion.path
                  initial={false}
                  animate={{
                    d: arc(s.a0 + gap, Math.max(s.a0 + gap + 0.5, s.a1 - gap), on ? 54 : 56, on ? 100 : 88),
                    opacity: on ? 1 : passed ? 0.85 : 0.35,
                  }}
                  transition={{ type: 'spring', stiffness: 260, damping: 18, opacity: { duration: 0.35 } }}
                  fill={s.color}
                />
                {/* the part's name, outside the ring, upright */}
                <text
                  x={100 + Math.cos(rad) * 114}
                  y={100 + Math.sin(rad) * 114 + 4}
                  textAnchor={Math.abs(Math.cos(rad)) < 0.3 ? 'middle' : Math.cos(rad) > 0 ? 'start' : 'end'}
                  className={`fill-white text-[11px] font-semibold transition-opacity duration-300 ${on ? 'opacity-100' : 'opacity-55'}`}
                >
                  {s.label}
                </text>
              </g>
            );
          })}
          {/* the hand */}
          {!reduced && (
            <g ref={handRef}>
              <line x1="100" y1="100" x2="100" y2="6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="100" cy="6" r="5" fill="#fff" />
              <circle cx="100" cy="100" r="4" fill="#fff" />
            </g>
          )}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <AnimatePresence mode="wait" initial={false}>
            {now && (
              <motion.div
                key={now.key}
                initial={reduced ? false : { opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? undefined : { opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.25 }}
                className="rounded-full bg-black/45 px-3 py-2 backdrop-blur-sm"
              >
                <p className="text-[min(5.4cqw,1.2rem)] font-bold leading-tight">{now.label}</p>
                <p className="text-[min(3.8cqw,0.85rem)] font-semibold text-white/75">
                  {now.count} ejercicios · {Math.max(1, Math.round(now.seconds / 60))} min
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

    </div>
  );
}

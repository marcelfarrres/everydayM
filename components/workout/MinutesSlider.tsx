'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const EASE = [0.16, 1, 0.3, 1] as const;

function mood(minutes: number): string {
  if (minutes <= 22) return 'Exprés';
  if (minutes <= 28) return 'Ligera';
  if (minutes <= 35) return 'Completa';
  return 'A fondo';
}

/**
 * Drag to choose the routine's length. The number rolls, a word says what kind of session it is,
 * and `preview` can show the routine it would build (rounds × exercises) while you drag.
 * A native range input sits on top, so touch, mouse, keyboard and screen readers all work.
 */
export function MinutesSlider({
  value,
  onChange,
  onCommit,
  preview,
  min = 20,
  max = 40,
}: {
  value: number;
  onChange: (minutes: number) => void;
  onCommit?: (minutes: number) => void;
  preview?: string;
  min?: number;
  max?: number;
}) {
  const reduced = useReducedMotion();
  const [dragging, setDragging] = useState(false);
  const fraction = (value - min) / (max - min);
  const ticks = Array.from({ length: Math.floor((max - min) / 5) + 1 }, (_, i) => min + i * 5);

  const set = (next: number) => {
    if (next === value) return;
    if (next % 5 === 0) navigator.vibrate?.(6); // a tiny click on every 5 minutes, where phones allow it
    onChange(next);
  };

  return (
    <div className="flex w-full flex-col gap-5 select-none">
      <div className="flex items-end justify-between gap-4">
        <p className="flex items-baseline gap-2 leading-none" aria-hidden="true">
          <span className="inline-flex overflow-hidden text-[clamp(4.5rem,18vw,7rem)] font-bold tabular-nums tracking-[-0.05em]">
            {String(value)
              .split('')
              .map((ch, i) => (
                <span key={i} className="relative inline-flex overflow-hidden">
                  <AnimatePresence mode="popLayout" initial={false}>
                    <motion.span
                      key={ch}
                      initial={reduced ? false : { y: '60%', opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={reduced ? undefined : { y: '-60%', opacity: 0 }}
                      transition={{ duration: 0.25, ease: EASE }}
                    >
                      {ch}
                    </motion.span>
                  </AnimatePresence>
                </span>
              ))}
          </span>
          <span className="text-3xl font-semibold text-ink/50">min</span>
        </p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={mood(value)}
            initial={reduced ? false : { opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            className="mb-3 rounded-full bg-heat px-3.5 py-1.5 text-[15px] font-bold text-white"
          >
            {mood(value)}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="relative mx-5 h-14">
        {/* track, fill and the minute ticks */}
        <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-ink/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-heat/70 to-heat"
            animate={{ width: `${fraction * 100}%` }}
            transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 700, damping: 45 }}
          />
        </div>
        {Array.from({ length: max - min + 1 }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            className={`absolute top-1/2 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
              (min + i) % 5 === 0 ? 'h-6' : 'h-2.5'
            } ${min + i <= value ? 'bg-white/80' : 'bg-ink/20'}`}
            style={{ left: `${(i / (max - min)) * 100}%` }}
          />
        ))}
        {/* thumb */}
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_8px_24px_-6px_rgba(0,0,0,0.45)] ring-4 ring-heat"
          animate={{ left: `${fraction * 100}%`, scale: dragging ? 1.25 : 1 }}
          transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 700, damping: 40 }}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-heat" />
        </motion.span>
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-label="Duración de la rutina"
          aria-valuetext={`${value} minutos`}
          onChange={(e) => set(Number(e.target.value))}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => {
            setDragging(false);
            onCommit?.(value);
          }}
          onPointerCancel={() => setDragging(false)}
          onKeyUp={() => onCommit?.(value)}
          className="absolute inset-0 h-full w-full cursor-grab opacity-0 active:cursor-grabbing"
        />
      </div>

      <div className="relative mx-5 -mt-3 h-6">
        {ticks.map((t) => (
          <button
            key={t}
            type="button"
            tabIndex={-1}
            onClick={() => {
              set(t);
              onCommit?.(t);
            }}
            className={`absolute -translate-x-1/2 text-[14px] font-semibold tabular-nums transition-colors ${
              t === value ? 'text-ink' : 'text-ink/45 hover:text-ink'
            }`}
            style={{ left: `${((t - min) / (max - min)) * 100}%` }}
          >
            {t}
          </button>
        ))}
      </div>

      {preview && (
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={preview}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.2 }}
            className="text-lg font-semibold text-ink/65"
          >
            {preview}
          </motion.p>
        </AnimatePresence>
      )}
    </div>
  );
}

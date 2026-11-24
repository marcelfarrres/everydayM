'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { RoutineItem, RoutineMeta } from '@/types/workout';

/*
 * Computer view: the routine on a real chalkboard. The current block is written line by line in
 * chalk; finished exercises get crossed out, the one you are on gets circled, and the clock is
 * chalk too. Words a first-timer understands: "Bloque 2 · queda 1", not "ronda 2 de 3".
 */

const CHALK = '#f3f0e7';
const YELLOW = '#ffe27a';
const EASE = [0.16, 1, 0.3, 1] as const;

// Hand-drawn strokes (viewBox 0 0 230 40, stretched to the word)
const STRIKE = 'M2 23 C40 17 92 28 132 20 S202 26 228 17';
const RING = 'M20 6 C72 -4 204 0 224 16 C240 34 58 45 12 31 C-8 23 4 6 56 3';

function roundsLeftText(round: number, rounds: number): string {
  const left = rounds - round;
  return left <= 0 ? 'la última' : left === 1 ? 'queda 1' : `quedan ${left}`;
}

function ChalkLine({
  children,
  i,
  state = 'todo',
  className = '',
}: {
  children: React.ReactNode;
  i: number;
  state?: 'todo' | 'done' | 'now';
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.span
      initial={reduced ? false : { clipPath: 'inset(-30% 100% -30% 0%)' }}
      animate={{ clipPath: 'inset(-30% -10% -30% 0%)', opacity: state === 'done' ? 0.5 : 1 }}
      transition={{ clipPath: { duration: 0.55, delay: 0.25 + i * 0.13, ease: [0.45, 0, 0.55, 1] }, opacity: { duration: 0.4 } }}
      className={`relative inline-block self-start ${className}`}
    >
      {children}
      {state !== 'todo' && (
        <svg viewBox="0 0 230 40" preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute -inset-x-3 -inset-y-2 h-[calc(100%+1rem)] w-[calc(100%+1.5rem)] overflow-visible">
          <motion.path
            key={state}
            d={state === 'done' ? STRIKE : RING}
            fill="none"
            stroke={state === 'done' ? CHALK : YELLOW}
            strokeWidth={state === 'done' ? 3.5 : 3}
            strokeLinecap="round"
            initial={reduced ? false : { pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.6, delay: 0.15, ease: [0.45, 0, 0.55, 1] }}
            style={{ filter: 'drop-shadow(0 0 1px rgba(255,255,255,.6))' }}
          />
        </svg>
      )}
    </motion.span>
  );
}

export function ChalkBoard({
  queue,
  currentIndex,
  meta,
  time,
  critical,
  className = '',
}: {
  queue: RoutineItem[];
  currentIndex: number;
  meta?: RoutineMeta | null;
  time: string;
  critical: boolean;
  className?: string;
}) {
  const item = queue[currentIndex];
  const warmups = queue.map((q, i) => ({ q, i })).filter(({ q }) => q.kind === 'warmup');
  const onWarmup = item?.kind === 'warmup';
  const round = item?.kind === 'workout' ? item.round : item?.kind === 'rest' ? item.nextRound : 1;
  const rounds = meta?.rounds ?? 1;
  const roundItems = queue
    .map((q, i) => ({ q, i }))
    .filter((x): x is { q: Extract<RoutineItem, { kind: 'workout' }>; i: number } => x.q.kind === 'workout' && x.q.round === round);
  const list = onWarmup ? warmups : roundItems;
  // During a rest the one coming up is circled; everything before it is crossed out.
  const nowIndex = item?.kind === 'rest' ? queue.findIndex((q, i) => i > currentIndex && q.kind === 'workout') : currentIndex;
  const stateOf = (i: number) => (i < nowIndex ? 'done' : i === nowIndex ? 'now' : 'todo');
  const next = queue.find((q, i) => i > currentIndex && (q.kind === 'warmup' || q.kind === 'workout'));
  const minutes = meta ? Math.max(1, Math.round(meta.totalSeconds / 60)) : 0;
  const chalk = { color: CHALK, textShadow: '0 0 1px rgba(255,255,255,.75), 0 0 10px rgba(255,255,255,.12)' };

  return (
    <section aria-label="La rutina en la pizarra" className={`min-w-0 items-center gap-10 ${className}`} style={chalk}>
      <div className="flex min-w-0 flex-1 flex-col gap-1 font-[family-name:var(--font-chalk)]">
        <p className="mb-3 text-[26px] opacity-70">
          {meta?.focusLabel} · {minutes} min
        </p>
        {/* the block being done, rewritten when the block changes */}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={onWarmup ? 'warm' : `r${round}`}
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
            className="flex flex-col gap-1"
          >
            {!onWarmup && warmups.length > 0 && (
              <ChalkLine i={0} state="todo" className="mb-1 text-[28px] opacity-60">
                Calentamiento ✓
              </ChalkLine>
            )}
            <ChalkLine i={1} className="mb-2 text-[clamp(2.5rem,3.7vw,3.4rem)] font-bold">
              <span style={{ color: YELLOW }}>{onWarmup ? 'Calentamiento' : `Bloque ${round} · ${roundsLeftText(round, rounds)}`}</span>
            </ChalkLine>
            {list.map(({ q, i }, k) => (
              <ChalkLine key={i} i={k + 2} state={stateOf(i)} className="text-[clamp(1.9rem,2.8vw,2.7rem)] leading-[1.3]">
                {k + 1}. {q.kind === 'warmup' || q.kind === 'workout' ? q.exercise.title : ''}
              </ChalkLine>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* the clock, in chalk */}
      <div className="flex w-[min(30%,20rem)] shrink-0 flex-col items-center text-center">
        <motion.p
          key={critical ? time : 'steady'}
          initial={critical ? { scale: 1.25, opacity: 0.4 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="font-[family-name:var(--font-chalk)] text-[clamp(6rem,11vw,10rem)] font-bold leading-none tabular-nums"
          style={{ color: critical ? '#ff8a7a' : CHALK }}
        >
          {time}
        </motion.p>
        <p className="mt-1 font-[family-name:var(--font-chalk)] text-[30px] opacity-75">
          {item?.kind === 'rest' ? 'descansa' : 'quedan'}
        </p>
        {next && (next.kind === 'warmup' || next.kind === 'workout') && (
          <p className="mt-8 font-[family-name:var(--font-chalk)] text-[28px] opacity-80">
            luego: <span style={{ color: YELLOW }}>{next.exercise.title}</span>
          </p>
        )}
      </div>
    </section>
  );
}

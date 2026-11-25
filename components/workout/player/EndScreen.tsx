'use client';

import { motion } from 'motion/react';
import { RotateCcw } from 'lucide-react';
import { uniqueExercises } from '@/lib/routine';
import type { RoutineItem, RoutineMeta } from '@/types/workout';
import { plural } from './model';
import { FOCUS, PRESSABLE } from './ui';

/*
 * The end (computer): "Hecho", the totals and the two ways on. No videos: when the day's exercises
 * have a still (poster_url), a quiet row of them; otherwise nothing. A phone has its own end
 * (PhoneEndScreen: the drums, the list crossed off, the rocket put back together).
 */
export function EndScreen({
  meta,
  queue,
  reduced,
  onRepeat,
  onExit,
}: {
  meta: RoutineMeta;
  queue: RoutineItem[];
  reduced: boolean;
  onRepeat?: () => void;
  onExit: () => void;
}) {
  const minutes = Math.max(1, Math.round(meta.totalSeconds / 60));
  const series = queue.filter((q) => q.kind === 'workout').length;
  const stills = uniqueExercises(meta).filter((exercise) => exercise.poster_url).slice(0, 8);
  const rise = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, transform: 'translateY(16px)' },
          animate: { opacity: 1, transform: 'translateY(0px)' },
          transition: { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <div className="relative flex h-full w-full flex-col justify-between bg-ink px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[calc(max(0.75rem,env(safe-area-inset-top))+4.5rem)] text-white lg:px-8 lg:pb-8 lg:pt-20">
      <div>
        <motion.h2 {...rise(0)} className="text-[min(18cqw,4.5rem)] font-bold leading-none tracking-[-0.04em]">
          Hecho
        </motion.h2>
        <motion.p {...rise(0.08)} className="mt-3 text-[17px] font-medium tabular-nums text-white/80">
          {minutes} min · {plural(meta.rounds, 'bloque', 'bloques')} · {plural(series, 'serie', 'series')}
        </motion.p>
      </div>

      {stills.length > 0 && (
        <motion.ul {...rise(0.16)} aria-label="Los ejercicios de hoy" className="grid grid-cols-4 gap-2">
          {stills.map((exercise) => (
            <li key={exercise.id} className="flex flex-col gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote stills of any size, shown small */}
              <img
                src={exercise.poster_url ?? ''}
                alt=""
                loading="lazy"
                decoding="async"
                className="aspect-[9/16] w-full rounded-xl object-cover ring-1 ring-white/25 grayscale"
              />
              <span className="line-clamp-2 text-[12px] leading-tight text-white/75">{exercise.title}</span>
            </li>
          ))}
        </motion.ul>
      )}

      <motion.div {...rise(0.24)} className="grid grid-cols-2 gap-2">
        {onRepeat && (
          <button
            type="button"
            onClick={onRepeat}
            className={`flex h-14 items-center justify-center gap-2 rounded-full bg-white text-lg font-semibold text-ink hover:bg-white/85 ${PRESSABLE} ${FOCUS}`}
          >
            <RotateCcw className="h-5 w-5" aria-hidden="true" /> Repetir
          </button>
        )}
        <button
          type="button"
          onClick={onExit}
          className={`flex h-14 items-center justify-center rounded-full text-lg font-semibold text-white ring-1 ring-white/70 ring-inset hover:bg-white/15 ${onRepeat ? '' : 'col-span-2'} ${PRESSABLE} ${FOCUS}`}
        >
          Otra rutina
        </button>
      </motion.div>
    </div>
  );
}

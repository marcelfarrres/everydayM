'use client';

import { motion } from 'motion/react';
import { FOCUS, HOVER_ON_DARK, PRESSABLE, own } from './ui';

/*
 * The bar during a rest: same size as while exercising, no hilo. It fills with blue water from
 * the bottom up, with a wave on the surface; full = the serie starts. "Descanso", the time,
 * "Luego: <ejercicio>" small, and "Saltar". No pause button. When the video already shows the
 * giant countdown and "Luego" (RestCountdown), the bar leaves out both: "Descanso" and "Saltar".
 * On the narrowest phones (320 px, with the mini preview at the left) the time and "Saltar"
 * tighten their padding so "Descanso" fits whole.
 */

// Water sits on the bar's dark fill; white text keeps >= 4.5:1 on both.
const WATER = '#2563eb';
// One wavelength is 40 units; the strip is two screens of waves and slides by half its width.
const WAVE = Array<string>(24).fill('q10 -6 20 0 t20 0').join(' ');

export function RestBar({
  next,
  time,
  fill,
  reduced,
  onSkip,
}: {
  next?: string; // left out while the video shows it
  time?: string; // left out while the video shows the giant countdown
  fill: number; // 0..1, where the water should be one second from now
  reduced: boolean;
  onSkip: () => void;
}) {
  const level = Math.min(1, Math.max(0, fill));
  return (
    <>
      {/* the water: only its transform moves */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0"
        initial={{ transform: 'translateY(100%)' }}
        animate={{ transform: `translateY(${((1 - level) * 100).toFixed(2)}%)` }}
        transition={reduced ? { duration: 0 } : { duration: 1, ease: 'linear' }}
      >
        <div className="absolute inset-0" style={{ background: WATER }} />
        {level < 1 && (
          <div className="absolute inset-x-0 -top-[6px] h-[7px] overflow-hidden">
            <svg
              viewBox="0 0 960 7"
              preserveAspectRatio="none"
              className={`h-full w-[200%] ${reduced ? '' : 'water-wave'}`}
            >
              <path d={`M0 6 ${WAVE} V7 H0 Z`} fill={WATER} />
            </svg>
          </div>
        )}
      </motion.div>

      <div className={`relative flex h-full flex-col ${next ? 'justify-between' : 'justify-center'}`}>
        {next && (
          <p className="flex h-6 min-w-0 items-center truncate text-[13px] font-medium text-white">
            <span className="truncate">Luego: {next}</span>
          </p>
        )}
        <div className="flex h-11 items-center gap-0.5">
          <p className="min-w-0 flex-1 truncate text-[16px] font-semibold leading-tight">Descanso</p>
          {time && (
            <span role="timer" className="shrink-0 px-1 text-[21px] min-[360px]:px-1.5 font-bold leading-none tabular-nums tracking-[-0.02em]">
              {time}
            </span>
          )}
          <button
            type="button"
            onClick={own(onSkip)}
            className={`flex h-11 shrink-0 items-center rounded-full px-3 text-[15px] min-[360px]:px-4 font-semibold ring-1 ring-white/80 ring-inset ${PRESSABLE} ${HOVER_ON_DARK} ${FOCUS}`}
          >
            Saltar
          </button>
        </div>
      </div>
    </>
  );
}

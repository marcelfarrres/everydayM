'use client';

import { useEffect, useRef } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

let sharedAudioCtx: AudioContext | null = null;

export function playCountdownBeep(secondsRemaining: number) {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;

    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }

    const osc = sharedAudioCtx.createOscillator();
    const gain = sharedAudioCtx.createGain();

    // Higher pitch on 1s / go
    const frequency = secondsRemaining <= 1 ? 880 : 660;
    const duration = secondsRemaining <= 1 ? 0.18 : 0.11;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, sharedAudioCtx.currentTime);

    gain.gain.setValueAtTime(0.001, sharedAudioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.18,
      sharedAudioCtx.currentTime + 0.015,
    );
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      sharedAudioCtx.currentTime + duration,
    );

    osc.connect(gain);
    gain.connect(sharedAudioCtx.destination);

    osc.start(sharedAudioCtx.currentTime);
    osc.stop(sharedAudioCtx.currentTime + duration + 0.02);
  } catch {
    // Ignore audio context restriction errors if user hasn't interacted yet
  }
}

interface CountdownRingProps {
  timeLeft: number;
  totalDuration: number;
  label?: string;
  sublabel?: string;
  size?: number;
  strokeWidth?: number;
  soundEnabled?: boolean;
  isPaused?: boolean;
  isPrepPhase?: boolean;
}

export function CountdownRing({
  timeLeft,
  totalDuration,
  label,
  sublabel = 'SEGUNDOS',
  size = 168,
  strokeWidth = 10,
  soundEnabled = true,
  isPaused = false,
  isPrepPhase = false,
}: CountdownRingProps) {
  const prefersReducedMotion = useReducedMotion();
  const lastBeepSecondRef = useRef<number | null>(null);

  const safeTotal = Math.max(1, totalDuration);
  const clampedLeft = Math.max(0, timeLeft);
  const progress = Math.max(
    0,
    Math.min(1, (safeTotal - clampedLeft) / safeTotal),
  );

  const isCritical = clampedLeft > 0 && clampedLeft <= 3;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference * (1 - progress);

  useEffect(() => {
    if (!soundEnabled || isPaused) return;
    if (clampedLeft > 0 && clampedLeft <= 3) {
      if (lastBeepSecondRef.current !== clampedLeft) {
        lastBeepSecondRef.current = clampedLeft;
        playCountdownBeep(clampedLeft);
      }
    } else {
      lastBeepSecondRef.current = null;
    }
  }, [clampedLeft, soundEnabled, isPaused]);

  const strokeColor = isCritical
    ? '#ef4444'
    : isPrepPhase
      ? '#f59e0b'
      : '#22c55e';

  const glowColor = isCritical
    ? 'rgba(239, 68, 68, 0.45)'
    : isPrepPhase
      ? 'rgba(245, 158, 11, 0.4)'
      : 'rgba(34, 197, 94, 0.35)';

  return (
    <div
      className="relative inline-flex items-center justify-center select-none"
      style={{ width: size, height: size }}
    >
      {isCritical && !prefersReducedMotion && (
        <motion.div
          initial={{ scale: 0.9, opacity: 0.6 }}
          animate={{ scale: [0.95, 1.08, 0.95], opacity: [0.55, 0.15, 0.55] }}
          transition={{ duration: 0.85, repeat: Infinity, ease: 'easeInOut' }}
          className="pointer-events-none absolute inset-1 rounded-full border-2 border-red-500/60 bg-red-500/10"
        />
      )}

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 transform overflow-visible"
        role="img"
        aria-label={`Cuenta atrás: ${clampedLeft} segundos restantes`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            transition: prefersReducedMotion
              ? 'none'
              : 'stroke-dashoffset 0.35s ease-out, stroke 0.25s ease',
            filter: `drop-shadow(0 0 10px ${glowColor})`,
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
        {label && (
          <span
            className={`text-[11px] font-black uppercase tracking-[0.18em] mb-0.5 ${
              isCritical
                ? 'text-red-400'
                : isPrepPhase
                  ? 'text-amber-300'
                  : 'text-[#4ade80]'
            }`}
          >
            {label}
          </span>
        )}

        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={clampedLeft}
            initial={
              prefersReducedMotion
                ? false
                : { scale: isCritical ? 1.28 : 1.1, opacity: 0.6 }
            }
            animate={{ scale: 1, opacity: 1 }}
            exit={
              prefersReducedMotion ? undefined : { scale: 0.85, opacity: 0 }
            }
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className={`font-sans font-black leading-none tracking-tighter tabular-nums ${
              size >= 150 ? 'text-5xl' : 'text-3xl'
            } ${
              isCritical
                ? 'text-red-400 drop-shadow-[0_0_18px_rgba(239,68,68,0.65)]'
                : isPrepPhase
                  ? 'text-amber-300 drop-shadow-[0_0_16px_rgba(245,158,11,0.5)]'
                  : 'text-white drop-shadow-[0_0_16px_rgba(34,197,94,0.3)]'
            }`}
          >
            {clampedLeft}
          </motion.span>
        </AnimatePresence>

        <span
          className={`mt-1 text-[11px] font-bold uppercase tracking-[0.2em] ${
            isCritical
              ? 'text-red-300'
              : isPrepPhase
                ? 'text-amber-200'
                : 'text-neutral-300'
          }`}
        >
          {isCritical ? '¡FINAL!' : sublabel}
        </span>
      </div>
    </div>
  );
}

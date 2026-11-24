'use client';

import { AnimatePresence, motion } from 'motion/react';

/*
 * A rest without talks: the next exercise loops in the background behind a flat dark veil, so it
 * reads as "luego", not "ahora". On top, once the clouds have gone, the seconds left as one giant
 * number and, under it, "Luego: <ejercicio>". The bar below says "Descanso" and "Saltar" only.
 *
 * The veil is a solid translucent black (no blur, no blend modes). Each second the number settles
 * in with a small scale and fade (transform and opacity only); with reduced motion it just changes.
 */
export function RestCountdown({
  seconds,
  next,
  show,
  reduced,
}: {
  seconds: number;
  next: string;
  show: boolean; // false while the clouds are still on screen
  reduced: boolean;
}) {
  const value = Math.max(0, Math.round(seconds));
  return (
    <>
      <div aria-hidden="true" className="absolute inset-0 bg-black/60" />
      <AnimatePresence>
        {show && (
          <motion.div
            key="countdown"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduced ? 0 : 0.35 }}
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 pb-[8%] text-center text-white"
          >
            <p role="timer" className="text-[min(40cqw,12rem)] font-bold leading-none tracking-[-0.05em] tabular-nums">
              {reduced ? (
                value
              ) : (
                <motion.span
                  key={value}
                  className="inline-block"
                  initial={{ opacity: 0.6, transform: 'scale(0.95)' }}
                  animate={{ opacity: 1, transform: 'scale(1)' }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  {value}
                </motion.span>
              )}
              <span className="sr-only"> segundos de descanso</span>
            </p>
            <p className="mt-3 line-clamp-2 max-w-full text-[clamp(1rem,5.5cqw,1.5rem)] font-medium leading-snug text-white/90">
              Luego: {next}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

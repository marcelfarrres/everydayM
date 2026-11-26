'use client';

import { useLayoutEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { FINALE } from '@/components/workout/assembly';

/*
 * The creator's automatic finale (phone), over the assembly scene or the start screen's base:
 * the routine's sentence in the sky (`sentence`, when the page itself does not write it), and at
 * lift-off the rocket's white smoke grows from its pad until it covers the whole screen. The white text that follows is whiteVeil.ts. Transforms and opacity only.
 */

export type FinalePhase = 'wait' | 'read' | 'launch' | 'smoke' | 'white';

/** The sentence of the finale: big and calm (the size of the ready view's sentence). */
export const FINALE_SENTENCE = 'text-pretty text-[clamp(1.75rem,7vw,2.5rem)] font-semibold leading-[1.12] tracking-[-0.02em]';

// the puffs of smoke: where they start around the pad (in units of the screen's width) and how far they grow
const PUFFS: [number, number, number, number][] = [
  [0, 0, 1.1, 0],
  [-0.12, 0.02, 1.25, 60],
  [0.12, 0.02, 1.2, 40],
  [-0.24, 0.05, 1.3, 120],
  [0.24, 0.05, 1.25, 90],
  [0, -0.08, 1.35, 150],
  [-0.06, -0.2, 1.5, 230],
  [0.08, -0.32, 1.6, 300],
];

export function LaunchFinale({
  phase,
  sentence,
  smokeFrom,
  reduced,
}: {
  phase: FinalePhase;
  /** written here, at the top (the start screen's launch); null when the page writes it itself */
  sentence: string | null;
  /** the pad, on the screen, where the smoke grows from */
  smokeFrom: { x: number; y: number } | null;
  reduced: boolean;
}) {
  const smokeRef = useRef<HTMLDivElement>(null);

  // the smoke: puffs growing from the pad, then the white closing over everything
  useLayoutEffect(() => {
    const root = smokeRef.current;
    if (!root || phase !== 'smoke' || reduced) return;
    const anims: Animation[] = [];
    const W = window.innerWidth;
    const H = window.innerHeight;
    const diag = Math.hypot(W, H);
    root.querySelectorAll<HTMLElement>('[data-puff]').forEach((puff, i) => {
      const [, , grow, delay] = PUFFS[i] ?? [0, 0, 1, 0];
      const to = (diag / 60) * grow;
      anims.push(
        puff.animate([{ transform: 'scale(0.15)', opacity: 0.6 }, { transform: 'scale(1)', opacity: 1, offset: 0.25 }, { transform: `scale(${to.toFixed(2)})`, opacity: 1 }], {
          duration: FINALE.smokeMs - delay,
          delay,
          easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)',
          fill: 'both',
        }),
      );
    });
    const white = root.querySelector<HTMLElement>('[data-white]');
    if (white) anims.push(white.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FINALE.smokeMs * 0.4, delay: FINALE.smokeMs * 0.6, easing: 'ease-in', fill: 'both' }));
    return () => anims.forEach((a) => a.cancel());
  }, [phase, reduced]);

  const from = smokeFrom ?? { x: typeof window === 'undefined' ? 0 : window.innerWidth / 2, y: typeof window === 'undefined' ? 0 : window.innerHeight };
  const vw = typeof window === 'undefined' ? 390 : window.innerWidth;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] font-[family-name:var(--font-display)] text-ink lg:hidden">
      {sentence && (phase === 'read' || phase === 'launch' || phase === 'smoke') && (
        <motion.p
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className={`absolute left-5 right-5 top-[calc(4.5rem+env(safe-area-inset-top))] ${FINALE_SENTENCE}`}
          aria-live="polite"
        >
          {sentence}
        </motion.p>
      )}

      {/* the smoke, then the white */}
      {(phase === 'smoke' || phase === 'white') && (
        <div ref={smokeRef} aria-hidden="true" className="absolute inset-0 overflow-hidden">
          {!reduced &&
            PUFFS.map(([dx, dy], i) => (
              <span
                key={i}
                data-puff=""
                className="absolute h-[60px] w-[60px] rounded-full bg-white shadow-[6px_8px_0_0_#dedcd6]"
                style={{ left: from.x + dx * vw - 30, top: from.y + dy * vw - 30, opacity: 0 }}
              />
            ))}
          <span data-white="" className="absolute inset-0 bg-white" style={{ opacity: reduced || phase === 'white' ? 1 : 0 }} />
        </div>
      )}
    </div>
  );
}

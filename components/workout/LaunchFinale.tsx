'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import { BIG_RIM, DRESS, FINALE, bigPorthole, portholeTimeline, type Circle } from '@/components/workout/assembly';
import { LAUNCH } from '@/components/workout/launchDrum';
import { PortholeFrame, ZoomLinesSvg } from '@/components/workout/PortholeFrame';
import { DressSequence } from '@/components/workout/DressSequence';

/*
 * The creator's automatic finale (phone), over the assembly scene or the start screen's base:
 * the routine's sentence in the sky (`sentence`, when the page itself does not write it), and at
 * lift-off the rocket's white smoke grows from its pad until it covers the whole screen. The white text that follows is whiteVeil.ts. Transforms and opacity only.
 *
 * With no questions (the start screen's own launch held on its pad, `dress`): between the sentence
 * and the rocket a big porthole grows out of the rocket's window, the last change of clothes plays
 * in it (DressSequence), and it shrinks back into the window; the rocket lifts off as it arrives
 * (the page lets it go on the same timeline: portholeTimeline).
 */

/** The start screen's held rocket: its window and top on the screen, and when the porthole starts (performance time). */
export interface FinaleDress {
  window: Circle;
  top: number;
  startAt: number;
}

/** The big porthole's widest, as a share of the screen's width. */
export const BIG_PORTHOLE_SHARE = 0.6;

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
  dress = null,
}: {
  phase: FinalePhase;
  /** written here, at the top (the start screen's launch); null when the page writes it itself */
  sentence: string | null;
  /** the pad, on the screen, where the smoke grows from */
  smokeFrom: { x: number; y: number } | null;
  reduced: boolean;
  /** the porthole of the start screen's launch (null: none) */
  dress?: FinaleDress | null;
}) {
  const smokeRef = useRef<HTMLDivElement>(null);
  const sentenceRef = useRef<HTMLParagraphElement>(null);

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
          ref={sentenceRef}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className={`absolute left-5 right-5 top-[calc(4.5rem+env(safe-area-inset-top))] ${FINALE_SENTENCE}`}
          aria-live="polite"
        >
          {sentence}
        </motion.p>
      )}

      {dress && !reduced && (phase === 'read' || phase === 'launch') && <DressPorthole dress={dress} sentenceRef={sentenceRef} />}

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

/**
 * The big porthole between the sentence and the held rocket: it grows out of the rocket's window,
 * the change of clothes plays, it shrinks back into the window (all on portholeTimeline).
 */
function DressPorthole({ dress, sentenceRef }: { dress: FinaleDress; sentenceRef: RefObject<HTMLParagraphElement | null> }) {
  const [big, setBig] = useState<Circle | null>(null);
  const [box, setBox] = useState({ W: 390, H: 844 });
  const ref = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<SVGSVGElement>(null);

  // as large as the room between the sentence and the rocket allows
  useLayoutEffect(() => {
    const read = () => {
      const W = window.innerWidth;
      const below = sentenceRef.current?.getBoundingClientRect().bottom ?? 160;
      setBox({ W, H: window.innerHeight });
      setBig(bigPorthole({ left: 16, right: W - 16, top: below + 14, bottom: dress.top - 14 }, Math.round(W * BIG_PORTHOLE_SHARE)));
    };
    read();
  }, [dress, sentenceRef]);

  useEffect(() => {
    const el = ref.current;
    if (!big || !el) return;
    const t = portholeTimeline(LAUNCH.igniteMs);
    const now = performance.now();
    const from = (ms: number) => Math.max(0, dress.startAt + ms - now);
    const outer = big.r + BIG_RIM;
    const into = `translate(${(dress.window.x - big.x).toFixed(1)}px, ${(dress.window.y - big.y).toFixed(1)}px) scale(${((dress.window.r + 1.5) / outer).toFixed(4)})`;
    const anims = [
      el.animate([{ transform: into, opacity: 0 }, { transform: into, opacity: 1, offset: 0.12 }, { transform: 'none', opacity: 1 }], {
        delay: from(0),
        duration: DRESS.moveMs,
        easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
        fill: 'backwards',
      }),
      el.animate([{ transform: 'none', opacity: 1 }, { transform: into, opacity: 1, offset: 0.86 }, { transform: into, opacity: 0 }], {
        delay: from(t.shrinkAt),
        duration: DRESS.shrinkMs,
        easing: 'cubic-bezier(0.5, 0, 0.3, 1)',
        fill: 'forwards',
      }),
    ];
    const zoom = zoomRef.current;
    if (zoom) {
      anims.push(zoom.animate([{ opacity: 0 }, { opacity: 1 }], { delay: from(t.moveEnd - 200), duration: 300, fill: 'backwards' }));
      anims.push(zoom.animate([{ opacity: 1 }, { opacity: 0 }], { delay: from(t.shrinkAt), duration: DRESS.shrinkMs, fill: 'forwards' }));
    }
    return () => anims.forEach((a) => a.cancel());
  }, [big, dress]);

  if (!big) return null;
  const outer = big.r + BIG_RIM;
  return (
    <>
      <ZoomLinesSvg W={box.W} H={box.H} big={{ ...big, r: outer }} small={{ ...dress.window, r: dress.window.r + 2 }} light={false} svgRef={zoomRef} />
      <div ref={ref} aria-hidden="true" className="absolute" style={{ left: big.x - outer, top: big.y - outer, width: 2 * outer, height: 2 * outer }}>
        <PortholeFrame r={big.r} rim={BIG_RIM}>
          <DressSequence from={0} startAt={dress.startAt} reduced={false} />
        </PortholeFrame>
      </div>
    </>
  );
}

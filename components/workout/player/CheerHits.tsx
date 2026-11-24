'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence } from 'motion/react';
import { hitIsDue, planCheerHits, type CheerHit } from '@/lib/routine/cheers';
import type { RoutineItem } from '@/types/workout';
import { CheerBurst, loadComicFace } from './CheerBurst';

/*
 * The comic "golpes" over the video. Which series get one, when and with which word is planned
 * once per routine (planCheerHits); this layer only mounts the hit when the live clock reaches
 * its second, and only while a serie is really on screen: not paused, not under the clouds, not
 * with the list open. It covers the video and never takes a tap.
 *
 * The safe zone: the whole picture minus the "···" band at the top and the bar at the bottom on a
 * phone (a small margin on a computer, where both sit beside the video).
 */

/** Development only (/preview/player): a hit fired on demand at the current serie. */
export interface CheerDemo {
  id: number;
  hit: CheerHit;
}

const ZONE =
  'pointer-events-none absolute inset-0 overflow-hidden [container-type:size] ' +
  '[--side:max(12px,env(safe-area-inset-left),env(safe-area-inset-right))] ' +
  // "···" is 44 px tall at max(12px, safe area) from the top; the bar 86 px at the same from the bottom
  '[--top:calc(max(12px,env(safe-area-inset-top))_+_56px)] [--bottom:calc(max(12px,env(safe-area-inset-bottom))_+_98px)] ' +
  'wide:[--side:16px] wide:[--top:16px] wide:[--bottom:16px]';

// The burst: about half the width on a phone, capped on big screens, and always small enough
// to fit the zone with room to grow on its way out (x1.36).
const SIZE = {
  '--s': 'min(50cqw, 280px, calc((100cqh - var(--top) - var(--bottom)) / 1.36), calc((100cqw - 2 * var(--side)) / 1.36))',
} as CSSProperties;

export function CheerHits({
  queue,
  currentIndex,
  displayIndex,
  timeLeft,
  totalItemDuration,
  isPaused,
  hidden,
  reduced,
  demo,
}: {
  queue: RoutineItem[];
  currentIndex: number;
  displayIndex: number;
  timeLeft: number;
  totalItemDuration: number;
  isPaused: boolean;
  /** The clouds are on screen or the list is open. */
  hidden: boolean;
  reduced: boolean;
  demo?: CheerDemo;
}) {
  useEffect(() => {
    loadComicFace().catch(() => {});
  }, []);

  // A new routine ("Repetir") gets a new plan.
  const plan = useMemo(() => planCheerHits(queue, Math.random), [queue]);
  // The hit on screen (kept until it ends, even past its second) and the ones already shown.
  const [playing, setPlaying] = useState<CheerHit | null>(null);
  const [done, setDone] = useState<ReadonlySet<CheerHit>>(() => new Set());

  const pending = (hit: CheerHit | undefined) => (hit && hit.queueIndex === currentIndex && !done.has(hit) ? hit : undefined);
  const planned = plan.find((h) => h.queueIndex === currentIndex);
  const hit =
    pending(demo?.hit) ??
    pending(playing ?? undefined) ??
    (planned && hitIsDue(planned.moment, timeLeft, totalItemDuration) ? pending(planned) : undefined);

  const onSerie = queue[currentIndex]?.kind === 'workout' && displayIndex === currentIndex;
  const show = hit && onSerie && !isPaused && !hidden;

  return (
    <div aria-hidden="true" className={ZONE} style={SIZE}>
      <AnimatePresence>
        {show && (
          <CheerBurst
            key={`${hit.queueIndex}-${hit.seed}`}
            word={hit.word}
            seed={hit.seed}
            reduced={reduced}
            onStart={() => setPlaying(hit)}
            onDone={() => setDone((shown) => new Set(shown).add(hit))}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

'use client';

import { useEffect, useId, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CLOUDS } from '@/components/workout/CloudTransition';
import { playbackUrl, retryWithOriginal } from '@/lib/media';
import type { RoutineItem } from '@/types/workout';
import { ExerciseBar } from './ExerciseBar';
import { RestBar } from './RestBar';
import { SeriesList } from './SeriesList';
import { useTapGuard } from './hooks';
import { blocksOf, clock, serieState, warmupState, type StepState } from './model';
import { BAR_FILL, BAR_HOVER } from './ui';

/*
 * The one widget over the video: the bar at the bottom and, when it is tapped, the list of the
 * routine opening above it. The list closes 5 s after the last touch or scroll inside the widget,
 * when the video is tapped, or when the bar is tapped again; the bar's buttons keep working and
 * only restart those 5 s.
 *
 * On a phone it floats at the bottom of the screen, over the video. On a computer (`wide:`) it
 * sits in the column right of the video, aligned to its bottom, at a fixed width.
 */

const CLOSE_AFTER_MS = 5000;
const TAP_GUARD_MS = 700;

export function PlayerWidget({
  queue,
  currentIndex,
  displayIndex,
  timeLeft,
  totalItemDuration,
  isPaused,
  onTogglePause,
  onPrev,
  canPrev,
  onNext,
  listOpen,
  onListOpenChange,
  restCountdown,
  talkPreview,
  reduced,
}: {
  queue: RoutineItem[];
  currentIndex: number;
  displayIndex: number; // what the screen shows (it changes behind the clouds)
  timeLeft: number;
  totalItemDuration: number;
  isPaused: boolean;
  onTogglePause?: () => void;
  onPrev: () => void;
  canPrev: boolean;
  onNext: () => void;
  listOpen: boolean;
  onListOpenChange: (open: boolean) => void;
  /** The current rest shows the giant countdown on the video: the bar leaves out the time and "Luego". */
  restCountdown: boolean;
  /** The rest on screen plays its talks: the first serie of the coming block plays small at the bar's left. */
  talkPreview: boolean;
  reduced: boolean;
}) {
  const listId = useId();
  const item = queue[currentIndex];
  const resting = item?.kind === 'rest';
  // Nothing in the bar can be pressed under the clouds, nor right after the moment changed.
  const blocked = useTapGuard(currentIndex, resting && !reduced ? CLOUDS.openingMs : TAP_GUARD_MS);
  const guarded = (fn: () => void) => () => {
    if (!blocked()) fn();
  };

  // The list's 5 s: restarted by any touch, wheel or scroll inside the widget.
  const [touch, setTouch] = useState(0);
  const bump = () => setTouch((n) => n + 1);
  const open = listOpen && !resting;
  useEffect(() => {
    if (!listOpen) return;
    const t = setTimeout(() => onListOpenChange(false), CLOSE_AFTER_MS);
    return () => clearTimeout(t);
  }, [listOpen, touch, onListOpenChange]);

  if (!item || item.kind === 'outro') return null;

  const blocks = blocksOf(queue);
  const stateOf = (queueIndex: number): StepState => serieState(queueIndex, currentIndex);
  const hilo = blocks.map((block) => block.series.map((serie) => stateOf(serie.queueIndex)));

  const shown = queue[displayIndex];
  const preview = talkPreview && shown?.kind === 'rest' ? shown.nextExercise : undefined;

  return (
    <div
      onPointerDownCapture={bump}
      onWheelCapture={bump}
      onKeyDownCapture={bump}
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] z-30 flex flex-col gap-1.5 font-[family-name:var(--font-display)] text-white wide:static wide:w-[22rem]"
    >
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="list"
            initial={reduced ? { opacity: 1 } : { opacity: 0, transform: 'translateY(16px)' }}
            animate={{ opacity: 1, transform: 'translateY(0px)' }}
            exit={reduced ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, transform: 'translateY(16px)' }}
            transition={{ duration: reduced ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <SeriesList id={listId} blocks={blocks} warmup={warmupState(queue, currentIndex)} stateOf={stateOf} onScroll={bump} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative">
        {preview && (
          <video
            key={preview.id}
            src={playbackUrl(preview)}
            poster={preview.poster_url ?? undefined}
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
            onError={(e) => retryWithOriginal(e.currentTarget, preview)}
            className="pointer-events-none absolute bottom-2.5 left-2.5 z-10 h-[106px] w-[60px] rounded-[12px] bg-black object-cover ring-2 ring-white"
          />
        )}
        <div
          data-bar={resting ? undefined : ''}
          onClick={resting ? undefined : () => onListOpenChange(!listOpen)}
          className={`relative h-[86px] overflow-hidden rounded-[22px] pb-2 pr-2 pt-2.5 shadow-[0_18px_36px_-22px_rgba(0,0,0,0.9)] transition-colors duration-150 ${BAR_FILL} wide:bg-[#1d1d1d] ${resting ? '' : `cursor-pointer ${BAR_HOVER}`} ${preview ? 'pl-[82px]' : 'pl-4'}`}
        >
          {resting && item.kind === 'rest' ? (
            <RestBar
              next={restCountdown ? undefined : item.nextExercise.title}
              time={restCountdown ? undefined : clock(timeLeft)}
              fill={totalItemDuration > 0 ? (totalItemDuration - timeLeft + 1) / totalItemDuration : 1}
              reduced={reduced}
              onSkip={guarded(onNext)}
            />
          ) : (
            <ExerciseBar
              hilo={hilo}
              name={item.kind === 'warmup' ? 'Calentamiento' : item.exercise.title}
              time={clock(timeLeft)}
              listId={listId}
              listOpen={open}
              onToggleList={() => onListOpenChange(!listOpen)}
              isPaused={isPaused}
              onTogglePause={onTogglePause}
              onPrev={guarded(onPrev)}
              canPrev={canPrev}
              onNext={guarded(onNext)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

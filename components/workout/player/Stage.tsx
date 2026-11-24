'use client';

import { useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import { CLOUDS } from '@/components/workout/CloudTransition';
import { playbackUrl } from '@/lib/media';
import type { Exercise, RoutineItem } from '@/types/workout';
import { EndScreen } from './EndScreen';
import { TalkReel } from './TalkReel';
import { isExercise } from './model';

/*
 * The full-screen picture. It shows `displayIndex`, which follows the routine but changes behind
 * the clouds when a rest begins (the old clip stays under them until the screen is covered).
 *   serie / warm-up   the clip, untouched (it drives the clock)
 *   short rest        the next exercise, looping, muted
 *   long rest         its talks with sound, one after another, from when the clouds open;
 *                     then (or with no talks) like a short rest
 *   end               EndScreen
 */
export function Stage({
  queue,
  displayIndex,
  currentIndex,
  videoRef,
  onVideoTimeUpdate,
  onClipEnded,
  isPaused,
  reduced,
  onRepeat,
  onExit,
  onTap,
}: {
  queue: RoutineItem[];
  displayIndex: number;
  currentIndex: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  onVideoTimeUpdate: () => void;
  onClipEnded: () => void;
  isPaused: boolean;
  reduced: boolean;
  onRepeat?: () => void;
  onExit: () => void;
  onTap: () => void;
}) {
  const item = queue[displayIndex];
  const live = displayIndex === currentIndex;
  // talks that have finished, per rest (so a rest falls back to the looping exercise after them)
  const [talksDone, setTalksDone] = useState<number | null>(null);

  const fadeIn = reduced
    ? {}
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25, ease: 'easeOut' as const } };

  let content: React.ReactNode = null;
  if (isExercise(item)) {
    const exercise = item.exercise;
    content = (
      <motion.div key={`clip-${displayIndex}`} {...fadeIn} className="absolute inset-0">
        <video
          ref={(el) => {
            if (!el || !live) return;
            videoRef.current = el;
            return () => {
              if (videoRef.current === el) videoRef.current = null;
            };
          }}
          src={playbackUrl(exercise)}
          poster={exercise.poster_url ?? undefined}
          autoPlay
          playsInline
          muted
          onTimeUpdate={(e) => {
            // a clip that is no longer the current moment (held under the clouds) stays still
            if (!live || e.currentTarget.paused) {
              e.currentTarget.pause();
              return;
            }
            onVideoTimeUpdate();
          }}
          onLoadedMetadata={live ? onVideoTimeUpdate : undefined}
          onEnded={() => {
            if (live) onClipEnded();
          }}
          className="h-full w-full object-cover"
        />
      </motion.div>
    );
  } else if (item?.kind === 'rest') {
    const talking = item.restKind === 'long' && item.talks.length > 0 && talksDone !== displayIndex;
    content = (
      <div key={`rest-${displayIndex}`} className="absolute inset-0">
        {talking ? (
          <TalkReel
            talks={item.talks}
            // mounted once the clouds cover the screen; it speaks when they open
            delayMs={reduced ? 0 : CLOUDS.openingMs - CLOUDS.coveredMs}
            paused={isPaused}
            onFinished={() => setTalksDone(displayIndex)}
          />
        ) : (
          <LoopingExercise exercise={item.nextExercise} />
        )}
      </div>
    );
  } else if (item?.kind === 'outro') {
    content = (
      <div key="end" className="absolute inset-0">
        <EndScreen meta={item.meta} queue={queue} reduced={reduced} onRepeat={onRepeat} onExit={onExit} />
      </div>
    );
  }

  return (
    <div
      data-testid="workout-stage-916"
      onPointerDown={onTap}
      className="relative h-full w-full overflow-hidden bg-black text-white @container lg:rounded-[28px]"
    >
      {content}
    </div>
  );
}

/** The exercise that comes next, playing on a loop with no sound. */
function LoopingExercise({ exercise }: { exercise: Exercise }) {
  return (
    <video
      key={exercise.id}
      src={playbackUrl(exercise)}
      poster={exercise.poster_url ?? undefined}
      autoPlay
      loop
      muted
      playsInline
      aria-hidden="true"
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

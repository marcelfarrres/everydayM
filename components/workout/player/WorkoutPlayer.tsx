'use client';

import { useCallback, useEffect, useState, type CSSProperties, type RefObject } from 'react';
import { useReducedMotion } from 'motion/react';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { ChalkBoard } from '@/components/workout/ChalkBoard';
import { CLOUDS, CloudTransition } from '@/components/workout/CloudTransition';
import { useMusicControls, usePlayerMusic } from '@/lib/audio/useMusic';
import { playbackUrl } from '@/lib/media';
import type { RoutineItem, RoutineMeta, TimelineSegment } from '@/types/workout';
import { DesktopBackdrop } from './DesktopBackdrop';
import { PlayerMenu } from './PlayerMenu';
import { PlayerWidget } from './PlayerWidget';
import { RestFrame } from './RestFrame';
import { Stage } from './Stage';
import { useBusyAfter, useCountdownBeep, useLagged } from './hooks';
import { clock, cloudLabel, isExercise, journeyOf, nextExerciseAfter } from './model';

/*
 * The player. On a phone the video fills the screen and the UI is one small widget at the
 * bottom (PlayerWidget) plus the "···" menu at the top. During a rest a blue frame runs round
 * the screen. On a computer the same pieces sit beside the chalkboard.
 */

export interface WorkoutPlayerProps {
  queue: RoutineItem[];
  currentIndex: number;
  currentItem: RoutineItem | undefined;
  timeLeft: number;
  totalItemDuration: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  onExit: () => void;
  onNext: () => void;
  onPrev?: () => void;
  onRepeat?: () => void;
  isPaused?: boolean;
  onTogglePause?: () => void;
  meta?: RoutineMeta | null;
  timeline?: TimelineSegment[];
  totalSeconds?: number;
  onVideoTimeUpdate: () => void;
  /** Only where the Studio is on: "Crear clip" in the menu. */
  onOpenTiktok?: () => void;
}

// Desktop ring round the video: warm-up in chalk white, a serie in red, a rest in blue.
const RING = { warmup: '#f3f0e7', workout: '#ff3b30', rest: '#2f6bff' } as const;
const REST_BLUE = '#2f6bff';

export function WorkoutPlayer({
  queue,
  currentIndex,
  currentItem,
  timeLeft,
  totalItemDuration,
  videoRef,
  onExit,
  onNext,
  onPrev,
  onRepeat,
  isPaused = false,
  onTogglePause,
  meta,
  timeline = [],
  totalSeconds,
  onVideoTimeUpdate,
  onOpenTiktok,
}: WorkoutPlayerProps) {
  const reduced = Boolean(useReducedMotion());
  const [beepOn, setBeepOn] = useState(true);
  const kind = currentItem?.kind;

  // A skip stops the clip at once, so it can't tick the clock of the next moment.
  const stopClip = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current = null;
    }
  }, [videoRef]);
  const handleNext = useCallback(() => {
    stopClip();
    onNext();
  }, [onNext, stopClip]);
  const handlePrev = useCallback(() => {
    stopClip();
    onPrev?.();
  }, [onPrev, stopClip]);

  // The screen stays on while training (iPhone app and browsers with Wake Lock).
  useEffect(() => {
    KeepAwake.keepAwake().catch(() => {});
    return () => {
      KeepAwake.allowSleep().catch(() => {});
    };
  }, []);

  // Keyboard: space pauses, arrows skip.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /INPUT|TEXTAREA|SELECT|BUTTON|SUMMARY/.test(target.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePause?.();
      } else if (e.code === 'ArrowRight') handleNext();
      else if (e.code === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onTogglePause, handleNext, handlePrev]);

  useCountdownBeep(timeLeft, beepOn && !isPaused && kind !== 'outro');

  // Background music: started in the "Empezar" tap, paused with the player, stopped on exit.
  usePlayerMusic(isPaused);
  const { music, setMuted, setVolume } = useMusicControls();

  // Entering a rest, the screen changes only once the clouds cover it; anywhere else at once.
  const enteringRest = kind === 'rest' && !reduced;
  const displayIndex = useLagged(currentIndex, enteringRest ? CLOUDS.coveredMs : 0);
  const displayItem = queue[displayIndex];
  const time = clock(timeLeft);
  const boardTime = useLagged(time, enteringRest ? CLOUDS.coveredMs : 0);
  const critical = timeLeft > 0 && timeLeft <= 3 && kind !== 'outro';

  // The clouds play each time a rest begins.
  let cloudKey = currentIndex;
  while (cloudKey >= 0 && queue[cloudKey]?.kind !== 'rest') cloudKey--;

  // The list belongs to the stretch between two rests: a new rest closes it, and it can't open
  // while the clouds and the rocket are still on screen (they are drawn above the widget).
  const clouding = useBusyAfter(cloudKey, CLOUDS.clearMs, !reduced);
  const [listKey, setListKey] = useState<number | null>(null);
  const listOpen = listKey === cloudKey && !clouding;
  const setListOpen = useCallback(
    (open: boolean) => setListKey(open && !clouding ? cloudKey : null),
    [clouding, cloudKey],
  );
  const label = cloudLabel(currentItem);
  const total = totalSeconds ?? meta?.totalSeconds ?? 0;

  // Desktop: the frame round the video is the clock of the moment.
  const itemProgress = totalItemDuration > 0 ? Math.min(1, Math.max(0, (totalItemDuration - timeLeft) / totalItemDuration)) : 0;
  const frameClass = displayItem?.kind === 'rest' ? 'stage-spin' : isExercise(displayItem) ? 'stage-ring' : '';
  const ring = displayItem && displayItem.kind !== 'outro' ? RING[displayItem.kind] : RING.workout;
  const frameStyle = { '--ring': ring, '--p': itemProgress } as CSSProperties;

  // Warm up the next clip so it is ready by the time it plays. Not during a rest: the rest
  // already plays that clip (full screen or in the bar), and a phone should decode two videos
  // at most (a talk plus the bar's preview).
  const upNext = kind === 'rest' ? undefined : nextExerciseAfter(queue, currentIndex);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black font-[family-name:var(--font-display)] text-ink lg:bg-[#1c1d1b]">
      <DesktopBackdrop reduced={reduced} />

      <div className="h-full lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-16 lg:px-14 lg:pb-32 lg:pt-20 xl:gap-24 xl:px-20">
        {/* THE VIDEO */}
        <div className="relative h-full lg:min-h-0">
          <div className="relative h-full lg:aspect-[9/16] lg:rounded-[34px] lg:p-[6px] lg:shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]">
            <div
              key={frameClass === 'stage-ring' ? `ring-${displayIndex}` : frameClass}
              aria-hidden="true"
              className={`absolute inset-0 hidden rounded-[34px] lg:block ${frameClass}`}
              style={frameStyle}
            />
            <div className="relative h-full">
              <Stage
                queue={queue}
                displayIndex={displayIndex}
                currentIndex={currentIndex}
                videoRef={videoRef}
                onVideoTimeUpdate={onVideoTimeUpdate}
                onClipEnded={handleNext}
                isPaused={isPaused}
                reduced={reduced}
                onRepeat={onRepeat}
                onExit={onExit}
                onTap={() => setListOpen(false)}
              />
            </div>
          </div>
        </div>

        {/* THE BOARD (computer only) */}
        <ChalkBoard
          queue={queue}
          currentIndex={displayIndex}
          meta={meta}
          time={boardTime}
          critical={critical}
          className="relative z-10 hidden lg:flex"
        />
      </div>

      <RestFrame show={displayItem?.kind === 'rest'} reduced={reduced} />

      <PlayerMenu
        beepOn={beepOn}
        onToggleBeep={() => setBeepOn((on) => !on)}
        musicAvailable={music.available}
        musicOn={!music.muted}
        onToggleMusic={() => setMuted(!music.muted)}
        musicVolume={music.volume}
        onMusicVolume={setVolume}
        onCreateClip={onOpenTiktok}
        onExit={onExit}
      />

      <PlayerWidget
        queue={queue}
        currentIndex={currentIndex}
        displayIndex={displayIndex}
        timeLeft={timeLeft}
        totalItemDuration={totalItemDuration}
        isPaused={isPaused}
        onTogglePause={onTogglePause}
        onPrev={handlePrev}
        canPrev={Boolean(onPrev) && currentIndex > 0}
        onNext={handleNext}
        listOpen={listOpen}
        onListOpenChange={setListOpen}
        reduced={reduced}
      />

      {upNext && (
        <video
          key={upNext.id}
          src={playbackUrl(upNext)}
          preload="auto"
          muted
          playsInline
          aria-hidden="true"
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      )}
      <CloudTransition
        playKey={cloudKey}
        title={label.title}
        sub={label.sub}
        kicker="Descanso"
        color={REST_BLUE}
        journey={journeyOf(queue, timeline, currentIndex, total)}
      />
    </div>
  );
}

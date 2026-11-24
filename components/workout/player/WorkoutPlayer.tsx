'use client';

import { useCallback, useEffect, useState, type RefObject } from 'react';
import { useReducedMotion } from 'motion/react';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { CLOUDS, CloudTransition } from '@/components/workout/CloudTransition';
import { useMusicControls, usePlayerMusic } from '@/lib/audio/useMusic';
import { playbackUrl } from '@/lib/media';
import type { RoutineItem, RoutineMeta, TimelineSegment } from '@/types/workout';
import { CheerHits, type CheerDemo } from './CheerHits';
import { PlayerMenu } from './PlayerMenu';
import { PlayerWidget } from './PlayerWidget';
import { RestFrame } from './RestFrame';
import { Stage } from './Stage';
import { useBusyAfter, useCountdownBeep, useLagged, useWideLayout } from './hooks';
import { cloudLabel, journeyOf, nextExerciseAfter, restScreenOf } from './model';

/*
 * The player. On a phone the video fills the screen and the UI is one small widget at the
 * bottom (PlayerWidget) plus the "···" menu at the top. During a rest a blue frame runs round
 * the video. Now and then, during a serie, a comic "golpe" of encouragement bursts onto the
 * video (CheerHits).
 *
 * On a computer (a window with room for it, see isWideLayout) the 9:16 video takes the full
 * height of the window, centred, on a plain dark background; the same widget and "···" sit in a
 * column right beside it (widget at the bottom, menu at the top). The `wide:` variant styles it.
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
  /** Development only (/preview/player): fire a comic hit now. */
  cheerDemo?: CheerDemo;
}

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
  cheerDemo,
}: WorkoutPlayerProps) {
  const reduced = Boolean(useReducedMotion());
  const wide = useWideLayout();
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

  // The rest whose talks have finished: from then on it shows the countdown, like a short rest.
  // Kept by item, not by index: a new routine ("Repetir") has the same indexes but new rests.
  const [talksDone, setTalksDone] = useState<RoutineItem | null>(null);
  const shownRest = restScreenOf(displayItem, talksDone);
  const currentRest = restScreenOf(currentItem, talksDone);

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

  // Warm up the next clip so it is ready by the time it plays. Not during a rest: the rest
  // already plays that clip (full screen or in the bar), and a phone should decode two videos
  // at most (a talk plus the bar's preview).
  const upNext = kind === 'rest' ? undefined : nextExerciseAfter(queue, currentIndex);

  return (
    <div
      data-wide={wide ? '' : undefined}
      className="fixed inset-0 overflow-hidden bg-black font-[family-name:var(--font-display)] text-ink wide:bg-[#0c0c0c]"
    >
      <div className="h-full wide:grid wide:grid-cols-[minmax(0,1fr)_auto_minmax(24.5rem,1fr)]">
        <div aria-hidden="true" className="hidden wide:block" />

        {/* THE VIDEO: the whole screen on a phone; 9:16 at the window's full height on a computer */}
        <div className="relative h-full wide:w-[calc(100dvh*9/16)]">
          <Stage
            queue={queue}
            displayIndex={displayIndex}
            currentIndex={currentIndex}
            videoRef={videoRef}
            onVideoTimeUpdate={onVideoTimeUpdate}
            onClipEnded={handleNext}
            isPaused={isPaused}
            reduced={reduced}
            restScreen={shownRest}
            onTalksDone={setTalksDone}
            timeLeft={timeLeft}
            countdownShown={!clouding}
            onRepeat={onRepeat}
            onExit={onExit}
            onTap={() => setListOpen(false)}
          />
          <CheerHits
            queue={queue}
            currentIndex={currentIndex}
            displayIndex={displayIndex}
            timeLeft={timeLeft}
            totalItemDuration={totalItemDuration}
            isPaused={isPaused}
            hidden={clouding || listOpen}
            reduced={reduced}
            demo={cheerDemo}
          />
          <RestFrame show={displayItem?.kind === 'rest'} reduced={reduced} />
        </div>

        {/* THE CONTROLS: over the video on a phone; a column right beside it on a computer */}
        <div className="wide:flex wide:h-full wide:flex-col wide:justify-between wide:pl-6 wide:pr-4 wide:pt-4">
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
            restCountdown={currentRest === 'countdown'}
            talkPreview={shownRest === 'talks'}
            reduced={reduced}
          />
        </div>
      </div>

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

'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useReducedMotion } from 'motion/react';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { ChalkBoard } from '@/components/workout/ChalkBoard';
import { CLOUDS, CloudTransition, PERCENT_SLOT } from '@/components/workout/CloudTransition';
import { useCloudMoment, useCloudPainter } from '@/components/workout/cloudClock';
import { DOCK, FLIGHT, PARKED_AFTER_CLOUDS_MS, badgeAt, blockEnds, cloudExtraMs, cloudsFor, cloudsOpenAt, railTop } from '@/components/workout/rocketFlight';
import { stopAllSfx } from '@/lib/audio/sfx';
import { useMusicControls, usePlayerMusic } from '@/lib/audio/useMusic';
import { playbackUrl } from '@/lib/media';
import type { RoutineItem, RoutineMeta, TimelineSegment } from '@/types/workout';
import { CheerHits, type CheerDemo } from './CheerHits';
import { DesktopBackdrop } from './DesktopBackdrop';
import { PlayerMenu } from './PlayerMenu';
import { PlayerWidget } from './PlayerWidget';
import { RestClock, type RestClockPhase } from './RestClock';
import { RestFrame } from './RestFrame';
import { RocketWidget } from './RocketWidget';
import { Stage } from './Stage';
import { useBusyAfter, useCountdownBeep, useIsDesktop, useLagged } from './hooks';
import { longRestWords, clock, cloudLabel, finalCount, isExercise, journeyOf, nextExerciseAfter, restScreenOf } from './model';
import { FinalCount, RestingLabel } from './RestCues';
import { layoutSpot } from './ui';

/*
 * The player. On a phone the video fills the screen and the UI is one small widget at the
 * bottom, the rocket (RocketWidget), plus the "Â·Â·Â·" menu at the top right and, quietly at the top
 * left, how much of the routine is done. During a rest a blue frame runs round
 * the screen. Now and then, during a serie, a comic "golpe" of encouragement bursts onto the
 * video (CheerHits). On a computer the same pieces sit on the chalkboard: the video centred and
 * as tall as the bar below it allows, the board written on both sides of it, and the bar
 * (PlayerWidget) under it.
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

// Desktop ring round the video: warm-up in chalk white, a serie in red, a rest in blue.
const RING = { warmup: '#f3f0e7', workout: '#ff3b30', rest: '#2f6bff' } as const;
const REST_BLUE = '#2f6bff';
// Desktop: the bulb hangs over the middle of the board's right side (the clock). The video is
// 9:16 at the window's height minus the grid's pt-7 and pb-32 (156 px), centred.
const BULB_X = 'calc(75% + (100dvh - 156px) * 9 / 64)';

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
  const desktop = useIsDesktop();
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

  // Leaving the player: no effect goes on sounding.
  useEffect(() => stopAllSfx, []);

  // Background music: started in the "Empezar" tap, paused with the player, stopped on exit.
  usePlayerMusic(isPaused);
  const { music, setMuted, setVolume } = useMusicControls();

  // Entering a rest, the screen changes only once the clouds cover it; on a phone the end screen
  // waits for the rocket's last takeoff; anywhere else at once.
  const enteringRest = kind === 'rest' && !reduced;
  const lastTakeoff = kind === 'outro' && !reduced && !desktop;
  const displayIndex = useLagged(currentIndex, enteringRest ? CLOUDS.coveredMs : lastTakeoff ? FLIGHT.takeoffMs : 0);
  const displayItem = queue[displayIndex];

  // The rest whose talks have finished: from then on it shows the countdown, like a short rest.
  // Kept by item, not by index: a new routine ("Repetir") has the same indexes but new rests.
  const [talksDone, setTalksDone] = useState<RoutineItem | null>(null);
  // (phone, a long rest: the rest video once its talks are done, or with none)
  const shownRest = restScreenOf(displayItem, talksDone, !desktop);
  const currentRest = restScreenOf(currentItem, talksDone, !desktop);

  // The clouds play each time a rest begins.
  let cloudKey = currentIndex;
  while (cloudKey >= 0 && queue[cloudKey]?.kind !== 'rest') cloudKey--;

  // The list belongs to the stretch between two rests: a new rest closes it, and it can't open
  // while the clouds and the rocket are still on screen (they are drawn above the widget).
  // (after a block they stay closed longer: BLOCK_END)
  const cloudRest = queue[cloudKey];
  const extra = cloudExtraMs(cloudRest);
  const clouds = cloudsFor(extra);
  const clouding = useBusyAfter(cloudKey, clouds.clearMs, !reduced);
  // Phone: the rest's countdown stands in the clouds until they start to open (RestClock). Read
  // from the clouds' own clock once it runs for this rest (the words have gone by then: wordsAt);
  // until then (the very first frames of the rest) from the moment the rest began.
  const cloudsStarting = useBusyAfter(cloudKey, clouds.openingMs, !reduced);
  const cloudsClosed = useCloudMoment((m) => (m.key === cloudKey ? m.t !== null && m.t < cloudsOpenAt(extra) : null));
  const inClouds = !reduced && (cloudsClosed ?? cloudsStarting);
  // With talks it stands in the rocket's first panel while they play (it fades out as the clouds
  // open and comes back as the panels slide out); then the middle.
  const bannerPending = useBusyAfter(cloudKey, PARKED_AFTER_CLOUDS_MS + extra + DOCK.outAtMs, !reduced);
  const clockPhase: RestClockPhase = inClouds ? 'clouds' : currentRest === 'countdown' ? 'center' : bannerPending ? 'hidden' : 'side';
  const [listKey, setListKey] = useState<number | null>(null);
  const listOpen = listKey === cloudKey && !clouding;
  const setListOpen = useCallback(
    (open: boolean) => setListKey(open && !clouding ? cloudKey : null),
    [clouding, cloudKey],
  );

  // The board's clock: the rest's time appears behind the clouds; once they have gone it keeps
  // step with the giant countdown on the video (a lag all rest long would leave it a second behind).
  const time = clock(timeLeft);
  const boardTime = useLagged(time, enteringRest && clouding ? CLOUDS.coveredMs : 0);
  const critical = timeLeft > 0 && timeLeft <= 3 && kind !== 'outro';
  const label = cloudLabel(currentItem);
  const total = totalSeconds ?? meta?.totalSeconds ?? 0;

  // Phone: how much of the routine is done, by time.
  const segment = timeline[currentIndex];
  const elapsed = segment ? segment.start + Math.min(segment.duration, Math.max(0, totalItemDuration - timeLeft)) : 0;
  const percent = kind === 'outro' ? 100 : total > 0 ? Math.min(100, Math.floor((elapsed / total) * 100)) : 0;

  // Desktop: the frame round the video is the clock of the moment.
  const itemProgress = totalItemDuration > 0 ? Math.min(1, Math.max(0, (totalItemDuration - timeLeft) / totalItemDuration)) : 0;
  const frameClass = displayItem?.kind === 'rest' ? 'stage-spin' : isExercise(displayItem) ? 'stage-ring' : '';
  const ring = displayItem && displayItem.kind !== 'outro' ? RING[displayItem.kind] : RING.workout;
  const frameStyle = { '--ring': ring, '--p': itemProgress } as CSSProperties;

  // Warm up the next clip so it is ready by the time it plays. Not during a rest: the rest
  // already plays that clip (full screen or in the bar), and a phone should decode two videos
  // at most (a talk plus the bar's preview).
  const upNext = kind === 'rest' ? undefined : nextExerciseAfter(queue, currentIndex);

  // Where the routine is, for the clouds (and, on a phone, where the rocket stands in them).
  const journey = journeyOf(queue, timeline, currentIndex, total);
  const cloudTop = railTop(journey?.progress ?? 0.5);

  // After a block: three sentences on the clouds, and on a phone the % badge travels into the second.
  const travels = blockEnds(cloudRest) && !desktop && !reduced;
  const blockEnd =
    // (the computer keeps its clouds as they were after the warm-up)
    cloudRest?.kind === 'rest' && blockEnds(cloudRest) && (cloudRest.isEndOfRound || !desktop)
      ? { ...longRestWords(cloudRest), percent, slot: travels }
      : undefined;
  const percentEl = useRef<HTMLParagraphElement>(null);
  // (its way into its sentence, from the clouds' clock: paintPercent)
  const paintBadge = useCallback((t: number | null) => paintPercent(percentEl.current, travels, t), [travels]);
  useCloudPainter(paintBadge);

  return (
    <div className="group/player fixed inset-0 overflow-hidden bg-black font-[family-name:var(--font-display)] text-ink lg:bg-[#1c1d1b]">
      <DesktopBackdrop reduced={reduced} bulbX={BULB_X} />

      {/* Computer: the video in the middle column, as tall as the bar below it allows; the board
          is written on both sides of it (the routine on the left, the clock on the right). */}
      <div className="h-full lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-16 lg:px-14 lg:pb-32 lg:pt-7 xl:px-20 2xl:gap-24">
        {/* THE VIDEO */}
        <div className="relative h-full lg:col-start-2 lg:row-start-1 lg:min-h-0">
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
                restScreen={shownRest}
                onTalksDone={setTalksDone}
                timeLeft={timeLeft}
                // (on a phone the countdown is RestClock, from the clouds on: the stage keeps only its veil)
                countdownShown={desktop && !clouding}
                onRepeat={onRepeat}
                onExit={onExit}
                onTap={() => setListOpen(false)}
                phone={!desktop}
                miniNext={shownRest === 'talks' || shownRest === 'resting'}
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
          </div>
        </div>

        {/* THE BOARD (computer only) */}
        <ChalkBoard
          queue={queue}
          currentIndex={displayIndex}
          meta={meta}
          time={boardTime}
          critical={critical}
          className="hidden lg:contents"
        />
      </div>

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

      {/* Phone: how far you are. The twin of "Â·Â·Â·" across the top: the same 44 px pill, fill,
          margins and line, so the two read as a pair. It steps aside for "Activar sonido" of a talk. */}
      {displayItem?.kind !== 'outro' && (
        <p
          ref={percentEl}
          data-rw="percent"
          aria-label={`${percent} % de la rutina`}
          className="pointer-events-none fixed left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-40 flex h-11 min-w-11 items-center justify-center rounded-full bg-[rgb(14_14_14/0.6)] px-3 text-[14px] font-semibold leading-none tabular-nums text-white group-has-[[data-unmute]]/player:invisible lg:hidden"
        >
          {percent}&#8239;%
        </p>
      )}

      {desktop ? (
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
      ) : (
        <RocketWidget
          queue={queue}
          currentIndex={currentIndex}
          displayIndex={displayIndex}
          cloudKey={cloudKey}
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
          clockTab={currentRest === 'talks' || currentRest === 'resting'}
          cloudTop={cloudTop}
          reduced={reduced}
        />
      )}

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
      {/* Phone: "Descansando…" at the top of every rest once the clouds open (not while a talk speaks),
          and the big 3, 2, 1 over the stage at the end of a long rest */}
      {!desktop && (
        <>
          <RestingLabel show={displayItem?.kind === 'rest' && !inClouds && shownRest !== 'talks'} reduced={reduced} />
          <FinalCount value={displayIndex === currentIndex ? finalCount(currentRest, timeLeft) : null} reduced={reduced} />
        </>
      )}
      {!desktop && kind === 'rest' && (
        <RestClock
          key={cloudKey}
          seconds={timeLeft}
          phase={clockPhase}
          cloudTop={cloudTop}
          reduced={reduced}
          next={currentItem?.kind === 'rest' ? currentItem.nextExercise.title : undefined}
        />
      )}
      <CloudTransition
        playKey={cloudKey}
        title={label.title}
        sub={label.sub}
        kicker="Descanso"
        extraMs={extra}
        blockEnd={blockEnd}
        color={REST_BLUE}
        journey={journey}
        phone={!desktop}
      />
    </div>
  );
}

/**
 * The rest after a block (phone): the % badge of the corner goes into the hole left for it in
 * "Llevas el … completado." (the same element, grown), stands there, and is out of the column
 * before the third sentence comes in. Where it is is a pure function of the clouds' clock
 * (badgeAt), painted in the same frame as the sentences (CloudTransition), so it can't be late or
 * early for them: home / down the left edge / across into the hole, which starts its own line /
 * landed / back out to the left edge / up to its corner. Over the clouds while it is out.
 */
const easeInOut = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

function paintPercent(el: HTMLElement | null, on: boolean, t: number | null) {
  if (!el) return;
  const { leg, p } = on && t !== null ? badgeAt(t) : { leg: 'home' as const, p: 0 };
  const slot = leg === 'home' ? null : document.querySelector<HTMLElement>('[data-cloud-slot]');
  if (!slot) {
    if (el.style.transform) {
      el.style.transform = '';
      el.style.zIndex = '';
    }
    return;
  }
  // by layout, without transforms: its corner (a fixed element: offsets from the screen) and the hole
  const hole = layoutSpot(slot);
  const k = (slot.offsetHeight - 2 * PERCENT_SLOT.clear) / el.offsetHeight;
  const dx = hole.x + (slot.offsetWidth - el.offsetWidth * k) / 2 - el.offsetLeft;
  const dy = hole.y + PERCENT_SLOT.clear - el.offsetTop;
  const e = easeInOut(p);
  const [x, y, s] =
    leg === 'down' ? [0, dy * e, 1]
    : leg === 'across' ? [dx * e, dy, 1 + (k - 1) * e]
    : leg === 'landed' ? [dx, dy, k]
    : leg === 'back' ? [dx * (1 - e), dy, k + (1 - k) * e]
    : [0, dy * (1 - e), 1];
  el.style.transformOrigin = '0 0';
  el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
  el.style.zIndex = '70';
}

'use client';

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import { widgetLayout } from '@/components/workout/rocketShape';
import { CLOUDS } from '@/components/workout/CloudTransition';
import { POD, PREVIEW_OUT_AFTER_REST_MS, podPopKeyframes } from '@/components/workout/rocketFlight';
import { playbackUrl, retryWithOriginal } from '@/lib/media';
import type { Exercise, RoutineItem } from '@/types/workout';
import { EndScreen } from './EndScreen';
import { RestCountdown } from './RestCountdown';
import { TalkReel } from './TalkReel';
import { useRocketWidth, useWindowHeight } from './hooks';
import { MINI, growKeyframes, miniPose, miniRect } from './miniHandoff';
import { isExercise, type RestScreen } from './model';

/*
 * The full-screen picture. It shows `displayIndex`, which follows the routine but changes behind
 * the clouds when a rest begins (the old clip stays under them until the screen is covered).
 *   serie / warm-up   the clip, untouched (it drives the clock)
 *   short rest        the next exercise, looping, muted, behind a dark veil with the giant
 *                     countdown (RestCountdown)
 *   long rest         its talks with sound, one after another, from when the clouds open;
 *                     then (or with no talks) like a short rest
 *   end               EndScreen
 * Which of the two a rest shows (`restScreen`) is decided by the player, so the bar agrees.
 *
 * Phone, a long rest with talks: the next exercise plays in a small window above the rocket's
 * banner. It is already that exercise's own <video>: when the rest ends the same element grows
 * to the whole screen (transforms only, see miniHandoff) and goes on as the clip, while the talk
 * fades out under it (silent). Two videos at most: the talk and that one.
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
  restScreen,
  onTalksDone,
  timeLeft,
  countdownShown,
  onRepeat,
  onExit,
  onTap,
  phone = false,
  miniNext = false,
}: {
  queue: RoutineItem[];
  displayIndex: number;
  currentIndex: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  onVideoTimeUpdate: () => void;
  onClipEnded: () => void;
  isPaused: boolean;
  reduced: boolean;
  restScreen: RestScreen | null; // what the rest on screen shows (null: not a rest)
  onTalksDone: (rest: RoutineItem) => void;
  timeLeft: number;
  countdownShown: boolean; // false while the clouds are on screen
  onRepeat?: () => void;
  onExit: () => void;
  onTap: () => void;
  /** phone: the small window of the next exercise during a long rest's talks, which then fills the screen */
  phone?: boolean;
  miniNext?: boolean;
}) {
  const item = queue[displayIndex];
  const live = displayIndex === currentIndex;

  const fadeIn = reduced
    ? {}
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25, ease: 'easeOut' as const } };

  // The window of the next exercise (phone, a long rest's talks)...
  const next = queue[displayIndex + 1];
  const windowed = phone && item?.kind === 'rest' && restScreen === 'talks' && miniNext && isExercise(next);
  // ...and, when that rest gives way to its exercise, the rest that fades out under it for a moment.
  const [seen, setSeen] = useState({ index: displayIndex, windowed });
  const [fading, setFading] = useState<number | null>(null);
  if (seen.index !== displayIndex || seen.windowed !== windowed) {
    setSeen({ index: displayIndex, windowed });
    if (seen.index !== displayIndex) {
      setFading(seen.windowed && displayIndex === seen.index + 1 && isExercise(item) && !reduced ? seen.index : null);
    }
  }
  useEffect(() => {
    if (fading === null) return;
    const t = setTimeout(() => setFading(null), MINI.GROW_MS + 60);
    return () => clearTimeout(t);
  }, [fading]);

  /** One exercise's clip: the whole screen (it drives the clock when live) or the window (`small`). */
  const clip = (index: number, exercise: Exercise, small: boolean, isLive: boolean) => (
    <ClipLayer
      key={`clip-${index}`}
      small={small}
      reduced={reduced}
      fadeIn={phone}
      // the window springs out of the rocket just after its banner (it mounts as the clouds cover the screen)
      popInMs={small ? Math.max(0, PREVIEW_OUT_AFTER_REST_MS - CLOUDS.coveredMs) : null}
      // in its last moment it waits on its first frame, so growing into the exercise doesn't jump
      hold={small && live && timeLeft <= MINI.HOLD_S}
    >
      <video
        ref={(el) => {
          if (!el || !isLive) return;
          videoRef.current = el;
          return () => {
            if (videoRef.current === el) videoRef.current = null;
          };
        }}
        src={playbackUrl(exercise)}
        poster={exercise.poster_url ?? undefined}
        autoPlay
        loop={small}
        playsInline
        muted
        onTimeUpdate={(e) => {
          if (small) return; // the window just loops
          // a clip that is no longer the current moment (held under the clouds) stays still
          if (!isLive || e.currentTarget.paused) {
            e.currentTarget.pause();
            return;
          }
          onVideoTimeUpdate();
        }}
        onLoadedMetadata={isLive ? onVideoTimeUpdate : undefined}
        onEnded={() => {
          if (isLive && !small) onClipEnded();
        }}
        // A clip that can't load would stop the clock (it follows the video): try the original,
        // and if that fails too, go on to what comes next.
        onError={(e) => {
          if (!retryWithOriginal(e.currentTarget, exercise) && isLive && !small) onClipEnded();
        }}
        className="h-full w-full object-cover"
      />
    </ClipLayer>
  );

  /** A rest's picture; `leaving`: it has just ended under the growing window, and fades out silent. */
  const restLayer = (index: number, rest: Extract<RoutineItem, { kind: 'rest' }>, leaving: boolean) => (
    <div
      key={`rest-${index}`}
      className="absolute inset-0"
      style={leaving ? { opacity: 0, transition: `opacity ${MINI.GROW_MS}ms ease-out` } : undefined}
    >
      {restScreen === 'talks' || leaving ? (
        <TalkReel
          talks={rest.talks}
          // mounted once the clouds cover the screen; it speaks when they open
          delayMs={reduced ? 0 : CLOUDS.openingMs - CLOUDS.coveredMs}
          paused={isPaused || leaving}
          onFinished={() => {
            if (!leaving) onTalksDone(rest);
          }}
        />
      ) : (
        <>
          <LoopingExercise exercise={rest.nextExercise} />
          <RestCountdown
            seconds={live ? timeLeft : 0}
            next={rest.nextExercise.title}
            show={countdownShown && live}
            reduced={reduced}
          />
        </>
      )}
    </div>
  );

  let content: React.ReactNode = null;
  if (isExercise(item)) {
    const faded = fading !== null ? queue[fading] : undefined;
    content = phone ? (
      [faded?.kind === 'rest' && restLayer(fading as number, faded, true), clip(displayIndex, item.exercise, false, live)]
    ) : (
      <motion.div key={`clip-${displayIndex}`} {...fadeIn} className="absolute inset-0">
        {clip(displayIndex, item.exercise, false, live)}
      </motion.div>
    );
  } else if (item?.kind === 'rest') {
    content = [restLayer(displayIndex, item, false), windowed && isExercise(next) && clip(displayIndex + 1, next.exercise, true, false)];
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
      onError={(e) => retryWithOriginal(e.currentTarget, exercise)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

/**
 * One exercise's picture: the whole screen, or (`small`) the window of the next exercise above
 * the banner. From small to whole it grows: the same element and video, nothing reloads.
 */
function ClipLayer({
  small,
  reduced,
  fadeIn,
  popInMs,
  hold,
  children,
}: {
  small: boolean;
  reduced: boolean;
  fadeIn: boolean;
  /** the window: ms until it springs out (from behind the banner, like the banner from the rocket) */
  popInMs: number | null;
  /** the window: wait on the first frame */
  hold: boolean;
  children: React.ReactNode;
}) {
  const pop = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const width = useRocketWidth();
  const vh = useWindowHeight();
  const vw = width + 12;
  const rect = miniRect(vw, vh, widgetLayout(width));
  const pose = small ? miniPose(rect, vw, vh, 0) : null;
  const was = useRef<boolean | null>(null);

  useLayoutEffect(() => {
    const before = was.current;
    was.current = small;
    const o = outer.current;
    const i = inner.current;
    if (!o || !i || !pop.current) return;
    // A new clip on the whole screen fades in (as the stage always did); the window springs out
    // after the banner. (Not cancelled on cleanup: React's dev double mount would lose them.)
    if (before === null) {
      if (!fadeIn) return;
      if (small && popInMs !== null && !reduced) {
        pop.current.animate(podPopKeyframes(), { duration: POD.inMs, delay: popInMs, fill: 'backwards' });
      } else if (!reduced) {
        o.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
      }
      return;
    }
    if (!(before && !small)) return;
    // the window becomes the exercise: it starts now, from its first frame, and runs once
    const video = o.querySelector('video');
    if (video) {
      video.loop = false;
      video.currentTime = 0;
      void video.play().catch(() => {});
    }
    if (reduced) {
      const fade = o.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200 });
      return () => fade.cancel();
    }
    const keys = growKeyframes(rect, vw, vh);
    const a = o.animate(
      keys.map((k) => ({ offset: k.offset, transform: k.outer, borderRadius: k.radius })),
      { duration: MINI.GROW_MS, easing: 'linear' },
    );
    const b = i.animate(
      keys.map((k) => ({ offset: k.offset, transform: k.inner })),
      { duration: MINI.GROW_MS, easing: 'linear' },
    );
    return () => {
      a.cancel();
      b.cancel();
    };
    // (only when it appears, and when it goes from the window to the whole screen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [small]);

  useEffect(() => {
    const video = outer.current?.querySelector('video');
    if (!small || !hold || !video) return;
    video.pause();
    video.currentTime = 0;
  }, [small, hold]);

  return (
    <div ref={pop} className={`absolute inset-0 ${small ? 'z-[1]' : ''}`} style={{ transformOrigin: `${rect.left + rect.width / 2}px ${rect.top + rect.height}px` }}>
      <div
        ref={outer}
        className="absolute inset-0 overflow-hidden"
        style={{ transformOrigin: '0 0', transform: pose?.outer ?? 'none', borderRadius: pose?.radius ?? 0 }}
      >
        <div ref={inner} className="absolute inset-0" style={{ transform: pose?.inner ?? 'none' }}>
          {children}
        </div>
      </div>
      {/* the window's frame (apart, so the window's own scaling doesn't thin it) */}
      {small && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute rounded-[12px] ring-2 ring-white"
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
        />
      )}
    </div>
  );
}

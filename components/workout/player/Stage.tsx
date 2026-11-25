'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import { BANNER, widgetLayout, type Stack } from '@/components/workout/rocketShape';
import { rocketStack } from '@/components/workout/rocketStack';
import { CLOUDS } from '@/components/workout/CloudTransition';
import { POD, PREVIEW_OUT_AFTER_REST_MS, cloudExtraMs, podPopKeyframes } from '@/components/workout/rocketFlight';
import { playbackUrl, retryWithOriginal } from '@/lib/media';
import type { Exercise, RoutineItem } from '@/types/workout';
import { EndScreen } from './EndScreen';
import { RestCountdown } from './RestCountdown';
import { TalkReel } from './TalkReel';
import { useRocketWidth, useWindowHeight } from './hooks';
import { MINI, growKeyframes, handoffTimes, miniMast, miniPose, miniRect, swollenRect } from './miniHandoff';
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
 * banner, on its own mast out of the rocket's body. It is already that exercise's own <video>: in
 * the last seconds it swells a little and waits; when the rest ends the talk fades to black and
 * then the same element grows to the whole screen (transforms only, see miniHandoff) and goes on
 * as the clip. Two videos at most: the talk and that one.
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
  // (the rocket the window's mast comes out of: what is left of it, as the widget draws it)
  const stack = useMemo(() => rocketStack(queue, displayIndex), [queue, displayIndex]);

  const fadeIn = reduced
    ? {}
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25, ease: 'easeOut' as const } };

  // The window of the next exercise (phone, a long rest's talks)...
  const next = queue[displayIndex + 1];
  const windowed = phone && item?.kind === 'rest' && restScreen === 'talks' && miniNext && isExercise(next);
  // ...and, when that rest gives way to its exercise, the rest that fades out under it for a moment.
  // (in its last seconds the window swells a little and waits)
  const swell = windowed && live && timeLeft <= MINI.SWELL_S && !reduced;
  const [seen, setSeen] = useState({ index: displayIndex, windowed, swell });
  const [fading, setFading] = useState<{ index: number; fade: number; total: number } | null>(null);
  if (seen.index !== displayIndex || seen.windowed !== windowed || seen.swell !== swell) {
    setSeen({ index: displayIndex, windowed, swell });
    if (seen.index !== displayIndex) {
      // the talk fades to black, longer after the swell than after "Saltar"; then the window grows
      const times = handoffTimes(seen.swell);
      setFading(seen.windowed && displayIndex === seen.index + 1 && isExercise(item) && !reduced ? { index: seen.index, ...times } : null);
    }
  }
  useEffect(() => {
    if (fading === null) return;
    const t = setTimeout(() => setFading(null), fading.total + 60);
    return () => clearTimeout(t);
  }, [fading]);

  /** One exercise's clip: the whole screen (it drives the clock when live) or the window (`small`). */
  const clip = (index: number, exercise: Exercise, small: boolean, isLive: boolean) => (
    <ClipLayer
      key={`clip-${index}`}
      small={small}
      swell={small && swell}
      growAfterMs={fading?.fade ?? 0}
      stack={stack}
      reduced={reduced}
      fadeIn={phone}
      // the window springs out of the rocket just after its banner (it mounts as the clouds cover the screen)
      popInMs={small ? Math.max(0, PREVIEW_OUT_AFTER_REST_MS + cloudExtraMs(item) - CLOUDS.coveredMs) : null}
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
      // (fading to black: the stage is black under it)
      style={leaving ? { opacity: 0, transition: `opacity ${fading?.fade ?? MINI.FADE_MS}ms ease-in-out` } : undefined}
    >
      {restScreen === 'talks' || leaving ? (
        <TalkReel
          talks={rest.talks}
          // mounted once the clouds cover the screen; it speaks when they open
          delayMs={reduced ? 0 : CLOUDS.openingMs + cloudExtraMs(rest) - CLOUDS.coveredMs}
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
    const faded = fading !== null ? queue[fading.index] : undefined;
    content = phone ? (
      [faded?.kind === 'rest' && restLayer(fading?.index ?? -1, faded, true), clip(displayIndex, item.exercise, false, live)]
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
  swell,
  growAfterMs,
  stack,
  reduced,
  fadeIn,
  popInMs,
  hold,
  children,
}: {
  small: boolean;
  /** the window: swollen a little (the talk's last seconds) */
  swell: boolean;
  /** from the window to the whole screen: it waits this long first (the talk fading to black) */
  growAfterMs: number;
  /** the rocket below (where the window's mast comes out) */
  stack: Stack;
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
  const mastEl = useRef<HTMLDivElement>(null);
  const width = useRocketWidth();
  const vh = useWindowHeight();
  const vw = width + 12;
  // (the window stays where it stood, over the rocket it stood on, as it grows)
  const [held, setHeld] = useState<Stack>(stack);
  if (small && held !== stack) setHeld(stack);
  const L = useMemo(() => widgetLayout(width, held), [width, held]);
  const rect = miniRect(vw, vh, L);
  const mast = miniMast(vw, vh, L);
  const pose = small ? miniPose(swell ? swollenRect(rect) : rect, vw, vh, 0) : null;
  const was = useRef<boolean | null>(null);
  // (whether it was swollen as it stopped being the window)
  const swollen = useRef(false);
  const ring = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (small) swollen.current = swell;
  });

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
    // the window becomes the exercise: once the talk has faded to black it fills the screen, and
    // the clip starts from its first frame and runs once
    const wait = reduced ? 0 : growAfterMs;
    const video = o.querySelector('video');
    if (video) {
      video.loop = false;
      video.pause();
      video.currentTime = 0;
    }
    const go = setTimeout(() => void video?.play().catch(() => {}), wait);
    if (reduced) {
      const fade = o.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200 });
      return () => {
        clearTimeout(go);
        fade.cancel();
      };
    }
    const from = swollen.current ? swollenRect(rect) : rect;
    const keys = growKeyframes(from, vw, vh);
    const timing: KeyframeAnimationOptions = { duration: MINI.GROW_MS, delay: wait, easing: 'linear', fill: 'backwards' };
    const a = o.animate(keys.map((k) => ({ offset: k.offset, transform: k.outer, borderRadius: k.radius })), timing);
    const b = i.animate(keys.map((k) => ({ offset: k.offset, transform: k.inner })), timing);
    // its mast and frame stay while the talk fades, and go as it grows
    const stay = wait / (wait + 120);
    const scale = swollen.current ? `scale(${MINI.SWELL})` : 'none';
    const m = mastEl.current?.animate([{ opacity: 1 }, { opacity: 1, offset: stay }, { opacity: 0 }], { duration: wait + 120 });
    const f = ring.current?.animate(
      [
        { opacity: 1, transform: scale },
        { opacity: 1, transform: scale, offset: stay },
        { opacity: 0, transform: scale },
      ],
      { duration: wait + 120 },
    );
    return () => {
      clearTimeout(go);
      a.cancel();
      b.cancel();
      m?.cancel();
      f?.cancel();
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
    // (the window and its mast spring out of the rocket's body, like its banner)
    <div ref={pop} className={`absolute inset-0 ${small ? 'z-[1]' : ''}`} style={{ transformOrigin: `${mast.x}px ${mast.bottom}px` }}>
      {/* the mast: from the window's bottom down into the rocket (behind it) */}
      <div
        ref={mastEl}
        aria-hidden="true"
        className="pointer-events-none absolute border-x-2 border-ink bg-white"
        style={{
          left: mast.x - BANNER.MAST_W / 2,
          top: mast.top - 2,
          width: BANNER.MAST_W,
          height: mast.bottom - mast.top + 2,
          transformOrigin: '50% 100%',
          opacity: small ? 1 : 0,
        }}
      />
      <div
        ref={outer}
        className="absolute inset-0 overflow-hidden"
        style={{
          transformOrigin: '0 0',
          transform: pose?.outer ?? 'none',
          borderRadius: pose?.radius ?? 0,
          // (the swell: slow and calm)
          transition: small && !reduced ? `transform ${MINI.SWELL_MS}ms ease-in-out, border-radius ${MINI.SWELL_MS}ms ease-in-out` : 'none',
        }}
      >
        <div ref={inner} className="absolute inset-0" style={{ transform: pose?.inner ?? 'none' }}>
          {children}
        </div>
      </div>
      {/* the window's frame (apart, so the window's own scaling doesn't thin it) */}
      <div
        ref={ring}
        aria-hidden="true"
        className="pointer-events-none absolute rounded-[12px] ring-2 ring-white"
        style={{
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          opacity: small ? 1 : 0,
          transformOrigin: '50% 100%',
          transform: small && swell ? `scale(${MINI.SWELL})` : 'none',
          transition: small && !reduced ? `transform ${MINI.SWELL_MS}ms ease-in-out` : 'none',
        }}
      />
    </div>
  );
}

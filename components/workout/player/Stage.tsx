'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { motion } from 'motion/react';
import { widgetLayout, type Stack } from '@/components/workout/rocketShape';
import { rocketStack } from '@/components/workout/rocketStack';
import { CLOUDS } from '@/components/workout/CloudTransition';
import { PREVIEW, PREVIEW_OUT_AFTER_REST_MS, cloudExtraMs } from '@/components/workout/rocketFlight';
import { playbackUrl, retryWithOriginal } from '@/lib/media';
import { restClipOf } from '@/lib/routine/restClips';
import type { Exercise, RestClip, RoutineItem } from '@/types/workout';
import { EndScreen } from './EndScreen';
import { PhoneEndScreen } from './PhoneEndScreen';
import { RestCountdown } from './RestCountdown';
import { TalkReel } from './TalkReel';
import { useRocketWidth, useWindowHeight } from './hooks';
import { MINI, growKeyframes, handoffTimes, miniClipY, miniOutKeyframes, miniPose, miniRect, swollenRect } from './miniHandoff';
import { usePanelRise } from './panelRise';
import { isExercise, type RestScreen } from './model';

/*
 * The full-screen picture. It shows `displayIndex`, which follows the routine but changes behind
 * the clouds when a rest begins (the old clip stays under them until the screen is covered).
 *   serie / warm-up   the clip, untouched (it drives the clock)
 *   short rest        the next exercise, looping, muted, behind a dark veil with the giant
 *                     countdown (RestCountdown)
 *   long rest         its talks with sound, one after another, from when the clouds open;
 *                     then (or with no talks) on a phone the rest video (Marcel resting, looped,
 *                     muted: RestLoop), on a computer like a short rest
 *   end               EndScreen (computer), PhoneEndScreen (phone)
 * Which of the two a rest shows (`restScreen`) is decided by the player, so the bar agrees.
 *
 * Phone, a long rest (talks or the rest video): the next exercise plays in a small window over the rocket's
 * first panel, slid up out of the rocket like its panels. It is already that exercise's own <video>: in
 * the last seconds it swells a little and waits; when the rest ends the talk fades to black and
 * then the same element grows to the whole screen (transforms only, see miniHandoff) and goes on
 * as the clip. Two videos at most: the talk (or the rest video) and that one.
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

  // The window of the next exercise (phone, a long rest: its talks or the rest video)...
  const next = queue[displayIndex + 1];
  const windowed = phone && item?.kind === 'rest' && (restScreen === 'talks' || restScreen === 'resting') && miniNext && isExercise(next);
  // ...and, when that rest gives way to its exercise, the rest that fades out under it for a moment.
  // (in its last seconds the window swells a little and waits)
  const swell = windowed && live && timeLeft <= MINI.SWELL_S && !reduced;
  const [seen, setSeen] = useState({ index: displayIndex, windowed, swell, screen: restScreen });
  // (`talk`: what fades out is a talk; otherwise the rest video)
  const [fading, setFading] = useState<{ index: number; fade: number; total: number; talk: boolean } | null>(null);
  if (seen.index !== displayIndex || seen.windowed !== windowed || seen.swell !== swell || seen.screen !== restScreen) {
    setSeen({ index: displayIndex, windowed, swell, screen: restScreen });
    if (seen.index !== displayIndex) {
      // the rest fades to black, longer after the swell than after "Saltar"; then the window grows
      const times = handoffTimes(seen.swell);
      setFading(
        seen.windowed && displayIndex === seen.index + 1 && isExercise(item) && !reduced ? { index: seen.index, ...times, talk: seen.screen === 'talks' } : null,
      );
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
      // the window slides out of the rocket just after its panels (it mounts as the clouds cover the screen)
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
      {/* (leaving: whichever it was, a talk or the rest video) */}
      {(leaving ? !fading?.talk : restScreen === 'resting') ? (
        <RestLoop clip={restClipOf(queue, rest)} paused={isPaused || leaving} />
      ) : restScreen === 'talks' || leaving ? (
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
    // (a phone celebrates: the drums, the list crossed off, the rocket put back together)
    content = (
      <div key="end" className="absolute inset-0">
        {phone ? (
          <PhoneEndScreen meta={item.meta} queue={queue} reduced={reduced} onRepeat={onRepeat} onExit={onExit} />
        ) : (
          <EndScreen meta={item.meta} queue={queue} reduced={reduced} onRepeat={onRepeat} onExit={onExit} />
        )}
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

/**
 * Phone, a long rest with no talk speaking: the rest video (Marcel resting on camera), full screen,
 * looping, muted, paused with the routine.
 */
function RestLoop({ clip, paused }: { clip: RestClip; paused: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (paused) el.pause();
    else el.play().catch(() => {});
  }, [paused]);
  return (
    <video
      ref={ref}
      key={clip.id}
      data-rw="rest-video"
      src={playbackUrl(clip)}
      poster={clip.poster_url ?? undefined}
      autoPlay={!paused}
      loop
      muted
      playsInline
      aria-hidden="true"
      onError={(e) => retryWithOriginal(e.currentTarget, clip)}
      className="absolute inset-0 h-full w-full object-cover"
    />
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
  /** the rocket below (where the window comes out of) */
  stack: Stack;
  reduced: boolean;
  fadeIn: boolean;
  /** the window: ms until it slides out (from behind the rocket's first panel, like the panels from the hull) */
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
  // (the window stays where it stood, over the rocket it stood on, as it grows)
  const [held, setHeld] = useState<Stack>(stack);
  if (small && held !== stack) setHeld(stack);
  const L = useMemo(() => widgetLayout(width, held), [width, held]);
  // (a name on two lines makes the rocket's panels taller: the window stands that much higher)
  const rise = usePanelRise();
  const rect = miniRect(vw, vh, L, rise);
  // nothing of the window shows below the top of the rocket's first panel (it comes out from behind it)
  const clipY = miniClipY(vw, vh, L, rise);
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
    // A new clip on the whole screen fades in (as the stage always did); the window slides out of
    // the rocket after its panels. (Not cancelled on cleanup: React's dev double mount would lose them.)
    if (before === null) {
      if (!fadeIn) return;
      if (small && popInMs !== null && !reduced) {
        pop.current.animate(miniOutKeyframes(vw, vh, L, rise), { duration: PREVIEW.outMs, delay: popInMs, fill: 'backwards' });
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
    // its frame stays while the talk fades, and goes as it grows
    const stay = wait / (wait + 120);
    const scale = swollen.current ? `scale(${MINI.SWELL})` : 'none';
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
    // (the window slides up out of the rocket, from behind its first panel: clipped at the panel's
    // top while it is the window; nothing is clipped once it grows to the whole screen)
    <div className={`absolute inset-0 ${small ? 'z-[1]' : ''}`} data-rw={small ? 'mini' : undefined} style={{ clipPath: small ? `inset(0 0 ${vh - clipY}px 0)` : 'none' }}>
    <div ref={pop} className="absolute inset-0">
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
    </div>
  );
}

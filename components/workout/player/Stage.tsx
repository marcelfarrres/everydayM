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
import { HANDOFF, MINI, growKeyframes, miniClipY, miniOutKeyframes, miniPose, miniRect } from './miniHandoff';
import { usePanelRise } from './panelRise';
import { isExercise, type RestItem, type RestScreen } from './model';

/*
 * The full-screen picture. It shows `displayIndex`, which follows the routine but changes behind
 * the clouds when a rest begins (the old clip stays under them until the screen is covered).
 *   serie / warm-up   the clip, untouched (it drives the clock)
 *   short rest        the next exercise, looping, muted, behind a dark veil with the giant
 *                     countdown (RestCountdown)
 *   long rest         computer: its talk with sound from when the clouds open, then like a short rest.
 *                     Phone (LongRestLayer, 26-11-2026): its one talk; then the rest video (Marcel
 *                     resting, looped, muted); in the last seconds the next exercise. Each change is
 *                     a crossfade (MINI.CROSSFADE_MS), the talk's voice going with its picture.
 *   end               EndScreen (computer), PhoneEndScreen (phone)
 * Which of these a rest shows (`restScreen`) is decided by the player, so the bar agrees.
 *
 * Phone, a long rest: the next exercise plays in a small window over the rocket's first panel, slid
 * up out of the rocket like its panels. It is already that exercise's own <video>: in the rest's
 * last seconds ('ready') it grows to the whole screen and loops behind a light veil; when the rest
 * ends the veil lifts and the same element goes on as the clip, from its first frame (transforms
 * only, see miniHandoff). Two videos at most, but for the crossfades: the talk or the rest video,
 * and that one.
 */

/** The next exercise's picture: the small window, the whole screen behind a veil (the rest's last seconds), or the clip itself. */
type ClipMode = 'window' | 'full' | 'clip';

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
  /** phone: the small window of the next exercise during a long rest, which then fills the screen */
  phone?: boolean;
  miniNext?: boolean;
}) {
  const item = queue[displayIndex];
  const live = displayIndex === currentIndex;
  // (the rocket the window slides out of: what is left of it, as the widget draws it)
  const stack = useMemo(() => rocketStack(queue, displayIndex), [queue, displayIndex]);

  const fadeIn = reduced
    ? {}
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.25, ease: 'easeOut' as const } };

  // The next exercise (phone, a long rest): the window, or in the last seconds the whole screen...
  const next = queue[displayIndex + 1];
  const previewing =
    phone && item?.kind === 'rest' && (restScreen === 'talks' || restScreen === 'resting' || restScreen === 'ready') && miniNext && isExercise(next);
  const preview: ClipMode | null = previewing ? (restScreen === 'ready' ? 'full' : 'window') : null;
  // ...and, when "Saltar" ends the rest while it is still the window, the rest that fades out under
  // it for a moment (in the last seconds the rest has already gone under the grown window).
  const [seen, setSeen] = useState({ index: displayIndex, preview, screen: restScreen });
  const [fading, setFading] = useState<{ index: number; fade: number; total: number; screen: RestScreen } | null>(null);
  if (seen.index !== displayIndex || seen.preview !== preview || seen.screen !== restScreen) {
    setSeen({ index: displayIndex, preview, screen: restScreen });
    if (seen.index !== displayIndex) {
      setFading(
        seen.preview === 'window' && seen.screen !== null && displayIndex === seen.index + 1 && isExercise(item) && !reduced
          ? { index: seen.index, ...HANDOFF, screen: seen.screen }
          : null,
      );
    }
  }
  useEffect(() => {
    if (fading === null) return;
    const t = setTimeout(() => setFading(null), fading.total + 60);
    return () => clearTimeout(t);
  }, [fading]);

  /** One exercise's clip: the whole screen (it drives the clock when live), or the next one (`mode`: the window or its last seconds). */
  const clip = (index: number, exercise: Exercise, mode: ClipMode, isLive: boolean) => (
    <ClipLayer
      key={`clip-${index}`}
      mode={mode}
      growAfterMs={fading?.fade ?? 0}
      stack={stack}
      reduced={reduced}
      fadeIn={phone}
      // the window slides out of the rocket just after its panels (it mounts as the clouds cover the screen)
      popInMs={mode === 'window' ? Math.max(0, PREVIEW_OUT_AFTER_REST_MS + cloudExtraMs(item) - CLOUDS.coveredMs) : null}
      // in its last moment it waits on its first frame, so starting the exercise doesn't jump
      hold={mode !== 'clip' && live && timeLeft <= MINI.HOLD_S}
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
        loop={mode !== 'clip'}
        playsInline
        muted
        onTimeUpdate={(e) => {
          if (mode !== 'clip') return; // the preview just loops
          // a clip that is no longer the current moment (held under the clouds) stays still
          if (!isLive || e.currentTarget.paused) {
            e.currentTarget.pause();
            return;
          }
          onVideoTimeUpdate();
        }}
        onLoadedMetadata={isLive ? onVideoTimeUpdate : undefined}
        onEnded={() => {
          if (isLive && mode === 'clip') onClipEnded();
        }}
        // A clip that can't load would stop the clock (it follows the video): try the original,
        // and if that fails too, go on to what comes next.
        onError={(e) => {
          if (!retryWithOriginal(e.currentTarget, exercise) && isLive && mode === 'clip') onClipEnded();
        }}
        className="h-full w-full object-cover"
      />
    </ClipLayer>
  );

  /** A rest's picture; `leaving`: it has just ended ("Saltar") under the growing window, and fades out. */
  const restLayer = (index: number, rest: RestItem, leaving: boolean) => (
    <div
      key={`rest-${index}`}
      className="absolute inset-0"
      // (fading to black: the stage is black under it)
      style={leaving ? { opacity: 0, transition: `opacity ${fading?.fade ?? MINI.FADE_MS}ms ease-in-out` } : undefined}
    >
      {phone && rest.restKind === 'long' ? (
        <LongRestLayer
          rest={rest}
          clip={restClipOf(queue, rest)}
          // (leaving: whatever it showed as it ended)
          screen={leaving ? (fading?.screen ?? 'resting') : (restScreen ?? 'resting')}
          leaving={leaving}
          paused={isPaused}
          // mounted once the clouds cover the screen; it speaks when they open
          delayMs={reduced ? 0 : CLOUDS.openingMs + cloudExtraMs(rest) - CLOUDS.coveredMs}
          onTalkDone={() => {
            if (!leaving) onTalksDone(rest);
          }}
        />
      ) : restScreen === 'talks' ? (
        <TalkReel
          // (one talk a rest: a routine saved with two plays the first)
          talk={rest.talks[0]}
          delayMs={reduced ? 0 : CLOUDS.openingMs + cloudExtraMs(rest) - CLOUDS.coveredMs}
          paused={isPaused}
          onFinished={() => onTalksDone(rest)}
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
      [faded?.kind === 'rest' && restLayer(fading?.index ?? -1, faded, true), clip(displayIndex, item.exercise, 'clip', live)]
    ) : (
      <motion.div key={`clip-${displayIndex}`} {...fadeIn} className="absolute inset-0">
        {clip(displayIndex, item.exercise, 'clip', live)}
      </motion.div>
    );
  } else if (item?.kind === 'rest') {
    content = [restLayer(displayIndex, item, false), preview !== null && isExercise(next) && clip(displayIndex + 1, next.exercise, preview, false)];
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

/** A rest video that hasn't started playing by then fades in anyway (its poster, or black). */
const REST_IN_FALLBACK_MS = 1500;

/**
 * Phone, a long rest's picture under the window of the next exercise:
 *   talks     its talk (one: the first, for a routine saved with two)
 *   resting   the rest video, which fades in over the talk's last frame once it plays; the talk
 *             goes when it is in
 *   ready     all of it fades out (the talk's voice too) under the window growing to the screen,
 *             and then goes (the window covers the screen)
 * A talk that leaves no time for the rest video goes straight to 'ready': the rest video never mounts.
 */
function LongRestLayer({
  rest,
  clip,
  screen,
  leaving,
  paused,
  delayMs,
  onTalkDone,
}: {
  rest: RestItem;
  clip: RestClip;
  screen: RestScreen;
  leaving: boolean;
  paused: boolean;
  delayMs: number;
  onTalkDone: () => void;
}) {
  const talk = rest.talks[0];
  const ready = screen === 'ready';
  const [hadRest, setHadRest] = useState(screen === 'resting');
  if (screen === 'resting' && !hadRest) setHadRest(true);
  // the rest video is in (playing, faded in over the talk); then the talk goes; in the last seconds, all
  const [restIn, setRestIn] = useState(false);
  const [talkGone, setTalkGone] = useState(!talk);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!hadRest || restIn) return;
    const t = setTimeout(() => setRestIn(true), REST_IN_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [hadRest, restIn]);
  useEffect(() => {
    if (!restIn || talkGone) return;
    const t = setTimeout(() => setTalkGone(true), MINI.CROSSFADE_MS + 100);
    return () => clearTimeout(t);
  }, [restIn, talkGone]);
  useEffect(() => {
    if (!ready || gone) return;
    const t = setTimeout(() => setGone(true), MINI.CROSSFADE_MS + 100);
    return () => clearTimeout(t);
  }, [ready, gone]);

  if (gone) return null;
  const crossfade = `opacity ${MINI.CROSSFADE_MS}ms ease-in-out`;
  return (
    <div className="absolute inset-0" data-rw="long-rest" style={{ opacity: ready ? 0 : 1, transition: crossfade }}>
      {talk && !talkGone && (
        <TalkReel talk={talk} delayMs={delayMs} paused={paused} fadeOut={ready || leaving} onFinished={onTalkDone} />
      )}
      {hadRest && (
        <div className="absolute inset-0" style={{ opacity: restIn ? 1 : 0, transition: crossfade }}>
          <RestLoop clip={clip} paused={paused || leaving} onPlaying={() => setRestIn(true)} />
        </div>
      )}
    </div>
  );
}

/**
 * Phone, a long rest with no talk speaking: the rest video (Marcel resting on camera), full screen,
 * looping, muted, paused with the routine.
 */
function RestLoop({ clip, paused, onPlaying }: { clip: RestClip; paused: boolean; onPlaying?: () => void }) {
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
      onPlaying={onPlaying}
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
 * One exercise's picture: the whole screen; or, while a long rest lasts, the window of the next
 * exercise above the rocket's first panel (`window`), which in the rest's last seconds grows to the
 * whole screen behind a veil (`full`). The same element and video all the way: nothing reloads.
 */
function ClipLayer({
  mode,
  growAfterMs,
  stack,
  reduced,
  fadeIn,
  popInMs,
  hold,
  children,
}: {
  mode: ClipMode;
  /** "Saltar", from the window to the whole screen: it waits this long first (the rest fading to black) */
  growAfterMs: number;
  /** the rocket below (where the window comes out of) */
  stack: Stack;
  reduced: boolean;
  fadeIn: boolean;
  /** the window: ms until it slides out (from behind the rocket's first panel, like the panels from the hull) */
  popInMs: number | null;
  /** the preview: wait on the first frame */
  hold: boolean;
  children: React.ReactNode;
}) {
  const small = mode === 'window';
  const pop = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const width = useRocketWidth();
  const vh = useWindowHeight();
  const vw = width + 12;
  // (the window stays where it stood, over the rocket it stood on, as it grows)
  const [held, setHeld] = useState<Stack>(stack);
  if (mode !== 'clip' && held !== stack) setHeld(stack);
  const L = useMemo(() => widgetLayout(width, held), [width, held]);
  // (a name on two lines makes the rocket's panels taller: the window stands that much higher)
  const rise = usePanelRise();
  const rect = miniRect(vw, vh, L, rise);
  // nothing of the window shows below the top of the rocket's first panel (it comes out from behind it)
  const clipY = miniClipY(vw, vh, L, rise);
  const pose = small ? miniPose(rect, vw, vh, 0) : null;
  const was = useRef<ClipMode | null>(null);
  const ring = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const before = was.current;
    was.current = mode;
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
    if (before === mode) return;
    const video = o.querySelector('video');

    // The rest's last seconds: the window grows to the whole screen and goes on looping behind its
    // veil (reduced motion: it simply fades in over the rest).
    if (before === 'window' && mode === 'full') {
      if (reduced) {
        const f = o.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MINI.CROSSFADE_MS, easing: 'ease-in-out' });
        return () => f.cancel();
      }
      const keys = growKeyframes(rect, vw, vh);
      const timing: KeyframeAnimationOptions = { duration: MINI.READY_GROW_MS, easing: 'linear' };
      const a = o.animate(keys.map((k) => ({ offset: k.offset, transform: k.outer, borderRadius: k.radius })), timing);
      const b = i.animate(keys.map((k) => ({ offset: k.offset, transform: k.inner })), timing);
      const f = ring.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200 });
      return () => {
        a.cancel();
        b.cancel();
        f?.cancel();
      };
    }
    if (mode !== 'clip') return;

    // The exercise starts: from its first frame, once.
    if (video) {
      video.loop = false;
      video.pause();
      video.currentTime = 0;
    }
    // from the whole screen: the veil lifts (its own transition) and it plays at once
    if (before === 'full') {
      void video?.play().catch(() => {});
      return;
    }
    // "Saltar" from the window: once the rest has faded to black it fills the screen
    const wait = reduced ? 0 : growAfterMs;
    const go = setTimeout(() => void video?.play().catch(() => {}), wait);
    if (reduced) {
      const fade = o.animate([{ opacity: 0.4 }, { opacity: 1 }], { duration: 200 });
      return () => {
        clearTimeout(go);
        fade.cancel();
      };
    }
    const keys = growKeyframes(rect, vw, vh);
    const timing: KeyframeAnimationOptions = { duration: MINI.GROW_MS, delay: wait, easing: 'linear', fill: 'backwards' };
    const a = o.animate(keys.map((k) => ({ offset: k.offset, transform: k.outer, borderRadius: k.radius })), timing);
    const b = i.animate(keys.map((k) => ({ offset: k.offset, transform: k.inner })), timing);
    // its frame stays while the rest fades, and goes as it grows
    const stay = wait / (wait + 120);
    const f = ring.current?.animate(
      [
        { opacity: 1 },
        { opacity: 1, offset: stay },
        { opacity: 0 },
      ],
      { duration: wait + 120 },
    );
    return () => {
      clearTimeout(go);
      a.cancel();
      b.cancel();
      f?.cancel();
    };
    // (only when it appears, and when it changes mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const video = outer.current?.querySelector('video');
    if (mode === 'clip' || !hold || !video) return;
    video.pause();
    video.currentTime = 0;
  }, [mode, hold]);

  return (
    // (the window slides up out of the rocket, from behind its first panel: clipped at the panel's
    // top while it is the window; nothing is clipped once it grows to the whole screen)
    <div
      className={`absolute inset-0 ${mode !== 'clip' ? 'z-[1]' : ''}`}
      data-rw={small ? 'mini' : mode === 'full' ? 'ready-preview' : undefined}
      style={{ clipPath: small ? `inset(0 0 ${vh - clipY}px 0)` : 'none' }}
    >
    <div ref={pop} className="absolute inset-0">
      <div
        ref={outer}
        className="absolute inset-0 overflow-hidden"
        style={{
          transformOrigin: '0 0',
          transform: pose?.outer ?? 'none',
          borderRadius: pose?.radius ?? 0,
          // (it glides when the panel under it changes height)
          transition: small && !reduced ? `transform ${MINI.GLIDE_MS}ms ease-in-out, border-radius ${MINI.GLIDE_MS}ms ease-in-out` : 'none',
        }}
      >
        <div ref={inner} className="absolute inset-0" style={{ transform: pose?.inner ?? 'none' }}>
          {children}
        </div>
        {/* the last seconds: a light veil, so it reads as "luego"; it lifts as the exercise starts */}
        <div
          aria-hidden="true"
          data-rw="ready-veil"
          className="pointer-events-none absolute inset-0 bg-black"
          style={{ opacity: mode === 'full' ? MINI.VEIL : 0, transition: `opacity ${mode === 'full' ? MINI.READY_GROW_MS : MINI.CROSSFADE_MS}ms ease-in-out` }}
        />
      </div>
      {/* the window's frame (apart, so the window's own scaling doesn't thin it) */}
      <div
        ref={ring}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 rounded-[12px] ring-2 ring-white"
        style={{
          width: rect.width,
          height: rect.height,
          opacity: small ? 1 : 0,
          transform: `translate(${rect.left}px, ${rect.top}px)`,
          transition: small && !reduced ? `transform ${MINI.GLIDE_MS}ms ease-in-out` : 'none',
        }}
      />
    </div>
    </div>
  );
}

'use client';

import { useState, useRef, useEffect, useCallback, type CSSProperties, type RefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Bell,
  BellOff,
  ChevronLeft,
  Ellipsis,
  Pause,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { RoutinePlan } from '@/components/workout/RoutinePlan';
import { ChalkBoard } from '@/components/workout/ChalkBoard';
import { CloudTransition } from '@/components/workout/CloudTransition';
import { playCountdownBeep } from '@/components/workout/CountdownRing';
import { formatSeconds } from '@/components/workout/RoutineTimeline';
import { cheerFor } from '@/lib/routine';
import type {
  Exercise,
  PlaylistTrack,
  RoutineItem,
  RoutineMeta,
  TimelineSegment,
} from '@/types/workout';

interface WorkoutPlayerProps {
  queue: RoutineItem[];
  currentIndex: number;
  currentItem: RoutineItem | undefined;
  timeLeft: number;
  totalItemDuration: number;
  videoRef: RefObject<HTMLVideoElement | null>;
  playlist: PlaylistTrack[];
  currentTrackId: number;
  onSelectTrack: (trackId: number) => void;
  musicPlaying: boolean;
  onToggleMusic: () => void;
  onExit: () => void;
  onNext: () => void;
  onPrev?: () => void;
  onRepeat?: () => void;
  onExtend?: (seconds: number) => void;
  isPaused?: boolean;
  onTogglePause?: () => void;
  meta?: RoutineMeta | null;
  timeline?: TimelineSegment[];
  elapsedSeconds?: number;
  totalSeconds?: number;
  onVideoTimeUpdate: () => void;
  onOpenTiktok?: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current';

/* ── Phases ────────────────────────────────────────────────────────────────────
   Every moment is one of three phases, each with a colour that is always paired with its
   name: warm-up (amber), main part (red), rest (blue). Intro, plan and end are calm (ink). */
type Tone = 'warm' | 'work' | 'rest' | 'calm';
const HEX: Record<Tone, string> = { warm: '#ff9f0a', work: '#ff3b30', rest: '#2f6bff', calm: '#131313' };
const DOT: Record<Tone, string> = { warm: 'bg-warm', work: 'bg-heat', rest: 'bg-rest', calm: 'bg-ink' };
const PHASE_NAME: Record<Tone, string> = {
  warm: 'Calentamiento',
  work: 'Parte principal',
  rest: 'Descanso',
  calm: '',
};

function toneOf(item: RoutineItem | undefined): Tone {
  switch (item?.kind) {
    case 'warmup':
      return 'warm';
    case 'workout':
      return 'work';
    case 'rest':
      return 'rest';
    default:
      return 'calm';
  }
}

type ExerciseItem = Extract<RoutineItem, { kind: 'warmup' | 'workout' }>;
const isExercise = (item: RoutineItem | undefined): item is ExerciseItem =>
  item?.kind === 'warmup' || item?.kind === 'workout';

/** Where this moment sits: the exercise's place in its block, and the block's place in the routine. */
function position(item: RoutineItem | undefined, queue: RoutineItem[], index: number) {
  if (item?.kind === 'warmup') {
    const total = queue.filter((q) => q.kind === 'warmup').length;
    const n = queue.slice(0, index + 1).filter((q) => q.kind === 'warmup').length;
    return { n, of: total, round: 0, rounds: 0 };
  }
  if (item?.kind === 'workout') {
    return { n: item.exerciseIndexInRound, of: item.totalExercisesPerRound, round: item.round, rounds: item.totalRounds };
  }
  if (item?.kind === 'rest') {
    const before = queue[index - 1];
    return before?.kind === 'workout'
      ? { n: before.exerciseIndexInRound, of: before.totalExercisesPerRound, round: before.round, rounds: before.totalRounds }
      : { n: 0, of: 0, round: 0, rounds: 0 };
  }
  return { n: 0, of: 0, round: 0, rounds: 0 };
}

function titleOf(item: RoutineItem | undefined, meta: RoutineMeta | null | undefined, prep: boolean): string {
  switch (item?.kind) {
    case 'intro':
      return 'Everyday M';
    case 'summary':
      return item.meta.focusLabel || 'Entrenamiento completo';
    case 'warmup':
    case 'workout':
      return item.exercise.title;
    case 'rest':
      return prep ? 'Prepárate' : 'Descansa';
    case 'outro':
      return 'Hecho';
    default:
      return meta?.focusLabel ?? 'Entrenamiento';
  }
}

/** The words on the clouds between two moments of the routine. */
function cloudLabel(queue: RoutineItem[], index: number): { title: string; sub?: string; tone: Tone } {
  const item = queue[index];
  const prev = queue[index - 1];
  switch (item?.kind) {
    case 'warmup':
      return prev?.kind !== 'warmup'
        ? { title: 'Calentamiento', sub: item.exercise.title, tone: 'warm' }
        : { title: item.exercise.title, sub: 'Calentamiento', tone: 'warm' };
    case 'workout': {
      const left = item.totalRounds - item.round;
      const vuelta = `Vuelta ${item.round} · ${left <= 0 ? 'la última' : left === 1 ? 'queda 1' : `quedan ${left}`}`;
      return item.exerciseIndexInRound === 1
        ? { title: `Vuelta ${item.round}`, sub: item.exercise.title, tone: 'work' }
        : { title: item.exercise.title, sub: vuelta, tone: 'work' };
    }
    case 'rest':
      return { title: 'Descansa', sub: `Luego: ${item.nextExercise.title}`, tone: 'rest' };
    case 'outro':
      return { title: '¡Hecho!', tone: 'calm' };
    default:
      return { title: item?.kind === 'summary' ? item.meta.focusLabel : '', tone: 'calm' };
  }
}

/** `value`, but `ms` later: lets a change happen behind the clouds instead of before them. */
function useLagged<T>(value: T, ms: number): T {
  const [lagged, setLagged] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setLagged(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return lagged;
}

/* ── Small pieces ─────────────────────────────────────────────────────────── */

/** Clock whose digits roll down as they change, like a departure board. */
function RollingTime({ value, className = '' }: { value: string; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <span className={`inline-flex tabular-nums ${className}`} aria-label={value} role="timer">
      {value.split('').map((ch, i) => (
        <span key={i} aria-hidden="true" className="relative inline-flex overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch}
              initial={reduced ? false : { y: '-70%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? undefined : { y: '70%', opacity: 0 }}
              transition={{ duration: 0.38, ease: EASE }}
              className="inline-block"
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}

/* ── Player ───────────────────────────────────────────────────────────────── */

export function WorkoutPlayer({
  queue,
  currentIndex,
  currentItem,
  timeLeft,
  totalItemDuration,
  videoRef,
  playlist,
  currentTrackId,
  onSelectTrack,
  musicPlaying,
  onToggleMusic,
  onExit,
  onNext,
  onPrev,
  onRepeat,
  onExtend,
  isPaused = false,
  onTogglePause,
  meta,
  timeline = [],
  elapsedSeconds = 0,
  totalSeconds,
  onVideoTimeUpdate,
  onOpenTiktok,
}: WorkoutPlayerProps) {
  const reduced = useReducedMotion();
  const [beepEnabled, setBeepEnabled] = useState(true);
  const itemIndex = currentIndex;
  const activeIndexRef = useRef(currentIndex);
  const lastBeepRef = useRef<number | null>(null);

  useEffect(() => {
    activeIndexRef.current = currentIndex;
  }, [currentIndex]);

  const handleNext = useCallback(() => {
    activeIndexRef.current = -1;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current = null;
    }
    onNext();
  }, [onNext, videoRef]);

  const handlePrev = useCallback(() => {
    activeIndexRef.current = -1;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current = null;
    }
    onPrev?.();
  }, [onPrev, videoRef]);

  // Space pauses, arrows skip.
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

  // Beep on the last 3 seconds of every block
  const kind = currentItem?.kind;
  useEffect(() => {
    if (!beepEnabled || isPaused || kind === 'intro' || kind === 'outro') return;
    if (timeLeft > 0 && timeLeft <= 3) {
      if (lastBeepRef.current !== timeLeft) {
        lastBeepRef.current = timeLeft;
        playCountdownBeep(timeLeft);
      }
    } else {
      lastBeepRef.current = null;
    }
  }, [timeLeft, beepEnabled, isPaused, kind]);

  // What the clouds say while they are closed: where you are going.
  const label = cloudLabel(queue, currentIndex);
  // The board changes only once the clouds have covered it.
  const boardIndex = useLagged(currentIndex, 800);

  const handleTogglePiP = async () => {
    const videoEl = videoRef.current;
    if (!videoEl || typeof document === 'undefined') return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (document.pictureInPictureEnabled) await videoEl.requestPictureInPicture();
    } catch {
      // not available in this state
    }
  };

  const prep = currentItem?.kind === 'rest' && timeLeft <= 3;
  const tone = toneOf(currentItem);
  const title = titleOf(currentItem, meta, prep);
  const where = position(currentItem, queue, currentIndex);
  const critical = timeLeft > 0 && timeLeft <= 3 && kind !== 'intro' && kind !== 'outro';
  const cheer = cheerFor(queue, currentIndex, totalItemDuration - timeLeft, totalItemDuration);

  const total = totalSeconds ?? meta?.totalSeconds ?? 0;
  const remaining = Math.max(0, total - elapsedSeconds);
  const percent = kind === 'outro' ? 100 : Math.round((total > 0 ? Math.min(1, elapsedSeconds / total) : 0) * 100);
  const itemProgress =
    totalItemDuration > 0 ? Math.min(1, Math.max(0, (totalItemDuration - timeLeft) / totalItemDuration)) : 0;
  const time = formatSeconds(timeLeft).replace(/^0(?=\d:)/, '');
  const boardTime = useLagged(time, 800);

  // The next clip (named in the phone bar during a rest).
  const nextUp = queue.find((q, i) => i > currentIndex && isExercise(q)) as ExerciseItem | undefined;
  const nextExercise: Exercise | undefined = nextUp?.exercise;

  const iconButton = `flex h-11 w-11 items-center justify-center rounded-full transition-colors ${FOCUS}`;

  const menu = (
    <details
      className="relative"
      onClick={(e) => {
        // close after choosing an option
        if ((e.target as HTMLElement).closest('button')) (e.currentTarget as HTMLDetailsElement).open = false;
      }}
    >
      <summary
        aria-label="Más opciones"
        className={`${iconButton} cursor-pointer list-none bg-white/15 text-white backdrop-blur-md hover:bg-white/25 [&::-webkit-details-marker]:hidden`}
      >
        <Ellipsis className="h-5 w-5" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl bg-white p-1.5 text-[15px] font-medium text-ink shadow-[0_24px_60px_-18px_rgba(0,0,0,0.35)]">
        {onOpenTiktok && (
          <button type="button" onClick={onOpenTiktok} className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left hover:bg-ink/8 ${FOCUS}`}>
            Vídeo para TikTok
          </button>
        )}
        <button type="button" onClick={handleTogglePiP} className={`flex min-h-11 w-full items-center rounded-xl px-3 text-left hover:bg-ink/8 ${FOCUS}`}>
          Vídeo en ventana flotante
        </button>
        <button
          type="button"
          onClick={onToggleMusic}
          aria-pressed={musicPlaying}
          className={`flex min-h-11 w-full items-center justify-between rounded-xl px-3 text-left hover:bg-ink/8 ${FOCUS}`}
        >
          Música
          <span className="text-ink/55">{musicPlaying ? 'Sí' : 'No'}</span>
        </button>
        {musicPlaying && (
          <select
            value={currentTrackId}
            onChange={(e) => onSelectTrack(Number(e.target.value))}
            aria-label="Pista de música"
            className={`mt-1 min-h-11 w-full rounded-xl bg-ink/8 px-3 text-ink ${FOCUS}`}
          >
            {playlist.map((track) => (
              <option key={track.id} value={track.id}>
                {track.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </details>
  );

  const header = (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-white lg:px-8 lg:pt-6">
      <button
        type="button"
        onClick={onExit}
        className={`pointer-events-auto flex min-h-11 items-center gap-1 rounded-full bg-white/15 pl-2 pr-4 text-[15px] font-medium backdrop-blur-md hover:bg-white/25 ${FOCUS}`}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        Salir
      </button>
      <div className="pointer-events-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => setBeepEnabled((prev) => !prev)}
          aria-pressed={beepEnabled}
          aria-label="Pitido en los últimos 3 segundos"
          className={`${iconButton} bg-white/15 backdrop-blur-md hover:bg-white/25 ${beepEnabled ? '' : 'opacity-50'}`}
        >
          {beepEnabled ? <Bell className="h-5 w-5" aria-hidden="true" /> : <BellOff className="h-5 w-5" aria-hidden="true" />}
        </button>
        {menu}
      </div>
    </header>
  );

  const fade = {
    initial: reduced ? false : ({ opacity: 0 } as const),
    animate: { opacity: 1 },
    // the old moment stays visible while the clouds close over it (0.45 s), then swaps
    exit: reduced ? undefined : { opacity: 0, transition: { delay: 0.8, duration: 0.01 } },
    transition: { duration: 0.3, ease: EASE },
  };

  // Plan and end screens show today's own exercises, so every routine looks different.
  const seenIds = new Set<string>();
  const dayExercises = (meta?.circuit ?? []).filter((e) => !seenIds.has(e.id) && seenIds.add(e.id));
  const mosaic =
    dayExercises.length > 0 ? (
      <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-1 bg-black">
        {Array.from({ length: 4 }, (_, i) => dayExercises[i % dayExercises.length]).map((ex, i) => (
          <motion.video
            key={i}
            src={ex.video_url}
            autoPlay
            loop
            muted
            playsInline
            aria-hidden="true"
            initial={reduced ? false : { opacity: 0, scale: 1.12 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.12, duration: 0.7, ease: EASE }}
            className="h-full w-full object-cover"
          />
        ))}
      </div>
    ) : null;

  const stage = (
    <div data-testid="workout-stage-916" className="relative h-full w-full overflow-hidden bg-black text-white @container lg:rounded-[28px]">
      <AnimatePresence mode="wait" initial={false}>
        {currentItem?.kind === 'summary' ? (
          /* PLAN: today's exercises moving behind, the routine as a turning pie in front */
          <motion.div
            key={`summary-${currentIndex}`}
            {...fade}
            className="relative flex h-full w-full flex-col items-center justify-center gap-4 bg-black px-5 pb-24 pt-28 text-white lg:p-7"
          >
            {mosaic}
            <div className="pointer-events-none absolute inset-0 bg-black/70" />
            <p className="relative text-[13px] font-semibold uppercase tracking-[0.12em] text-white/70">
              Así será · {Math.max(1, Math.round(currentItem.meta.totalSeconds / 60))} min
            </p>
            <div className="relative w-full">
              <RoutinePlan queue={queue} timeline={timeline} seconds={currentItem.duration} />
            </div>
          </motion.div>
        ) : currentItem?.kind === 'rest' ? (
          /* REST: its own colour, a breathing circle around the count, the next clip framed as a preview */
          <motion.div
            key={`rest-${currentIndex}`}
            {...fade}
            className="relative flex h-full w-full flex-col items-center justify-center gap-5 bg-rest p-6 pb-28 pt-32 text-center text-white lg:pb-8 lg:pt-8"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_0%,rgba(255,255,255,0.25),transparent_60%)]" />
            <p className="relative text-[min(13cqw,3.25rem)] font-bold leading-none tracking-[-0.03em]">{title}</p>
            <div className="relative flex items-center justify-center">
              {!reduced && (
                <motion.span
                  aria-hidden="true"
                  className="absolute h-[min(48cqw,13rem)] w-[min(48cqw,13rem)] rounded-full bg-white/15"
                  animate={{ scale: [0.85, 1.15, 0.85], opacity: [0.5, 0.15, 0.5] }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <motion.p
                key={critical ? timeLeft : 'steady'}
                initial={reduced || !critical ? false : { scale: 1.3, opacity: 0.4 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="relative text-[min(34cqw,9rem)] font-bold leading-none tabular-nums tracking-[-0.05em]"
              >
                {timeLeft}
              </motion.p>
            </div>
            <figure className="relative w-[44%] max-w-48 overflow-hidden rounded-3xl bg-black/30 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/30">
              <video
                key={currentItem.nextExercise.video_url}
                src={currentItem.nextExercise.video_url}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
                className="aspect-[9/16] w-full object-cover"
              />
              <span className="absolute left-2 top-2 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] backdrop-blur-md">
                Vista previa
              </span>
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 pt-8 text-left">
                <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-white/75">Siguiente</span>
                <span className="block truncate text-[15px] font-semibold">{currentItem.nextExercise.title}</span>
              </figcaption>
            </figure>
          </motion.div>
        ) : currentItem?.kind === 'outro' ? (
          <motion.div key={`outro-${currentIndex}`} {...fade} className="relative flex h-full w-full flex-col justify-between bg-black p-6 pb-10 pt-24 text-white lg:p-8">
            {mosaic}
            <div className="pointer-events-none absolute inset-0 bg-black/55" />
            <motion.div
              initial={reduced ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
              className="relative"
            >
              <h2 className="text-[min(18cqw,4.5rem)] font-bold leading-none tracking-[-0.04em]">Hecho</h2>
              <p className="mt-3 text-[17px] font-medium tabular-nums text-white/75">
                {formatSeconds(currentItem.meta.totalSeconds)} · {currentItem.meta.rounds}{' '}
                {currentItem.meta.rounds === 1 ? 'ronda' : 'rondas'}
              </p>
            </motion.div>
            <div className="relative grid grid-cols-2 gap-2">
              {onRepeat && (
                <button
                  type="button"
                  onClick={onRepeat}
                  className={`flex h-14 items-center justify-center gap-2 rounded-full bg-white text-lg font-semibold text-ink transition-transform hover:scale-[1.02] active:scale-[0.98] ${FOCUS}`}
                >
                  <RotateCcw className="h-5 w-5" aria-hidden="true" /> Repetir
                </button>
              )}
              <button
                type="button"
                onClick={onExit}
                className={`flex h-14 items-center justify-center rounded-full bg-white/15 text-lg font-semibold text-white backdrop-blur-md ${onRepeat ? '' : 'col-span-2'} ${FOCUS}`}
              >
                Otra rutina
              </button>
            </div>
          </motion.div>
        ) : (
          /* EXERCISE: the clip, untouched */
          <motion.div key={`exercise-${currentIndex}-${currentItem?.exercise.id ?? 'none'}`} {...fade} className="relative h-full w-full">
            <video
              key={currentItem?.exercise.video_url}
              ref={(el) => {
                if (activeIndexRef.current === itemIndex) videoRef.current = el;
              }}
              src={currentItem?.exercise.video_url}
              autoPlay
              playsInline
              muted
              onTimeUpdate={(e) => {
                if (activeIndexRef.current !== itemIndex || e.currentTarget.paused) {
                  e.currentTarget.pause();
                  return;
                }
                onVideoTimeUpdate();
              }}
              onLoadedMetadata={onVideoTimeUpdate}
              onEnded={() => {
                if (activeIndexRef.current === itemIndex) handleNext();
              }}
              className="h-full w-full object-cover"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Last three seconds of an exercise: the count takes the screen */}
      <AnimatePresence>
        {critical && isExercise(currentItem) && (
          <motion.div
            key={`count-${currentIndex}-${timeLeft}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          >
            <span className="text-[min(55cqw,14rem)] font-bold leading-none tabular-nums text-white [text-shadow:0_10px_50px_rgba(0,0,0,0.5)]">
              {timeLeft}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* A word of encouragement, now and then: a small pill at the top edge, never over the exercise */}
      <AnimatePresence>
        {cheer && !critical && (
          <motion.div
            key={cheer}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.5, ease: EASE }}
            className="pointer-events-none absolute inset-x-0 top-[6.25rem] z-10 flex justify-center px-6 lg:top-5"
          >
            <span className="flex items-center gap-2 rounded-full bg-black/45 py-1.5 pl-3 pr-4 text-[14px] font-semibold text-white backdrop-blur-md">
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone === 'calm' ? 'bg-white' : DOT[tone]}`} />
              {cheer}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );

  // Desktop: the frame around the video is the clock (it fills in the phase colour) and,
  // while resting, a light runs round it.
  const frameClass = kind === 'rest' ? 'stage-spin' : isExercise(currentItem) ? 'stage-ring' : '';
  const frameStyle = { '--ring': HEX[tone], '--p': itemProgress } as CSSProperties;
  const showMini = kind !== 'intro' && kind !== 'outro';

  return (
    <div className="fixed inset-0 overflow-hidden bg-black font-[family-name:var(--font-display)] text-ink lg:bg-[#1c1d1b]">
      {/* COMPUTER: a real chalkboard behind everything, lit by a hanging bulb */}
      <div aria-hidden="true" className="absolute inset-0 hidden bg-[url(/textures/pizarra-negra.webp)] bg-cover bg-center lg:block" />
      <div aria-hidden="true" className="absolute inset-0 hidden bg-[radial-gradient(120%_90%_at_50%_45%,transparent_45%,rgba(0,0,0,0.55))] lg:block" />
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 hidden mix-blend-screen lg:block"
        style={{ background: 'radial-gradient(42% 52% at 64% 0%, rgba(255,196,120,0.30), transparent 70%)' }}
        animate={reduced ? undefined : { opacity: [1, 1, 0.72, 1, 0.86, 1, 1] }}
        transition={{ duration: 7, times: [0, 0.6, 0.62, 0.64, 0.66, 0.68, 1], repeat: Infinity }}
      />
      <svg aria-hidden="true" width="64" height="118" viewBox="0 0 64 118" className="pointer-events-none absolute left-[64%] top-0 z-20 hidden -translate-x-1/2 lg:block">
        <line x1="32" y1="0" x2="32" y2="60" stroke="#0d0d0d" strokeWidth="3" />
        <rect x="23" y="58" width="18" height="14" rx="2" fill="#2b2b2b" />
        <circle cx="32" cy="94" r="34" fill="#ffb547" opacity="0.18" />
        <circle cx="32" cy="94" r="19" fill="#ffd796" />
        <path d="M25 96 q7 -14 14 0" stroke="#c97a1a" strokeWidth="2" fill="none" />
      </svg>

      {header}

      <div className="h-full lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-16 lg:px-14 lg:pb-28 lg:pt-20 xl:gap-24 xl:px-20">
        {/* THE VIDEO */}
        <div className="relative h-full lg:min-h-0">
          <div className="relative h-full lg:aspect-[9/16] lg:rounded-[34px] lg:p-[6px] lg:shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8)]">
            {/* the clock round the video; re-keyed per item so it starts empty, while the
                stage itself stays mounted and can hold the old moment under the clouds */}
            <div
              key={frameClass === 'stage-ring' ? `ring-${currentIndex}` : frameClass}
              aria-hidden="true"
              className={`absolute inset-0 hidden rounded-[34px] lg:block ${frameClass}`}
              style={frameStyle}
            />
            <div className="relative h-full">{stage}</div>
          </div>
        </div>

        {/* THE BOARD (computer only) */}
        <ChalkBoard
          queue={queue}
          currentIndex={boardIndex}
          meta={meta}
          time={boardTime}
          critical={critical}
          className="relative z-10 hidden lg:flex"
        />
      </div>

      {/* PHONE: one simple progress bar on top, a slim now-playing bar at the bottom */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-36 bg-gradient-to-b from-black/60 to-transparent lg:hidden" />
      <div className="pointer-events-none absolute inset-x-4 top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)] z-20 lg:hidden">
        <div className="h-1 overflow-hidden rounded-full bg-white/25">
          <div
            className="h-full rounded-full bg-white transition-[width] duration-1000 ease-linear"
            style={{ width: `${(kind === 'outro' ? 1 : total > 0 ? Math.min(1, elapsedSeconds / total) : 0) * 100}%` }}
          />
        </div>
        <p className="mt-1.5 flex justify-between text-[12px] font-semibold tabular-nums text-white/80">
          <span>{percent}%</span>
          <span>Quedan {formatSeconds(remaining)}</span>
        </p>
      </div>

      {showMini && (
        <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-center gap-2 overflow-hidden rounded-[22px] bg-black/55 py-2 pl-4 pr-2 text-white shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)] backdrop-blur-xl lg:inset-x-auto lg:bottom-7 lg:left-1/2 lg:w-[min(46rem,calc(100%-6rem))] lg:-translate-x-1/2 lg:py-2.5 lg:pl-6">
          <div aria-hidden="true" className="absolute inset-x-0 bottom-0 hidden h-[3px] bg-white/10 lg:block">
            <div className="h-full bg-white/80 transition-[width] duration-1000 ease-linear" style={{ width: `${(total > 0 ? Math.min(1, elapsedSeconds / total) : 0) * 100}%` }} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-[11px] font-bold uppercase tracking-[0.08em] text-white/75">
              <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tone === 'calm' ? 'bg-white' : DOT[tone]}`} />
              {tone === 'work' ? 'Principal' : PHASE_NAME[tone] || 'Tu rutina'}
              {where.rounds > 0 && <span className="font-semibold text-white/55">· R{where.round}/{where.rounds}</span>}
              {where.of > 0 && kind !== 'rest' && <span className="font-semibold text-white/55">· {where.n}/{where.of}</span>}
            </p>
            <p className="truncate text-[17px] font-semibold leading-tight">
              {kind === 'rest' && nextExercise ? `Luego: ${nextExercise.title}` : kind === 'summary' ? meta?.focusLabel : title}
            </p>
          </div>
          {kind !== 'rest' && (
            <RollingTime value={time} className={`shrink-0 pr-1 text-2xl font-bold leading-none tracking-[-0.03em] ${critical ? 'text-heat' : ''}`} />
          )}
          {kind === 'rest' && onExtend ? (
            <button type="button" onClick={() => onExtend(10)} aria-label="Diez segundos más de descanso" className={`h-10 shrink-0 rounded-full px-3 text-[14px] font-semibold hover:bg-white/15 ${FOCUS}`}>
              +10 s
            </button>
          ) : (
            <button type="button" onClick={handlePrev} disabled={!onPrev || currentIndex <= 0} aria-label="Anterior" className={`flex h-10 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 disabled:opacity-30 ${FOCUS}`}>
              <SkipBack className="h-4 w-4 fill-current" aria-hidden="true" />
            </button>
          )}
          <motion.button
            type="button"
            onClick={onTogglePause}
            whileTap={{ scale: 0.9 }}
            aria-label={isPaused ? 'Reanudar' : 'Pausar'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-ink ${FOCUS}`}
          >
            {isPaused ? <Play className="ml-0.5 h-5 w-5 fill-current" aria-hidden="true" /> : <Pause className="h-5 w-5 fill-current" aria-hidden="true" />}
          </motion.button>
          {kind === 'rest' ? (
            <button type="button" onClick={handleNext} className={`h-10 shrink-0 rounded-full px-3 text-[14px] font-semibold hover:bg-white/15 ${FOCUS}`}>
              Saltar
            </button>
          ) : (
            <button type="button" onClick={handleNext} aria-label="Siguiente" className={`flex h-10 w-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15 ${FOCUS}`}>
              <SkipForward className="h-4 w-4 fill-current" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      {/* warm up the next clip so it is playing by the time the clouds open */}
      {nextExercise && (
        <video
          key={nextExercise.video_url}
          src={nextExercise.video_url}
          preload="auto"
          muted
          playsInline
          aria-hidden="true"
          className="pointer-events-none absolute h-px w-px opacity-0"
        />
      )}
      <CloudTransition playKey={currentIndex} title={label.title} sub={label.sub} kicker={PHASE_NAME[label.tone]} color={HEX[label.tone]} />
    </div>
  );
}

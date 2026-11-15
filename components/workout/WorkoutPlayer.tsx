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
  Plus,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { getExerciseMuscles } from '@/components/workout/MuscleSelector';
import { MarcelFigure } from '@/components/workout/MarcelFigure';
import { RoutinePlan } from '@/components/workout/RoutinePlan';
import { playCountdownBeep } from '@/components/workout/CountdownRing';
import { formatSeconds } from '@/components/workout/RoutineTimeline';
import { cheerFor } from '@/lib/routine';
import type {
  Exercise,
  MuscleSelection,
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
const SOLID: Record<Tone, string> = {
  warm: 'bg-warm text-ink',
  work: 'bg-heat text-white',
  rest: 'bg-rest text-white',
  calm: 'bg-ink text-white',
};
const WASH: Record<Tone, string> = {
  warm: 'bg-warm/90 text-ink',
  work: 'bg-heat/90 text-white',
  rest: 'bg-rest/90 text-white',
  calm: 'bg-ink/90 text-white',
};
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

function getActiveMuscles(item: RoutineItem | undefined, meta?: RoutineMeta | null): MuscleSelection[] {
  if (!item) return meta?.muscles ?? [];
  if (item.kind === 'summary' || item.kind === 'outro') {
    return item.meta.muscles.length > 0 ? item.meta.muscles : (meta?.muscles ?? []);
  }
  const ex = item.kind === 'rest' ? item.nextExercise : item.exercise;
  return getExerciseMuscles(ex.muscles, ex.muscle);
}

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

/** The card that flashes on screen when a block starts (or you skip into one). */
type Announcement = { big: boolean; tone: Tone; title: string; sub: string };
function announcementFor(queue: RoutineItem[], index: number): Announcement | null {
  const item = queue[index];
  const prev = queue[index - 1];
  if (!item) return null;
  switch (item.kind) {
    case 'warmup': {
      const total = queue.filter((q) => q.kind === 'warmup').length;
      if (prev?.kind !== 'warmup') {
        return { big: true, tone: 'warm', title: 'Calentamiento', sub: `${total} ejercicios suaves para activar el cuerpo` };
      }
      const k = queue.slice(0, index + 1).filter((q) => q.kind === 'warmup').length;
      return { big: false, tone: 'warm', title: `Calentamiento · ${k} de ${total}`, sub: item.exercise.title };
    }
    case 'workout': {
      const last = !queue.slice(index + 1).some((q) => q.kind === 'workout');
      if (item.exerciseIndexInRound === 1) {
        return {
          big: true,
          tone: 'work',
          title: item.round === 1 ? 'Parte principal' : `Ronda ${item.round}`,
          sub: `Ronda ${item.round} de ${item.totalRounds} · ${item.totalExercisesPerRound} ejercicios`,
        };
      }
      if (last) return { big: true, tone: 'work', title: 'Último ejercicio', sub: 'Dalo todo' };
      return {
        big: false,
        tone: 'work',
        title: `Ejercicio ${item.exerciseIndexInRound} de ${item.totalExercisesPerRound}`,
        sub: item.exercise.title,
      };
    }
    case 'rest':
      return {
        big: true,
        tone: 'rest',
        title: item.isEndOfRound ? `Ronda ${Math.max(1, item.nextRound - 1)} hecha` : 'Descansa',
        sub: item.isEndOfRound ? 'Recupera bien: ahora viene otra ronda' : `Siguiente: ${item.nextExercise.title}`,
      };
    default:
      return null;
  }
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

function PhaseBadge({ tone, size = 'md' }: { tone: Tone; size?: 'sm' | 'md' }) {
  if (tone === 'calm') return null;
  return (
    <motion.span
      key={tone}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      className={`inline-flex items-center gap-2 rounded-full font-bold uppercase tracking-[0.1em] ${SOLID[tone]} ${
        size === 'md' ? 'px-4 py-2 text-[14px]' : 'px-3 py-1 text-[11px]'
      }`}
    >
      {PHASE_NAME[tone]}
    </motion.span>
  );
}

/** One mark per exercise of the block: done, now (pulsing), to come. */
function Ticks({ n, of, tone, onDark = false }: { n: number; of: number; tone: Tone; onDark?: boolean }) {
  if (of <= 0) return null;
  return (
    <span className="flex w-full max-w-72 gap-1" aria-hidden="true">
      {Array.from({ length: of }, (_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${
            i < n - 1 ? DOT[tone] : i === n - 1 ? `${DOT[tone]} animate-pulse` : onDark ? 'bg-white/25' : 'bg-ink/12'
          }`}
        />
      ))}
    </span>
  );
}

function RoundDots({ round, rounds, onDark = false }: { round: number; rounds: number; onDark?: boolean }) {
  if (rounds <= 0) return null;
  return (
    <span className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: rounds }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${
            i < round - 1 ? (onDark ? 'bg-white' : 'bg-ink') : i === round - 1 ? 'bg-heat ring-4 ring-heat/25' : onDark ? 'bg-white/25' : 'bg-ink/15'
          }`}
        />
      ))}
    </span>
  );
}

/* ── The routine as one line ──────────────────────────────────────────────── */
type Seg = { index: number; dur: number; rest: boolean };
type Block = { label: string; tone: Tone; segs: Seg[] };

function buildBlocks(queue: RoutineItem[], timeline: TimelineSegment[]): Block[] {
  const blocks: Block[] = [];
  queue.forEach((item, index) => {
    const dur = Math.max(1, timeline[index]?.duration ?? 1);
    if (isExercise(item)) {
      const label = item.kind === 'warmup' ? 'Calentamiento' : `Ronda ${item.round}`;
      let block = blocks[blocks.length - 1];
      if (!block || block.label !== label) {
        block = { label, tone: item.kind === 'warmup' ? 'warm' : 'work', segs: [] };
        blocks.push(block);
      }
      block.segs.push({ index, dur, rest: false });
    } else if (item.kind === 'rest' && blocks.length > 0) {
      blocks[blocks.length - 1].segs.push({ index, dur, rest: true });
    }
  });
  return blocks;
}

function RoutineLine({
  blocks,
  currentIndex,
  itemProgress,
  compact = false,
}: {
  blocks: Block[];
  currentIndex: number;
  itemProgress: number;
  compact?: boolean;
}) {
  const fillOf = (seg: Seg) => (seg.index < currentIndex ? 1 : seg.index === currentIndex ? itemProgress : 0);
  const grow = (block: Block) => block.segs.reduce((acc, s) => acc + s.dur, 0);

  return (
    <div>
      <div className={`flex ${compact ? 'gap-1' : 'gap-2'}`}>
        {blocks.map((block) => (
          <div key={block.label} className={`flex min-w-0 ${compact ? 'gap-px' : 'gap-[3px]'}`} style={{ flexGrow: grow(block), flexBasis: 0 }}>
            {block.segs.map((seg) => {
              const fill = fillOf(seg);
              const now = seg.index === currentIndex;
              return (
                <div
                  key={seg.index}
                  className={`relative min-w-[2px] rounded-full ${compact ? 'h-1' : 'h-2.5'} ${compact ? 'bg-white/25' : 'bg-ink/10'}`}
                  style={{ flexGrow: seg.dur, flexBasis: 0 }}
                >
                  <div
                    key={now ? `now-${seg.index}` : 'still'}
                    className={`h-full rounded-full ${seg.rest ? 'bg-rest' : DOT[block.tone]} ${now ? 'transition-[width] duration-1000 ease-linear' : ''}`}
                    style={{ width: `${fill * 100}%` }}
                  />
                  {now && !compact && (
                    <span
                      aria-hidden="true"
                      className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-paper bg-ink shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-[left] duration-1000 ease-linear"
                      style={{ left: `${fill * 100}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {!compact && (
        <div className="mt-3 flex gap-2">
          {blocks.map((block) => {
            const first = block.segs[0]?.index ?? 0;
            const last = block.segs[block.segs.length - 1]?.index ?? 0;
            const here = currentIndex >= first && currentIndex <= last;
            const done = currentIndex > last;
            return (
              <p
                key={block.label}
                className={`flex min-w-0 items-center gap-1.5 text-[13px] font-semibold ${here ? 'text-ink' : done ? 'text-ink/35' : 'text-ink/55'}`}
                style={{ flexGrow: grow(block), flexBasis: 0 }}
              >
                {here && <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${DOT[block.tone]}`} />}
                <span className="truncate">{block.label}</span>
              </p>
            );
          })}
        </div>
      )}
    </div>
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
  const [dismissedAt, setDismissedAt] = useState(-1);
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

  // Where-you-are card: shown on every move, gone after a beat.
  const pending = announcementFor(queue, currentIndex);
  const announcement = dismissedAt === currentIndex ? null : pending;
  const pendingBig = pending?.big;
  useEffect(() => {
    const t = setTimeout(() => setDismissedAt(currentIndex), pendingBig ? 1500 : 2000);
    return () => clearTimeout(t);
  }, [currentIndex, pendingBig]);

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
  const activeMuscles = getActiveMuscles(currentItem, meta);
  const critical = timeLeft > 0 && timeLeft <= 3 && kind !== 'intro' && kind !== 'outro';
  const cheer = announcement ? null : cheerFor(queue, currentIndex, totalItemDuration - timeLeft, totalItemDuration);

  const total = totalSeconds ?? meta?.totalSeconds ?? 0;
  const remaining = Math.max(0, total - elapsedSeconds);
  const percent = kind === 'outro' ? 100 : Math.round((total > 0 ? Math.min(1, elapsedSeconds / total) : 0) * 100);
  const itemProgress =
    totalItemDuration > 0 ? Math.min(1, Math.max(0, (totalItemDuration - timeLeft) / totalItemDuration)) : 0;
  const blocks = buildBlocks(queue, timeline);
  const time = formatSeconds(timeLeft).replace(/^0(?=\d:)/, '');

  // What comes next: the next clip, how long until it starts, and the two after it.
  const upcoming = queue
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) => i > currentIndex && isExercise(q)) as { q: ExerciseItem; i: number }[];
  const nextUp = upcoming[0];
  const nextExercise: Exercise | undefined = nextUp?.q.exercise;
  const nextIn = nextUp
    ? timeLeft + timeline.slice(currentIndex + 1, nextUp.i).reduce((acc, seg) => acc + seg.duration, 0)
    : 0;
  const later = upcoming.slice(1, 4).map(({ q }) => q.exercise);

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
        className={`${iconButton} cursor-pointer list-none bg-white/15 text-white backdrop-blur-md hover:bg-white/25 lg:bg-ink/8 lg:text-ink lg:backdrop-blur-none lg:hover:bg-ink/15 [&::-webkit-details-marker]:hidden`}
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
    <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] text-white lg:px-8 lg:pt-6 lg:text-ink">
      <button
        type="button"
        onClick={onExit}
        className={`pointer-events-auto flex min-h-11 items-center gap-1 rounded-full bg-white/15 pl-2 pr-4 text-[15px] font-medium backdrop-blur-md hover:bg-white/25 lg:-ml-2 lg:bg-transparent lg:text-ink/70 lg:backdrop-blur-none lg:hover:bg-transparent lg:hover:text-ink ${FOCUS}`}
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
          className={`${iconButton} bg-white/15 backdrop-blur-md hover:bg-white/25 lg:bg-ink/8 lg:backdrop-blur-none lg:hover:bg-ink/15 ${beepEnabled ? '' : 'opacity-50'}`}
        >
          {beepEnabled ? <Bell className="h-5 w-5" aria-hidden="true" /> : <BellOff className="h-5 w-5" aria-hidden="true" />}
        </button>
        {menu}
      </div>
    </header>
  );

  const roundButton = (dark: boolean) =>
    `flex h-12 min-w-12 items-center justify-center rounded-full transition-colors disabled:opacity-30 ${
      dark ? 'text-white hover:bg-white/15' : 'bg-ink/8 text-ink hover:bg-ink/15'
    } ${FOCUS}`;

  const transport = (dark: boolean) => (
    <div className="flex items-center justify-center gap-4">
      {kind === 'rest' && onExtend ? (
        <button type="button" onClick={() => onExtend(10)} aria-label="Diez segundos más de descanso" className={`${roundButton(dark)} gap-0.5 px-4 text-[15px] font-semibold`}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          10 s
        </button>
      ) : (
        <button type="button" onClick={handlePrev} disabled={!onPrev || currentIndex <= 0} aria-label="Anterior" className={roundButton(dark)}>
          <SkipBack className="h-5 w-5 fill-current" aria-hidden="true" />
        </button>
      )}
      <motion.button
        type="button"
        onClick={onTogglePause}
        disabled={!onTogglePause}
        aria-label={isPaused ? 'Reanudar' : 'Pausar'}
        whileTap={{ scale: 0.9 }}
        className={`flex h-16 w-16 items-center justify-center rounded-full disabled:opacity-40 ${dark ? 'bg-white text-ink' : 'bg-ink text-white'} ${FOCUS}`}
      >
        {isPaused ? <Play className="ml-0.5 h-7 w-7 fill-current" aria-hidden="true" /> : <Pause className="h-7 w-7 fill-current" aria-hidden="true" />}
      </motion.button>
      {kind === 'rest' ? (
        <button type="button" onClick={handleNext} className={`${roundButton(dark)} px-4 text-[15px] font-semibold`}>
          Saltar
        </button>
      ) : (
        <button type="button" onClick={handleNext} aria-label="Siguiente" className={roundButton(dark)}>
          <SkipForward className="h-5 w-5 fill-current" aria-hidden="true" />
        </button>
      )}
    </div>
  );

  const fade = {
    initial: reduced ? false : ({ opacity: 0 } as const),
    animate: { opacity: 1 },
    exit: reduced ? undefined : { opacity: 0 },
    transition: { duration: 0.35, ease: EASE },
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

      {/* A word of encouragement */}
      <AnimatePresence>
        {cheer && !critical && (
          <motion.div
            key={cheer}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.8, rotate: -4 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotate: -2 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            className="pointer-events-none absolute inset-x-0 bottom-[34%] z-10 flex justify-center px-6 lg:bottom-[14%]"
          >
            <span className={`rounded-2xl px-5 py-3 text-[min(8cqw,2.25rem)] font-bold tracking-[-0.02em] shadow-[0_18px_40px_-18px_rgba(0,0,0,0.6)] ${SOLID[tone]}`}>
              {cheer}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WHERE YOU ARE: a full colour card on each new block, a small pill on every other move */}
      <div role="status" aria-live="polite" className="contents">
        <AnimatePresence>
          {announcement?.big ? (
            <motion.div
              key={`big-${currentIndex}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 1.04, filter: 'blur(6px)' }}
              transition={{ duration: 0.35, ease: EASE }}
              className={`pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center px-6 text-center backdrop-blur-md ${WASH[announcement.tone]}`}
            >
              <motion.span
                initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 24, delay: 0.05 }}
                className="mb-4 rounded-full border-2 border-current px-3 py-1 text-[13px] font-bold uppercase tracking-[0.14em] opacity-80"
              >
                {PHASE_NAME[announcement.tone]}
              </motion.span>
              <div className="overflow-hidden pb-2">
                <motion.p
                  initial={reduced ? false : { y: '110%' }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.6, ease: EASE, delay: 0.08 }}
                  className="text-[min(12cqw,4.5rem)] font-bold leading-[0.95] tracking-[-0.045em]"
                >
                  {announcement.title}
                </motion.p>
              </div>
              <motion.p
                initial={reduced ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 0.85, y: 0 }}
                transition={{ duration: 0.5, ease: EASE, delay: 0.22 }}
                className="mt-2 max-w-[85%] text-balance text-lg font-semibold"
              >
                {announcement.sub}
              </motion.p>
            </motion.div>
          ) : announcement ? (
            <motion.div
              key={`pill-${currentIndex}`}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="pointer-events-none absolute inset-x-0 top-28 z-20 flex justify-center px-4 lg:top-6"
            >
              <p className="flex max-w-full items-center gap-2.5 rounded-full bg-black/60 py-2.5 pl-3.5 pr-5 text-[15px] font-semibold text-white backdrop-blur-xl">
                <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[announcement.tone]}`} />
                <span className="shrink-0">{announcement.title}</span>
                <span className="truncate font-medium text-white/70">{announcement.sub}</span>
              </p>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );

  // Desktop: the frame around the video is the clock (it fills in the phase colour) and,
  // while resting, a light runs round it.
  const frameClass = kind === 'rest' ? 'stage-spin' : isExercise(currentItem) ? 'stage-ring' : '';
  const frameStyle = { '--ring': HEX[tone], '--p': itemProgress } as CSSProperties;
  const showMini = kind !== 'intro' && kind !== 'outro';

  return (
    <div className="fixed inset-0 overflow-hidden bg-black font-[family-name:var(--font-display)] text-ink lg:flex lg:flex-col lg:bg-paper">
      {header}

      <div className="h-full lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-14 lg:px-10 lg:pt-20 xl:gap-20">
        {/* NOW */}
        <section aria-label="Ahora" className="hidden min-w-0 flex-col justify-center gap-5 lg:flex">
          <div className="flex flex-wrap items-center gap-3">
            <PhaseBadge tone={tone} />
            {where.rounds > 0 && (
              <span className="flex items-center gap-2.5 text-[17px] font-semibold">
                Ronda {where.round} de {where.rounds}
                <RoundDots round={where.round} rounds={where.rounds} />
              </span>
            )}
          </div>
          <div className="overflow-hidden">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.h2
                key={title}
                initial={reduced ? false : { y: '100%', opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={reduced ? undefined : { y: '-60%', opacity: 0 }}
                transition={{ duration: 0.55, ease: EASE }}
                className={`text-balance text-[clamp(2.25rem,3.6vw,3.75rem)] font-semibold leading-[1.02] tracking-[-0.035em] ${kind === 'rest' ? 'text-rest' : ''}`}
              >
                {kind === 'summary' || kind === 'intro' ? (meta?.focusLabel ?? title) : title}
              </motion.h2>
            </AnimatePresence>
          </div>
          {where.of > 0 && (
            <div className="flex flex-col gap-2.5">
              <p className="text-xl font-medium text-ink/60">
                {kind === 'rest' ? `Hecho el ${where.n} de ${where.of}` : `Ejercicio ${where.n} de ${where.of}`}
              </p>
              <Ticks n={kind === 'rest' ? where.n + 1 : where.n} of={where.of} tone={kind === 'rest' ? 'work' : tone} />
            </div>
          )}
          {kind === 'summary' && meta && (
            <p className="text-xl font-medium text-ink/60">
              {Math.max(1, Math.round(meta.totalSeconds / 60))} min · {meta.rounds} rondas × {meta.circuit.length}
            </p>
          )}
          {kind !== 'intro' && <MarcelFigure muscles={activeMuscles} className="mt-1 h-[min(28vh,17rem)] self-start" />}
        </section>

        {/* THE VIDEO */}
        <div className="relative h-full lg:min-h-0 lg:py-1">
          {!reduced && tone !== 'calm' && (
            <motion.div
              aria-hidden="true"
              className="absolute -inset-10 hidden rounded-[80px] blur-3xl lg:block"
              style={{ background: HEX[tone] }}
              animate={{ opacity: [0.12, 0.26, 0.12], scale: [0.97, 1.02, 0.97] }}
              transition={{ duration: kind === 'rest' ? 6 : 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
          <div
            key={frameClass === 'stage-ring' ? `ring-${currentIndex}` : frameClass}
            className={`relative h-full lg:aspect-[9/16] lg:rounded-[34px] lg:p-[6px] ${frameClass}`}
            style={frameStyle}
          >
            {stage}
          </div>
        </div>

        {/* TIME AND WHAT'S NEXT */}
        <section aria-label="Tiempo" className="hidden min-w-0 flex-col items-center justify-center gap-7 lg:flex">
          {kind === 'outro' ? (
            <p className="text-[clamp(3rem,5vw,4.5rem)] font-bold tracking-[-0.04em]">100%</p>
          ) : (
            <div className="flex flex-col items-center">
              <RollingTime
                value={time}
                className={`text-[clamp(4.5rem,8vw,7.5rem)] font-bold leading-none tracking-[-0.05em] transition-colors ${critical ? 'text-heat' : 'text-ink'}`}
              />
              <span className="mt-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-ink/50">
                {kind === 'summary' ? 'Empieza en' : kind === 'rest' ? 'De descanso' : 'Quedan'}
              </span>
            </div>
          )}
          {nextExercise && kind !== 'outro' && (
            <div className="flex w-full max-w-72 flex-col gap-2">
              <div className="flex items-center gap-4 rounded-3xl bg-white/75 p-3 pr-5">
                <video
                  key={nextExercise.video_url}
                  src={`${nextExercise.video_url}#t=1`}
                  preload="auto"
                  muted
                  playsInline
                  aria-hidden="true"
                  className="aspect-[9/16] w-14 shrink-0 rounded-xl bg-ink/10 object-cover"
                />
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-ink/50">Siguiente</p>
                  <p className="truncate text-[17px] font-semibold leading-tight">{nextExercise.title}</p>
                  <p className="mt-0.5 text-[14px] font-medium tabular-nums text-ink/55">
                    en {formatSeconds(nextIn).replace(/^0(?=\d:)/, '')}
                  </p>
                </div>
              </div>
              {later.length > 0 && (
                <p className="truncate px-3 text-[14px] font-medium text-ink/45">Después: {later.map((e) => e.title).join(' · ')}</p>
              )}
            </div>
          )}
          {kind !== 'outro' && transport(false)}
        </section>
      </div>

      {/* DESKTOP: the whole routine as one line */}
      <footer
        className="hidden shrink-0 items-start gap-6 px-10 pb-7 pt-6 lg:flex"
        role="progressbar"
        aria-label="Progreso de la rutina"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <p className="w-20 shrink-0 text-[28px] font-bold leading-none tabular-nums tracking-[-0.03em]">
          {percent}
          <span className="text-lg text-ink/45">%</span>
        </p>
        <div className="min-w-0 flex-1 pt-2">
          <RoutineLine blocks={blocks} currentIndex={currentIndex} itemProgress={itemProgress} />
        </div>
        <p className="w-32 shrink-0 pt-1 text-right text-[15px] font-medium tabular-nums text-ink/55">
          Quedan {formatSeconds(remaining)}
        </p>
      </footer>

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
        <div className="absolute inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-center gap-2 rounded-[22px] bg-black/55 py-2 pl-4 pr-2 text-white backdrop-blur-xl lg:hidden">
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
    </div>
  );
}

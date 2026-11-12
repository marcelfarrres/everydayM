'use client';

import { useState, useRef, useEffect, useCallback, type RefObject } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Dumbbell,
  Eye,
  Film,
  Flame,
  Keyboard,
  Music,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  Smartphone,
  Sparkles,
  Timer,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getDifficultyLevel } from '@/lib/difficulty';
import { getExerciseMuscles } from '@/components/workout/MuscleSelector';
import {
  MUSCLE_LABELS,
  MiniMuscleMap,
} from '@/components/workout/MiniMuscleMap';
import { CountdownRing } from '@/components/workout/CountdownRing';
import {
  RoutineTimeline,
  formatSeconds,
} from '@/components/workout/RoutineTimeline';
import { TiktokSafeZoneOverlay } from '@/components/workout/TiktokCreatorModal';
import type {
  Exercise,
  MuscleSelection,
  PlaylistTrack,
  RoutineItem,
  RoutineMeta,
  TimelineSegment,
} from '@/types/workout';

interface WorkoutPlayerProps {
  queueLength: number;
  queue?: RoutineItem[];
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
  isPaused?: boolean;
  onTogglePause?: () => void;
  meta?: RoutineMeta | null;
  timeline?: TimelineSegment[];
  elapsedSeconds?: number;
  totalSeconds?: number;
  onVideoTimeUpdate: () => void;
  creatorMode?: boolean;
  onToggleCreatorMode?: () => void;
  onOpenTiktokModal?: () => void;
  creatorHandle?: string;
  onChangeCreatorHandle?: (handle: string) => void;
  showWatermark?: boolean;
  onToggleWatermark?: () => void;
  onRestartFromBeginning?: () => void;
}

function getActiveExercise(item: RoutineItem | undefined): Exercise | undefined {
  if (!item) return undefined;
  if (item.kind === 'rest') return item.nextExercise;
  if (item.kind === 'warmup' || item.kind === 'workout') return item.exercise;
  return undefined;
}

function getActiveMuscles(
  item: RoutineItem | undefined,
  meta?: RoutineMeta | null,
): MuscleSelection[] {
  if (!item) return meta?.muscles ?? [];
  if (item.kind === 'summary' || item.kind === 'outro') {
    return item.meta.muscles.length > 0 ? item.meta.muscles : (meta?.muscles ?? []);
  }
  const ex = item.kind === 'rest' ? item.nextExercise : item.exercise;
  return getExerciseMuscles(ex.muscles, ex.muscle);
}

function getPhaseBadgeText(item: RoutineItem | undefined, timeLeft: number): string {
  if (!item) return 'ENTRENAMIENTO';
  switch (item.kind) {
    case 'intro':
      return 'INTRODUCCIÓN';
    case 'summary':
      return 'RESUMEN DE RUTINA';
    case 'warmup':
      return 'CALENTAMIENTO';
    case 'workout':
      return `RONDA ${item.round}/${item.totalRounds} · EJ ${item.exerciseIndexInRound}/${item.totalExercisesPerRound}`;
    case 'rest': {
      const prepWindow = Math.max(3, item.prepSeconds || 3);
      if (timeLeft <= prepWindow) return '¡PREPÁRATE!';
      return item.isEndOfRound ? 'DESCANSO DE RONDA' : 'DESCANSO';
    }
    case 'outro':
      return '¡COMPLETADO!';
  }
}

export function WorkoutPlayer({
  queueLength,
  queue = [],
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
  isPaused = false,
  onTogglePause,
  meta,
  timeline,
  elapsedSeconds,
  totalSeconds,
  onVideoTimeUpdate,
  creatorMode = false,
  onToggleCreatorMode,
  onOpenTiktokModal,
  creatorHandle = '@everydaym',
  onChangeCreatorHandle,
  showWatermark = true,
  onToggleWatermark,
  onRestartFromBeginning,
}: WorkoutPlayerProps) {
  const prefersReducedMotion = useReducedMotion();
  const [beepEnabled, setBeepEnabled] = useState(true);
  const [showSafeZones, setShowSafeZones] = useState(false);
  const [recordingPhase, setRecordingPhase] = useState<
    'preroll' | 'countdown' | 'live'
  >('preroll');
  const [clapperCount, setClapperCount] = useState<number>(3);
  const [cursorIdle, setCursorIdle] = useState(false);

  const itemIndex = currentIndex;
  const activeIndexRef = useRef(currentIndex);
  const prevCreatorModeRef = useRef(creatorMode);

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

  // Pause routine while pre-roll overlay is shown in Creator Mode
  useEffect(() => {
    if (creatorMode && !prevCreatorModeRef.current) {
      if (!isPaused) {
        onTogglePause?.();
      }
    }
    prevCreatorModeRef.current = creatorMode;
  }, [creatorMode, isPaused, onTogglePause]);

  const enterCreatorMode = () => {
    setRecordingPhase('preroll');
    setClapperCount(3);
    onToggleCreatorMode?.();
  };

  // Clapperboard 3-2-1 countdown effect
  useEffect(() => {
    if (!creatorMode || recordingPhase !== 'countdown') return;

    if (clapperCount <= 0) {
      const goTimer = setTimeout(() => {
        setRecordingPhase('live');
        if (isPaused) {
          onTogglePause?.();
        }
      }, 120);
      return () => clearTimeout(goTimer);
    }

    const timer = setTimeout(() => {
      setClapperCount((prev) => prev - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [creatorMode, recordingPhase, clapperCount, isPaused, onTogglePause]);

  // Auto-hide cursor after 2s idle in Creator Mode
  useEffect(() => {
    if (!creatorMode) return;

    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    const resetIdle = () => {
      setCursorIdle(false);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        setCursorIdle(true);
      }, 2000);
    };

    resetIdle();
    window.addEventListener('mousemove', resetIdle);
    window.addEventListener('mousedown', resetIdle);

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      window.removeEventListener('mousemove', resetIdle);
      window.removeEventListener('mousedown', resetIdle);
    };
  }, [creatorMode]);

  // Keyboard shortcuts in Creator Mode
  useEffect(() => {
    if (!creatorMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        onTogglePause?.();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        onToggleMusic();
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setShowSafeZones((prev) => !prev);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onToggleCreatorMode?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    creatorMode,
    onTogglePause,
    handleNext,
    handlePrev,
    onToggleMusic,
    onToggleCreatorMode,
  ]);

  const startClapperboardRecording = () => {
    setShowSafeZones(false);
    onRestartFromBeginning?.();
    setClapperCount(3);
    setRecordingPhase('countdown');
  };

  const handleTogglePiP = async () => {
    const videoEl = videoRef.current;
    if (!videoEl || typeof document === 'undefined') return;

    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await videoEl.requestPictureInPicture();
      }
    } catch {
      // Ignore if browser does not support PiP in current state
    }
  };

  const activeExercise = getActiveExercise(currentItem);
  const activeMuscles = getActiveMuscles(currentItem, meta);
  const phaseLabel = getPhaseBadgeText(currentItem, timeLeft);

  const isRestPrepPhase =
    currentItem?.kind === 'rest' &&
    timeLeft <= Math.max(3, currentItem.prepSeconds || 3);

  const upcomingItems = queue
    .slice(currentIndex + 1)
    .filter(
      (it): it is Extract<RoutineItem, { kind: 'warmup' | 'workout' | 'outro' }> =>
        it.kind === 'warmup' || it.kind === 'workout' || it.kind === 'outro',
    )
    .slice(0, 4);

  const formattedHandle = creatorHandle.trim()
    ? creatorHandle.trim().startsWith('@')
      ? creatorHandle.trim()
      : `@${creatorHandle.trim()}`
    : '@everydaym';

  // Safe-zone padding classes when Creator Mode is active
  // Note: CSS percentage padding is relative to width (9:16), so pt-[30%] = ~16.8% height (below top 12% + watermark) and pb-[37%] = ~20.8% height (above bottom 20%).
  const safeZonePadding = creatorMode
    ? 'pt-[30%] pb-[37%] pl-5 pr-[17.5%]'
    : 'p-5 sm:p-6';

  return (
    <div
      className={
        creatorMode
          ? `fixed inset-0 z-40 bg-[#050706] flex items-center justify-center overflow-hidden select-none ${
              cursorIdle && recordingPhase === 'live' ? 'cursor-none' : ''
            }`
          : 'w-full max-w-[1440px] mx-auto flex flex-col lg:flex-row items-center lg:items-stretch justify-center gap-4 lg:gap-7 px-1 sm:px-4'
      }
    >
      {/* MOBILE HEADER (< lg) — Hidden in Creator Mode */}
      {!creatorMode && (
        <div className="w-full max-w-[420px] flex lg:hidden flex-col gap-2.5">
          <div className="w-full flex justify-between items-center gap-2">
            <button
              type="button"
              onClick={onExit}
              className="text-xs font-bold text-neutral-200 hover:text-white flex items-center gap-1.5 bg-[#141b16] px-3 py-2 rounded-xl border border-[#22c55e]/30"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#4ade80]" /> Salir
            </button>

            <span className="text-xs font-black tracking-wider uppercase bg-[#141b16] border border-[#22c55e]/35 px-3 py-1.5 rounded-full text-[#4ade80]">
              {currentIndex + 1} / {Math.max(1, queueLength)}
            </span>

            <div className="flex items-center gap-1.5">
              {onToggleCreatorMode && (
                <button
                  type="button"
                  onClick={enterCreatorMode}
                  className="p-2 rounded-xl border border-[#22c55e]/45 bg-[#162219] text-[#4ade80] hover:bg-[#22c55e] hover:text-black transition-colors"
                  title="Modo Creador TikTok 9:16"
                  aria-label="Activar Modo Creador TikTok 9:16"
                >
                  <Smartphone className="w-4 h-4" />
                </button>
              )}

              {onOpenTiktokModal && (
                <button
                  type="button"
                  onClick={onOpenTiktokModal}
                  className="p-2 rounded-xl border border-[#22c55e]/45 bg-[#162219] text-[#4ade80] hover:bg-[#22c55e] hover:text-black transition-colors"
                  title="Resumen TikTok 14s y Exportar MP4"
                  aria-label="Abrir Resumen TikTok 14s"
                >
                  <Clapperboard className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => setBeepEnabled((prev) => !prev)}
                className={`p-2 rounded-xl border transition-colors ${
                  beepEnabled
                    ? 'bg-[#22c55e]/20 border-[#22c55e]/60 text-[#4ade80]'
                    : 'bg-[#141b16] border-white/15 text-neutral-400'
                }`}
                title="Pitido de cuenta atrás (3-2-1)"
                aria-label="Alternar pitido de cuenta atrás"
                aria-pressed={beepEnabled}
              >
                {beepEnabled ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>

              <button
                type="button"
                onClick={onToggleMusic}
                className={`p-2 rounded-xl border transition-colors ${
                  musicPlaying
                    ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#4ade80]'
                    : 'bg-[#141b16] border-white/15 text-neutral-400'
                }`}
                title="Música de fondo"
                aria-label="Alternar música de fondo"
                aria-pressed={musicPlaying}
              >
                <Music className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Compact Whole-Routine Timeline on Mobile */}
          {queue.length > 0 && (
            <RoutineTimeline
              queue={queue}
              timeline={timeline}
              currentIndex={currentIndex}
              timeLeft={timeLeft}
              totalItemDuration={totalItemDuration}
              elapsedSeconds={elapsedSeconds}
              totalSeconds={totalSeconds ?? meta?.totalSeconds}
              variant="compact"
            />
          )}
        </div>
      )}

      {/* MAIN 9:16 STAGE */}
      <div
        data-testid="workout-stage-916"
        className={
          creatorMode
            ? 'relative h-screen w-auto aspect-[9/16] bg-[#080b09] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.98)] shrink-0'
            : 'relative w-full max-w-[420px] lg:max-w-none lg:w-auto lg:h-[85vh] lg:max-h-[880px] lg:min-h-[620px] aspect-[9/16] bg-[#0c110e] rounded-[32px] overflow-hidden border border-[#22c55e]/35 shadow-[0_24px_70px_rgba(0,0,0,0.9)] shrink-0'
        }
      >
        {/* TikTok Safe Zone Overlay Guide (Toggle with G) */}
        <TiktokSafeZoneOverlay visible={creatorMode && showSafeZones} />

        {/* Optional Creator Watermark Pill inside Safe Zone */}
        {creatorMode && showWatermark && (
          <div className="pointer-events-none absolute top-[13%] left-5 z-30">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#22c55e]/45 bg-black/75 px-3 py-1 text-[11px] font-black tracking-wider text-[#4ade80] backdrop-blur-md shadow-[0_4px_16px_rgba(0,0,0,0.6)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" />
              {formattedHandle}
            </span>
          </div>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {/* 1. INTRO SCREEN */}
          {currentItem?.kind === 'intro' ? (
            <motion.div
              key={`intro-${currentIndex}`}
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-full h-full"
            >
              <video
                key={currentItem.exercise.video_url}
                ref={(el) => {
                  if (activeIndexRef.current === itemIndex) {
                    videoRef.current = el;
                  }
                }}
                src={currentItem.exercise.video_url}
                autoPlay
                playsInline
                muted={false}
                onTimeUpdate={(e) => {
                  if (
                    activeIndexRef.current !== itemIndex ||
                    e.currentTarget.paused
                  ) {
                    e.currentTarget.pause();
                    return;
                  }
                  if (e.currentTarget.volume !== 1.0) {
                    e.currentTarget.volume = 1.0;
                  }
                  onVideoTimeUpdate();
                  if (e.currentTarget.currentTime >= 10) handleNext();
                }}
                onEnded={() => {
                  if (activeIndexRef.current === itemIndex) {
                    handleNext();
                  }
                }}
                className="w-full h-full object-cover"
              />

              <div
                className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/80 flex flex-col items-center justify-center text-center pointer-events-none ${safeZonePadding}`}
              >
                <span className="text-xs font-black uppercase tracking-[0.35em] text-[#4ade80] mb-3 animate-pulse drop-shadow-md">
                  Iniciando Sistema
                </span>
                <h2
                  aria-label="Everyday M"
                  className="flex flex-col items-center text-center font-sans drop-shadow-[0_0_25px_rgba(34,197,94,0.6)]"
                >
                  <span
                    aria-hidden="true"
                    className="text-[clamp(2.5rem,8vw,4.25rem)] font-black uppercase italic leading-[0.84] tracking-[-0.06em] text-white"
                  >
                    EVERYDAY
                  </span>
                  <span
                    aria-hidden="true"
                    className="mt-2 flex items-center justify-center gap-2 text-[clamp(5rem,14vw,7rem)] font-extralight leading-[0.78] tracking-[-0.04em]"
                  >
                    <span className="bg-gradient-to-b from-[#4ade80] to-[#22c55e] bg-clip-text text-transparent">
                      M
                    </span>
                    <span className="bg-gradient-to-b from-white to-[#4ade80] bg-clip-text text-transparent">
                      M
                    </span>
                  </span>
                </h2>

                {meta?.focusLabel && (
                  <p className="mt-5 rounded-full border border-[#22c55e]/40 bg-black/60 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-neutral-200 backdrop-blur-md">
                    {meta.focusLabel}
                  </p>
                )}

                <div
                  className={`w-48 h-2 bg-white/15 rounded-full overflow-hidden backdrop-blur-sm mt-8`}
                >
                  <div className="h-full bg-[#4ade80] animate-[progress_10s_linear_forwards]" />
                </div>
              </div>
            </motion.div>
          ) : currentItem?.kind === 'summary' ? (
            /* 2. SUMMARY SCREEN (Animated overview over meta.background) */
            <motion.div
              key={`summary-${currentIndex}`}
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.35 }}
              className={`relative w-full h-full flex flex-col justify-between overflow-y-auto ${safeZonePadding}`}
            >
              {(currentItem.meta.background?.video_url ||
                currentItem.exercise?.video_url) && (
                <video
                  key={
                    currentItem.meta.background?.video_url ||
                    currentItem.exercise.video_url
                  }
                  src={
                    currentItem.meta.background?.video_url ||
                    currentItem.exercise.video_url
                  }
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover opacity-35 pointer-events-none"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-[#080b09]/90 via-[#0c140f]/85 to-[#080b09]/95 pointer-events-none" />

              <div className="relative z-10 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#22c55e]/40 bg-[#142018]/90 px-3 py-1 text-xs font-black uppercase tracking-wider text-[#4ade80]">
                  <Sparkles className="w-3.5 h-3.5" /> Resumen de Rutina
                </span>
                <span className="rounded-full bg-black/70 border border-white/15 px-3 py-1 text-xs font-black text-white tabular-nums">
                  Empieza en {timeLeft}s
                </span>
              </div>

              <div className="relative z-10 my-auto space-y-3 py-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-[#4ade80]">
                    Objetivo de hoy
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tight text-white leading-tight">
                    {currentItem.meta.focusLabel || 'Entrenamiento Completo'}
                  </h2>
                </div>

                {/* Key Metrics */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-2xl border border-[#22c55e]/30 bg-[#111914]/90 p-2.5 text-center backdrop-blur-md">
                    <span className="block text-lg sm:text-xl font-black text-white">
                      {Math.max(1, Math.round(currentItem.meta.totalSeconds / 60))}m
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                      Duración
                    </span>
                  </div>
                  <div className="rounded-2xl border border-[#22c55e]/30 bg-[#111914]/90 p-2.5 text-center backdrop-blur-md">
                    <span className="block text-lg sm:text-xl font-black text-[#4ade80]">
                      {currentItem.meta.rounds}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                      Rondas
                    </span>
                  </div>
                  <div className="rounded-2xl border border-[#22c55e]/30 bg-[#111914]/90 p-2.5 text-center backdrop-blur-md">
                    <span className="block text-lg sm:text-xl font-black text-white">
                      {currentItem.meta.exercisesPerRound}
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                      Ejercicios
                    </span>
                  </div>
                </div>

                {/* Targeted Muscle Map */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/15 bg-[#101712]/90 p-3 backdrop-blur-md">
                  <div className="space-y-1.5">
                    <span className="text-xs font-black uppercase tracking-wider text-neutral-200 block">
                      Mapa Muscular
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {currentItem.meta.muscles.slice(0, 5).map((m) => (
                        <span
                          key={m.id}
                          className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase ${
                            m.role === 'primary'
                              ? 'bg-[#22c55e] text-black'
                              : 'bg-yellow-400/20 text-yellow-200 border border-yellow-400/40'
                          }`}
                        >
                          {MUSCLE_LABELS[m.id]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <MiniMuscleMap
                    muscles={currentItem.meta.muscles}
                    size="sm"
                    className="shrink-0"
                  />
                </div>

                {/* Cascading Exercise List */}
                <div className="space-y-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-neutral-300 block">
                    Circuito ({currentItem.meta.circuit.length} ejercicios)
                  </span>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {currentItem.meta.circuit.map((ex, idx) => (
                      <motion.div
                        key={`${ex.id}-${idx}`}
                        initial={
                          prefersReducedMotion
                            ? false
                            : { opacity: 0, x: -16 }
                        }
                        animate={{ opacity: 1, x: 0 }}
                        transition={{
                          duration: 0.28,
                          delay: prefersReducedMotion ? 0 : idx * 0.07,
                        }}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/65 px-3 py-2 backdrop-blur-sm"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[#22c55e] text-xs font-black text-black">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold uppercase text-white truncate">
                            {ex.title}
                          </span>
                        </div>
                        <span className="shrink-0 rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase text-[#4ade80]">
                          {ex.muscle}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>

              {!creatorMode && (
                <div className="relative z-10 pt-2">
                  <button
                    type="button"
                    onClick={handleNext}
                    className="w-full rounded-2xl bg-[#22c55e] hover:bg-[#4ade80] py-3 text-xs font-black uppercase tracking-widest text-black shadow-[0_8px_24px_rgba(34,197,94,0.4)] transition-all"
                  >
                    Empezar Ahora
                  </button>
                </div>
              )}
            </motion.div>
          ) : currentItem?.kind === 'rest' ? (
            /* 3. REST & "¡PREPÁRATE 3-2-1 ¡YA!!" SCREEN */
            <motion.div
              key={`rest-${currentIndex}`}
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.28 }}
              className={`relative w-full h-full flex flex-col justify-between overflow-hidden ${safeZonePadding}`}
            >
              {/* Full-bleed looping muted preview of nextExercise */}
              <video
                key={currentItem.nextExercise.video_url}
                src={currentItem.nextExercise.video_url}
                autoPlay
                loop
                muted
                playsInline
                className="absolute inset-0 w-full h-full object-cover opacity-55 pointer-events-none scale-105"
              />
              <div
                className={`absolute inset-0 transition-colors duration-500 pointer-events-none ${
                  isRestPrepPhase
                    ? 'bg-gradient-to-b from-black/85 via-[#241208]/75 to-black/95'
                    : 'bg-gradient-to-b from-[#080d0a]/85 via-[#0c1610]/70 to-[#080d0a]/95'
                }`}
              />

              {/* Top Header */}
              <div className="relative z-10 flex items-center justify-between gap-2">
                <span
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border text-xs font-black uppercase tracking-wider backdrop-blur-md ${
                    isRestPrepPhase
                      ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.4)]'
                      : 'bg-[#152319]/90 border-[#22c55e]/40 text-[#4ade80]'
                  }`}
                >
                  <Timer className="w-4 h-4" />
                  {isRestPrepPhase
                    ? '¡PREPÁRATE!'
                    : currentItem.isEndOfRound
                      ? 'Fin de Ronda · Descanso'
                      : 'Descanso'}
                </span>
                <span className="text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-black/70 text-white border border-white/15 backdrop-blur-md">
                  Ronda {currentItem.nextRound} / {currentItem.totalRounds}
                </span>
              </div>

              {/* Center Countdown / Prepárate 3-2-1 ¡YA! */}
              <div className="relative z-10 flex flex-col items-center justify-center my-auto py-2">
                <div className={creatorMode ? 'block' : 'lg:hidden'}>
                  <CountdownRing
                    timeLeft={timeLeft}
                    totalDuration={totalItemDuration}
                    label={isRestPrepPhase ? '¡PREPÁRATE!' : 'DESCANSO'}
                    size={creatorMode ? 136 : 148}
                    strokeWidth={9}
                    soundEnabled={beepEnabled}
                    isPaused={isPaused}
                    isPrepPhase={isRestPrepPhase}
                  />
                </div>
                {!creatorMode && (
                  <div className="hidden lg:flex flex-col items-center">
                    <span
                      className={`text-7xl font-black tracking-tighter tabular-nums font-sans ${
                        timeLeft <= 3
                          ? 'text-red-400 drop-shadow-[0_0_25px_rgba(239,68,68,0.65)]'
                          : isRestPrepPhase
                            ? 'text-amber-300 drop-shadow-[0_0_25px_rgba(245,158,11,0.5)]'
                            : 'text-white drop-shadow-[0_0_25px_rgba(34,197,94,0.35)]'
                      }`}
                    >
                      {timeLeft}s
                    </span>
                  </div>
                )}

                {isRestPrepPhase && (
                  <motion.div
                    initial={prefersReducedMotion ? false : { scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="mt-3 flex flex-col items-center gap-2 rounded-2xl border border-amber-400/50 bg-black/80 px-4 py-2.5 backdrop-blur-md shadow-[0_0_25px_rgba(245,158,11,0.3)]"
                  >
                    <span className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">
                      PREPÁRATE · 3 - 2 - 1 · ¡YA!
                    </span>
                    <div className="flex items-center gap-2">
                      {[3, 2, 1].map((num) => {
                        const active = timeLeft === num;
                        const passed = timeLeft < num;
                        return (
                          <span
                            key={num}
                            className={`flex h-9 w-9 items-center justify-center rounded-xl font-black text-base transition-all ${
                              active
                                ? 'bg-red-500 text-white scale-110 shadow-[0_0_15px_rgba(239,68,68,0.8)]'
                                : passed
                                  ? 'bg-[#22c55e] text-black'
                                  : 'bg-white/10 text-neutral-300'
                            }`}
                          >
                            {num}
                          </span>
                        );
                      })}
                      <span
                        className={`rounded-xl px-3 py-1.5 text-sm font-black uppercase tracking-wider ${
                          timeLeft <= 1
                            ? 'bg-[#22c55e] text-black shadow-[0_0_16px_rgba(34,197,94,0.8)]'
                            : 'bg-white/10 text-neutral-300'
                        }`}
                      >
                        ¡YA!
                      </span>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Next Exercise BIG Preview Card */}
              <div className="relative z-10 w-full rounded-3xl border border-[#22c55e]/40 bg-[#0d1410]/95 p-3.5 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-xs font-black uppercase tracking-widest text-[#4ade80]">
                    Siguiente Ejercicio
                  </span>
                  <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-[#22c55e]/20 text-[#4ade80] border border-[#22c55e]/30">
                    {currentItem.nextExercise.muscle}
                  </span>
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight text-white leading-snug mb-2.5">
                  {currentItem.nextExercise.title}
                </h3>
                <div className="relative w-full h-36 sm:h-40 rounded-2xl overflow-hidden bg-black border border-white/15 shadow-inner">
                  <video
                    key={`card-${currentItem.nextExercise.video_url}`}
                    src={currentItem.nextExercise.video_url}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover pointer-events-none"
                  />
                  <div className="absolute bottom-2 right-2 rounded-lg bg-black/75 px-2.5 py-1 text-xs font-bold text-neutral-200 backdrop-blur-sm">
                    Vista previa en vivo
                  </div>
                </div>
              </div>
            </motion.div>
          ) : currentItem?.kind === 'outro' ? (
            /* 4. OUTRO / COMPLETION SCREEN (clean hold in Creator Mode for trimming) */
            <motion.div
              key={`outro-${currentIndex}`}
              initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.35 }}
              className={`relative w-full h-full flex flex-col justify-between text-center overflow-y-auto ${safeZonePadding}`}
            >
              {(currentItem.meta.background?.video_url ||
                currentItem.exercise?.video_url) && (
                <video
                  key={
                    currentItem.meta.background?.video_url ||
                    currentItem.exercise.video_url
                  }
                  src={
                    currentItem.meta.background?.video_url ||
                    currentItem.exercise.video_url
                  }
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="absolute inset-0 w-full h-full object-cover opacity-30 pointer-events-none"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-[#080b09]/90 via-[#0e1b12]/85 to-[#080b09]/95 pointer-events-none" />

              <div className="relative z-10 pt-2">
                <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl border border-[#4ade80]/50 bg-[#22c55e]/20 shadow-[0_0_30px_rgba(34,197,94,0.45)]">
                  <Trophy className="h-8 w-8 text-[#4ade80]" />
                </div>
                <span className="text-xs font-black uppercase tracking-[0.25em] text-[#4ade80]">
                  ¡Objetivo Cumplido!
                </span>
                <h2 className="mt-1 text-2xl sm:text-3xl font-black uppercase italic tracking-tight text-white">
                  Entrenamiento Completado
                </h2>
                <p className="mt-1 text-xs font-semibold text-neutral-300">
                  {currentItem.meta.focusLabel}
                </p>
              </div>

              <div className="relative z-10 my-auto space-y-3 py-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-2xl border border-[#22c55e]/30 bg-[#111914]/90 p-3">
                    <span className="block text-lg font-black text-white">
                      {formatSeconds(currentItem.meta.totalSeconds)}
                    </span>
                    <span className="text-[11px] font-bold uppercase text-neutral-300">
                      Tiempo Total
                    </span>
                  </div>
                  <div className="rounded-2xl border border-[#22c55e]/30 bg-[#111914]/90 p-3">
                    <span className="block text-lg font-black text-[#4ade80]">
                      {currentItem.meta.rounds}
                    </span>
                    <span className="text-[11px] font-bold uppercase text-neutral-300">
                      Rondas
                    </span>
                  </div>
                  <div className="rounded-2xl border border-[#22c55e]/30 bg-[#111914]/90 p-3">
                    <span className="block text-lg font-black text-white">
                      {currentItem.meta.rounds * currentItem.meta.exercisesPerRound}
                    </span>
                    <span className="text-[11px] font-bold uppercase text-neutral-300">
                      Series
                    </span>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/15 bg-[#101712]/90 p-3 flex flex-col items-center">
                  <span className="text-xs font-black uppercase tracking-wider text-neutral-200 mb-2">
                    Músculos Trabajados
                  </span>
                  <MiniMuscleMap
                    muscles={currentItem.meta.muscles}
                    size="sm"
                    showLegend
                  />
                </div>
              </div>

              {creatorMode ? (
                <div className="relative z-10 pt-2">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#4ade80]/50 bg-[#22c55e]/20 px-5 py-2 text-xs font-black uppercase tracking-widest text-[#4ade80]">
                    Guarda esta rutina · {formattedHandle}
                  </div>
                </div>
              ) : (
                <div className="relative z-10 flex flex-col gap-2.5">
                  {onRepeat && (
                    <button
                      type="button"
                      onClick={onRepeat}
                      className="w-full rounded-2xl bg-[#22c55e] hover:bg-[#4ade80] py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-[0_10px_25px_rgba(34,197,94,0.4)] transition-all flex items-center justify-center gap-2"
                    >
                      <RotateCcw className="w-4 h-4" /> Repetir Rutina
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onExit}
                    className="w-full rounded-2xl border border-white/20 bg-[#141b16] hover:bg-[#1c261f] py-3.5 text-xs font-black uppercase tracking-widest text-white transition-all"
                  >
                    Salir al Configurador
                  </button>
                </div>
              )}
            </motion.div>
          ) : (
            /* 5. WORKOUT & WARMUP VIDEO SCREEN */
            <motion.div
              key={`exercise-${currentIndex}-${currentItem?.exercise.id ?? 'none'}`}
              initial={prefersReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={prefersReducedMotion ? undefined : { opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="relative w-full h-full"
            >
              <video
                key={currentItem?.exercise.video_url}
                ref={(el) => {
                  if (activeIndexRef.current === itemIndex) {
                    videoRef.current = el;
                  }
                }}
                src={currentItem?.exercise.video_url}
                autoPlay
                playsInline
                muted={true}
                onTimeUpdate={(e) => {
                  if (
                    activeIndexRef.current !== itemIndex ||
                    e.currentTarget.paused
                  ) {
                    e.currentTarget.pause();
                    return;
                  }
                  onVideoTimeUpdate();
                }}
                onEnded={() => {
                  if (activeIndexRef.current === itemIndex) {
                    handleNext();
                  }
                }}
                className="w-full h-full object-cover"
              />

              {/* Top Overlay (respects TikTok top 12% & right 16% safe zones in Creator Mode) */}
              <div
                className={`absolute flex justify-between items-center pointer-events-none ${
                  creatorMode
                    ? 'top-[17%] left-5 right-[17.5%]'
                    : 'top-4 left-4 right-4'
                }`}
              >
                {currentItem?.kind === 'workout' ? (
                  <span className="text-xs font-black uppercase tracking-wider px-3.5 py-1.5 rounded-full bg-[#101913]/90 border border-[#22c55e]/45 text-[#4ade80] backdrop-blur-md shadow-md">
                    Ronda {currentItem.round}/{currentItem.totalRounds} · Ej{' '}
                    {currentItem.exerciseIndexInRound}/
                    {currentItem.totalExercisesPerRound}
                  </span>
                ) : (
                  <span className="text-xs font-black uppercase tracking-wider px-3.5 py-1.5 rounded-full bg-amber-500/25 border border-amber-400/50 text-amber-200 backdrop-blur-md flex items-center gap-1.5 shadow-md">
                    <Flame className="w-3.5 h-3.5 text-amber-300" /> Calentamiento
                  </span>
                )}

                <div className="flex items-center gap-2 pointer-events-auto">
                  {!creatorMode && (
                    <button
                      type="button"
                      onClick={handleTogglePiP}
                      title="Modo Picture-in-Picture"
                      aria-label="Activar modo Picture-in-Picture"
                      className="bg-black/75 backdrop-blur-md p-2 rounded-full border border-[#22c55e]/40 text-[#4ade80] hover:bg-black/90 transition-colors"
                    >
                      <PictureInPicture2 className="w-4 h-4" />
                    </button>
                  )}
                  <div
                    className={`px-3.5 py-1.5 rounded-full border text-sm font-black tabular-nums backdrop-blur-md pointer-events-none transition-colors ${
                      timeLeft <= 3 && timeLeft > 0
                        ? 'bg-red-600/80 border-red-300 text-white animate-pulse'
                        : 'bg-black/75 border-[#22c55e]/45 text-[#4ade80]'
                    }`}
                  >
                    {timeLeft}s
                  </div>
                </div>
              </div>

              {/* Bottom Exercise Info Overlay (respects TikTok bottom 20% & right 16% safe zones in Creator Mode) */}
              <div
                className={`absolute left-0 right-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-none ${
                  creatorMode
                    ? 'bottom-0 pt-10 pb-[37%] pl-5 pr-[17.5%]'
                    : 'bottom-0 p-6'
                }`}
              >
                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-white leading-snug drop-shadow-md">
                  {currentItem?.exercise.title}
                </h2>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {activeMuscles.length > 0 ? (
                    activeMuscles.slice(0, 3).map((m) => (
                      <span
                        key={m.id}
                        className={`text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                          m.role === 'primary'
                            ? 'bg-[#22c55e] text-black'
                            : 'bg-yellow-400/25 text-yellow-200 border border-yellow-400/40'
                        }`}
                      >
                        {MUSCLE_LABELS[m.id]}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-lg bg-[#22c55e] text-black">
                      {currentItem?.exercise.muscle}
                    </span>
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg bg-white/20 text-white backdrop-blur-md">
                    Dificultad {getDifficultyLevel(currentItem?.exercise.difficulty)}
                    /10
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CREATOR MODE PRE-ROLL & 3-2-1 CLAPPERBOARD OVERLAY */}
        {creatorMode && recordingPhase !== 'live' && (
          <div className="absolute inset-0 z-50 bg-[#060907]/95 backdrop-blur-xl flex flex-col justify-between p-6 text-left">
            {recordingPhase === 'countdown' ? (
              <div className="my-auto flex flex-col items-center justify-center text-center space-y-4">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#4ade80]/50 bg-[#22c55e]/15 px-4 py-1.5 text-xs font-black uppercase tracking-[0.25em] text-[#4ade80]">
                  <Clapperboard className="w-4 h-4" /> Claqueta OBS · 9:16
                </span>
                <span className="text-8xl font-black text-white tabular-nums drop-shadow-[0_0_40px_rgba(34,197,94,0.85)]">
                  {clapperCount > 0 ? clapperCount : '¡YA!'}
                </span>
                <p className="text-xs font-bold uppercase tracking-widest text-neutral-300">
                  Grabando sin botones ni cursor · Pulsa Esc para salir
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.22em] text-[#4ade80]">
                      <Smartphone className="w-3.5 h-3.5" /> Modo Creador TikTok
                      9:16
                    </span>
                    <button
                      type="button"
                      onClick={onToggleCreatorMode}
                      className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-bold text-neutral-300 hover:text-white"
                    >
                      Salir (Esc)
                    </button>
                  </div>
                  <h3 className="text-2xl font-black uppercase italic tracking-tight text-white">
                    Escenario Limpio para OBS
                  </h3>
                  <p className="text-xs text-neutral-300 leading-relaxed">
                    Sin botones en pantalla, zonas seguras de TikTok respetadas,
                    cursor oculto tras 2s y música desactivada por defecto para
                    que añadas audio tendencia en TikTok.
                  </p>
                </div>

                {/* Watermark & Safe-Zone Controls */}
                <div className="space-y-3 my-auto py-3">
                  <div className="rounded-2xl border border-[#22c55e]/30 bg-[#0d1410] p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase tracking-wider text-[#4ade80]">
                        Marca de Agua (@usuario)
                      </span>
                      <button
                        type="button"
                        onClick={onToggleWatermark}
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${
                          showWatermark
                            ? 'bg-[#22c55e] text-black'
                            : 'bg-white/10 text-neutral-300'
                        }`}
                      >
                        {showWatermark ? 'Activa' : 'Oculta'}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={creatorHandle}
                      onChange={(e) => onChangeCreatorHandle?.(e.target.value)}
                      placeholder="@everydaym"
                      aria-label="Usuario de marca de agua en Modo Creador"
                      className="w-full rounded-xl border border-white/15 bg-black/60 px-3 py-2 text-xs font-bold text-white focus:border-[#4ade80] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSafeZones((prev) => !prev)}
                      className="w-full rounded-xl border border-[#22c55e]/35 bg-[#152219] py-2 text-xs font-black uppercase tracking-wider text-[#4ade80] flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {showSafeZones
                        ? 'Ocultar Guía Zonas Seguras (G)'
                        : 'Previsualizar Zonas Seguras TikTok (G)'}
                    </button>
                  </div>

                  {/* Keyboard Shortcuts Card */}
                  <div className="rounded-2xl border border-white/10 bg-[#0d1410] p-3.5 space-y-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-neutral-200 flex items-center gap-1.5">
                      <Keyboard className="w-3.5 h-3.5 text-[#4ade80]" /> Atajos
                      Invisibles durante la grabación
                    </span>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div className="rounded-lg bg-black/50 px-2.5 py-1.5 text-neutral-300">
                        <strong className="text-[#4ade80]">Espacio:</strong>{' '}
                        Pausa / Play
                      </div>
                      <div className="rounded-lg bg-black/50 px-2.5 py-1.5 text-neutral-300">
                        <strong className="text-[#4ade80]">← / →:</strong>{' '}
                        Anterior / Sig.
                      </div>
                      <div className="rounded-lg bg-black/50 px-2.5 py-1.5 text-neutral-300">
                        <strong className="text-[#4ade80]">M:</strong> Música (
                        {musicPlaying ? 'ON' : 'OFF'})
                      </div>
                      <div className="rounded-lg bg-black/50 px-2.5 py-1.5 text-neutral-300">
                        <strong className="text-[#4ade80]">G / Esc:</strong>{' '}
                        Guía / Salir
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action CTAs */}
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={startClapperboardRecording}
                    className="w-full rounded-2xl bg-[#22c55e] hover:bg-[#4ade80] py-3.5 text-xs font-black uppercase tracking-widest text-black shadow-[0_10px_30px_rgba(34,197,94,0.45)] transition-all flex items-center justify-center gap-2"
                  >
                    <Clapperboard className="w-4 h-4" />
                    Empezar Grabación (3-2-1)
                  </button>

                  {onOpenTiktokModal && (
                    <button
                      type="button"
                      onClick={onOpenTiktokModal}
                      className="w-full rounded-2xl border border-[#22c55e]/40 bg-[#142018] hover:bg-[#1b2b20] py-2.5 text-xs font-black uppercase tracking-wider text-[#4ade80] flex items-center justify-center gap-1.5"
                    >
                      <Film className="w-3.5 h-3.5" />
                      Ver Resumen 14s / Exportar MP4
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* MOBILE TRANSPORT CONTROLS (< lg) — Hidden in Creator Mode */}
      {!creatorMode && (
        <div className="w-full max-w-[420px] grid lg:hidden grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={handlePrev}
            disabled={!onPrev || currentIndex <= 0}
            className="py-3.5 bg-[#141b16] hover:bg-[#1b251e] border border-white/15 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 text-neutral-200 disabled:opacity-35"
          >
            <ChevronLeft className="w-4 h-4 text-[#4ade80]" /> Anterior
          </button>

          {onTogglePause ? (
            <button
              type="button"
              onClick={onTogglePause}
              className="py-3.5 bg-[#1b261e] hover:bg-[#233227] border border-[#22c55e]/40 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 text-[#4ade80]"
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4 fill-[#4ade80]" /> Reanudar
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4" /> Pausar
                </>
              )}
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={handleNext}
            className="py-3.5 bg-[#22c55e] hover:bg-[#4ade80] rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 text-black shadow-[0_6px_20px_rgba(34,197,94,0.3)]"
          >
            Siguiente <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* DESKTOP SIDE PANEL (lg+) — Hidden in Creator Mode */}
      {!creatorMode && (
        <aside
          aria-label="Panel de control del entrenamiento"
          className="hidden lg:flex lg:flex-col lg:justify-between flex-1 max-w-[580px] lg:h-[85vh] lg:max-h-[860px] gap-3 overflow-hidden"
        >
          {/* 1. Desktop Top Header & Audio/Creator Controls */}
          <div className="rounded-2xl border border-[#22c55e]/25 bg-[#101612]/95 px-4 py-3 shadow-lg space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={onExit}
                  className="text-xs font-bold text-neutral-200 hover:text-white flex items-center gap-1.5 bg-[#18221b] px-3 py-2 rounded-xl border border-[#22c55e]/30 transition-colors shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-[#4ade80]" /> Salir
                </button>
                <div className="min-w-0">
                  <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#4ade80] block truncate">
                    {phaseLabel}
                  </span>
                  <span className="text-xs font-bold text-neutral-300 block truncate">
                    {meta?.focusLabel ?? 'Sesión activa'} · Bloque{' '}
                    {currentIndex + 1} de {Math.max(1, queueLength)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setBeepEnabled((prev) => !prev)}
                  className={`p-2 rounded-xl border transition-colors ${
                    beepEnabled
                      ? 'bg-[#22c55e]/20 border-[#22c55e]/60 text-[#4ade80]'
                      : 'bg-[#141b16] border-white/15 text-neutral-400'
                  }`}
                  title="Pitido en los últimos 3 segundos"
                  aria-label="Alternar pitido de cuenta atrás"
                  aria-pressed={beepEnabled}
                >
                  {beepEnabled ? (
                    <Volume2 className="w-4 h-4" />
                  ) : (
                    <VolumeX className="w-4 h-4" />
                  )}
                </button>

                <select
                  value={currentTrackId}
                  onChange={(e) => onSelectTrack(Number(e.target.value))}
                  aria-label="Seleccionar pista musical de escritorio"
                  className="bg-[#141b16] border border-[#22c55e]/30 text-[#4ade80] text-xs font-bold uppercase tracking-wider px-2.5 py-2 rounded-xl focus:outline-none focus:border-[#4ade80] max-w-[135px] truncate cursor-pointer"
                >
                  {playlist.map((track) => (
                    <option key={track.id} value={track.id}>
                      {track.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={onToggleMusic}
                  className={`p-2 rounded-xl border transition-colors ${
                    musicPlaying
                      ? 'bg-[#22c55e]/20 border-[#22c55e] text-[#4ade80]'
                      : 'bg-[#141b16] border-white/15 text-neutral-400'
                  }`}
                  title="Música de fondo"
                  aria-label="Alternar música de fondo en escritorio"
                  aria-pressed={musicPlaying}
                >
                  <Music className="w-4 h-4" />
                </button>
              </div>
            </div>

            {(onToggleCreatorMode || onOpenTiktokModal) && (
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                {onToggleCreatorMode && (
                  <button
                    type="button"
                    onClick={enterCreatorMode}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#22c55e]/40 bg-[#152219] hover:bg-[#22c55e] py-1.5 px-3 text-[11px] font-black uppercase tracking-wider text-[#4ade80] hover:text-black transition-all"
                  >
                    <Smartphone className="w-3.5 h-3.5" /> Modo Creador TikTok 9:16
                  </button>
                )}

                {onOpenTiktokModal && (
                  <button
                    type="button"
                    onClick={onOpenTiktokModal}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#22c55e]/40 bg-[#152219] hover:bg-[#22c55e] py-1.5 px-3 text-[11px] font-black uppercase tracking-wider text-[#4ade80] hover:text-black transition-all"
                  >
                    <Clapperboard className="w-3.5 h-3.5" /> Resumen TikTok 14s · MP4
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 2. Countdown Ring + Current Exercise & Mini Muscle Map */}
          <div className="grid grid-cols-12 gap-3 shrink-0">
            {/* SVG Countdown Ring Card */}
            <div className="col-span-5 flex flex-col items-center justify-center rounded-3xl border border-[#22c55e]/25 bg-[#101612]/95 p-3 shadow-lg">
              <CountdownRing
                timeLeft={timeLeft}
                totalDuration={totalItemDuration}
                label={
                  currentItem?.kind === 'rest'
                    ? isRestPrepPhase
                      ? '¡PREPÁRATE!'
                      : 'DESCANSO'
                    : 'TIEMPO'
                }
                size={144}
                strokeWidth={9}
                soundEnabled={beepEnabled}
                isPaused={isPaused}
                isPrepPhase={isRestPrepPhase}
              />
            </div>

            {/* Current Exercise + Mini Muscle Map Card */}
            <div className="col-span-7 flex flex-col justify-between rounded-3xl border border-[#22c55e]/25 bg-[#101612]/95 p-3.5 shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#4ade80] block">
                    {currentItem?.kind === 'rest'
                      ? 'Siguiente ejercicio'
                      : currentItem?.kind === 'summary' ||
                          currentItem?.kind === 'intro'
                        ? 'Enfoque de la rutina'
                        : currentItem?.kind === 'outro'
                          ? 'Rutina completada'
                          : 'Ejercicio activo'}
                  </span>
                  <h3 className="text-base font-black uppercase tracking-tight text-white leading-tight mt-0.5 truncate">
                    {activeExercise?.title ??
                      (currentItem?.kind === 'summary' ||
                      currentItem?.kind === 'outro'
                        ? currentItem.meta.focusLabel
                        : undefined) ??
                      meta?.focusLabel ??
                      'Entrenamiento'}
                  </h3>
                </div>
                <span className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 text-xs font-bold text-neutral-200">
                  Nv.
                  {activeExercise
                    ? getDifficultyLevel(activeExercise.difficulty)
                    : (currentItem?.kind === 'summary' ||
                        currentItem?.kind === 'outro'
                        ? currentItem.meta.difficulty
                        : meta?.difficulty) ?? 5}
                  /10
                </span>
              </div>

              <div className="my-1.5 flex items-center justify-between gap-2.5">
                <div className="flex flex-wrap gap-1 content-start">
                  {activeMuscles.length > 0 ? (
                    <>
                      {activeMuscles.slice(0, 6).map((m) => (
                        <span
                          key={m.id}
                          className={`rounded-md px-2 py-0.5 text-[11px] font-black uppercase ${
                            m.role === 'primary'
                              ? 'bg-[#22c55e] text-black'
                              : 'border border-yellow-400/40 bg-yellow-400/15 text-yellow-200'
                          }`}
                        >
                          {MUSCLE_LABELS[m.id]}
                        </span>
                      ))}
                      {activeMuscles.length > 6 && (
                        <span className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-bold text-neutral-200">
                          +{activeMuscles.length - 6} más
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="rounded-md bg-[#22c55e] px-2 py-0.5 text-[11px] font-black uppercase text-black">
                      {activeExercise?.muscle ?? 'Full body'}
                    </span>
                  )}
                </div>

                <MiniMuscleMap
                  muscles={activeMuscles}
                  size="sm"
                  className="shrink-0 bg-[#0b100d] p-1.5 rounded-2xl border border-white/10"
                />
              </div>

              <div className="flex items-center justify-between text-xs text-neutral-300 border-t border-white/10 pt-1.5">
                <span>
                  Duración clip:{' '}
                  <strong className="text-white">{totalItemDuration}s</strong>
                </span>
                {meta?.slotSeconds && (
                  <span>
                    Slot estándar:{' '}
                    <strong className="text-[#4ade80]">{meta.slotSeconds}s</strong>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 3. Whole-Routine Timeline */}
          <RoutineTimeline
            queue={queue}
            timeline={timeline}
            currentIndex={currentIndex}
            timeLeft={timeLeft}
            totalItemDuration={totalItemDuration}
            elapsedSeconds={elapsedSeconds}
            totalSeconds={totalSeconds ?? meta?.totalSeconds}
            variant="desktop"
          />

          {/* 4. "A continuación" (Up Next) List */}
          <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-[#22c55e]/25 bg-[#101612]/95 p-4 shadow-lg overflow-hidden">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-black uppercase tracking-[0.16em] text-neutral-300 flex items-center gap-1.5">
                <Dumbbell className="w-3.5 h-3.5 text-[#4ade80]" /> A continuación
              </span>
              <span className="text-xs font-bold text-neutral-400">
                {Math.max(0, queueLength - currentIndex - 1)} bloques restantes
              </span>
            </div>

            {upcomingItems.length > 0 ? (
              <div className="space-y-2 overflow-y-auto pr-1">
                {upcomingItems.map((item, idx) => {
                  const badge =
                    item.kind === 'warmup'
                      ? 'Calentamiento'
                      : item.kind === 'workout'
                        ? `Ronda ${item.round}/${item.totalRounds}`
                        : 'Final';
                  const title =
                    item.kind === 'outro'
                      ? 'Resumen final completado'
                      : item.exercise.title;
                  const muscle =
                    item.kind === 'outro' ? 'Meta' : item.exercise.muscle;

                  return (
                    <div
                      key={`${item.kind}-${idx}-${title}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0b100d] px-3.5 py-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`rounded-lg px-2 py-0.5 text-[11px] font-black uppercase shrink-0 ${
                            item.kind === 'warmup'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                              : 'bg-[#22c55e]/20 text-[#4ade80] border border-[#22c55e]/30'
                          }`}
                        >
                          {badge}
                        </span>
                        <span className="text-xs font-bold uppercase text-white truncate">
                          {title}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs font-semibold uppercase text-neutral-300">
                        {muscle}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="my-auto text-center py-4 text-xs font-semibold text-neutral-300">
                Último bloque del entrenamiento en curso
              </div>
            )}
          </div>

          {/* 5. Desktop Transport Controls: Prev / Pause / Next */}
          <div className="grid grid-cols-3 gap-3 shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              disabled={!onPrev || currentIndex <= 0}
              className="py-3.5 px-4 bg-[#141b16] hover:bg-[#1b251e] border border-[#22c55e]/25 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 text-white disabled:opacity-35 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4 text-[#4ade80]" /> Anterior
            </button>

            <button
              type="button"
              onClick={onTogglePause}
              disabled={!onTogglePause}
              className="py-3.5 px-4 bg-[#19241c] hover:bg-[#213025] border border-[#22c55e]/40 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 text-[#4ade80] disabled:opacity-40"
            >
              {isPaused ? (
                <>
                  <Play className="w-4 h-4 fill-[#4ade80]" /> Reanudar
                </>
              ) : (
                <>
                  <Pause className="w-4 h-4" /> Pausar
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="py-3.5 px-4 bg-[#22c55e] hover:bg-[#4ade80] rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 text-black shadow-[0_10px_28px_rgba(34,197,94,0.35)]"
            >
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}

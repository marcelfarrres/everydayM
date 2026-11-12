'use client';

import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useWorkoutRoutine } from '@/hooks/useWorkoutRoutine';
import {
  INTRO_DURATION_SECONDS,
  buildTimeline,
  getItemDuration,
} from '@/lib/routine';
import { MuscleSelector } from '@/components/workout/MuscleSelector';
import { WorkoutPlayer } from '@/components/workout/WorkoutPlayer';
import { RoutinePromptCard } from '@/components/workout/RoutinePromptCard';
import {
  TiktokCreatorModal,
  type SavedRoutinePayload,
} from '@/components/workout/TiktokCreatorModal';
import { DifficultyScale } from '@/components/ui/DifficultyScale';
import { NumberStepper } from '@/components/ui/NumberStepper';
import type {
  PlaylistTrack,
  RoutineIntent,
  RoutineItem,
  RoutineMeta,
} from '@/types/workout';
import {
  Play,
  Loader2,
  Dumbbell,
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Zap,
  ShieldCheck,
  Timer,
  Clapperboard,
  Smartphone,
  Upload,
  Download,
} from 'lucide-react';

const PLAYLIST: PlaylistTrack[] = [
  {
    id: 0,
    label: 'Electro Energético',
    url: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf07a.mp3?filename=workout-energetic-electro-pop-112199.mp3',
  },
  {
    id: 1,
    label: 'Phonk Intenso',
    url: 'https://cdn.pixabay.com/download/audio/2022/10/06/audio_ff1461ff25.mp3?filename=phonk-workout-121852.mp3',
  },
  {
    id: 2,
    label: 'Cyberpunk',
    url: 'https://cdn.pixabay.com/download/audio/2023/11/19/audio_d07a976fcc.mp3?filename=cyberpunk-workout-175510.mp3',
  },
  {
    id: 3,
    label: 'Hip Hop Beats',
    url: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8b81757ac.mp3?filename=hip-hop-workout-102555.mp3',
  },
];

export default function WorkoutPage() {
  const {
    step,
    setStep,
    loading,
    queue,
    meta,
    timeline,
    currentIndex,
    timeLeft,
    totalItemDuration,
    elapsedSeconds,
    totalSeconds,
    isPaused,
    togglePause,
    videoRef,
    filters,
    setFilters,
    generateWorkout,
    generateFromIntent,
    nextItem,
    prevItem,
    handleVideoTimeUpdate,
  } = useWorkoutRoutine();

  const [currentTrackId, setCurrentTrackId] = useState(0);
  const [musicPlaying, setMusicPlaying] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // TikTok Creator Mode & Modal states
  const [creatorMode, setCreatorMode] = useState(false);
  const [creatorHandle, setCreatorHandle] = useState('@everydaym');
  const [showWatermark, setShowWatermark] = useState(true);
  const [tiktokModalOpen, setTiktokModalOpen] = useState(false);

  // Optional imported / overridden routine state (for loading everydaym-routine.json or restarting from index 0)
  const [overrideRoutine, setOverrideRoutine] = useState<{
    meta: RoutineMeta;
    queue: RoutineItem[];
  } | null>(null);
  const [overrideIndex, setOverrideIndex] = useState(0);
  const [overrideTimeLeft, setOverrideTimeLeft] = useState(60);
  const [overrideTotalDuration, setOverrideTotalDuration] = useState(60);
  const [overridePaused, setOverridePaused] = useState(false);
  const overrideRemainingRef = useRef(60);

  const lastIntentRef = useRef<RoutineIntent | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const configJsonInputRef = useRef<HTMLInputElement | null>(null);

  // Read URL query params (?rec=1 & ?handle=@...) on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const recParam = params.get('rec');
    const handleParam = params.get('handle');

    const initTimer = setTimeout(() => {
      if (handleParam && handleParam.trim()) {
        setCreatorHandle(
          handleParam.trim().startsWith('@')
            ? handleParam.trim()
            : `@${handleParam.trim()}`,
        );
      }

      if (recParam === '1' || recParam === 'true') {
        setCreatorMode(true);
        setMusicPlaying(false); // Default music OFF in Creator Mode for TikTok audio
      }
    }, 0);

    return () => clearTimeout(initTimer);
  }, []);

  const usingOverride = overrideRoutine !== null;
  const activeQueue = usingOverride ? overrideRoutine.queue : queue;
  const activeMeta = usingOverride ? overrideRoutine.meta : meta;
  const activeIndex = usingOverride ? overrideIndex : currentIndex;
  const activeItem = activeQueue[activeIndex];
  const activeTimeLeft = usingOverride ? overrideTimeLeft : timeLeft;
  const activeItemDuration = usingOverride
    ? overrideTotalDuration
    : totalItemDuration;
  const activePaused = usingOverride ? overridePaused : isPaused;

  const activeTimeline = useMemo(
    () =>
      usingOverride
        ? buildTimeline(overrideRoutine.queue, overrideRoutine.meta.slotSeconds)
        : timeline,
    [usingOverride, overrideRoutine, timeline],
  );

  const activeTotalSeconds = useMemo(
    () =>
      usingOverride
        ? overrideRoutine.meta.totalSeconds ||
          activeTimeline.reduce((acc, s) => acc + s.duration, 0)
        : totalSeconds,
    [usingOverride, overrideRoutine, activeTimeline, totalSeconds],
  );

  const activeElapsedSeconds = useMemo(() => {
    if (!usingOverride) return elapsedSeconds;
    const seg = activeTimeline[overrideIndex];
    if (!seg) return 0;
    const itemElapsed = Math.max(
      0,
      Math.min(seg.duration, overrideTotalDuration - overrideTimeLeft),
    );
    return Math.min(activeTotalSeconds, seg.start + itemElapsed);
  }, [
    usingOverride,
    elapsedSeconds,
    activeTimeline,
    overrideIndex,
    overrideTotalDuration,
    overrideTimeLeft,
    activeTotalSeconds,
  ]);

  const handleOverrideNext = useCallback(() => {
    if (!overrideRoutine) return;
    if (overrideIndex < overrideRoutine.queue.length - 1) {
      const nextIdx = overrideIndex + 1;
      const nextDur = getItemDuration(
        overrideRoutine.queue[nextIdx],
        overrideRoutine.meta.slotSeconds,
      );
      overrideRemainingRef.current = nextDur;
      setOverrideTotalDuration(nextDur);
      setOverrideTimeLeft(nextDur);
      setOverrideIndex(nextIdx);
      setOverridePaused(false);
      return;
    }
    overrideRemainingRef.current = 0;
    setOverrideTimeLeft(0);
  }, [overrideRoutine, overrideIndex]);

  const handleOverridePrev = useCallback(() => {
    if (!overrideRoutine || overrideRoutine.queue.length === 0) return;
    const targetIdx = overrideIndex > 0 ? overrideIndex - 1 : 0;
    const prevDur = getItemDuration(
      overrideRoutine.queue[targetIdx],
      overrideRoutine.meta.slotSeconds,
    );
    overrideRemainingRef.current = prevDur;
    setOverrideTotalDuration(prevDur);
    setOverrideTimeLeft(prevDur);
    setOverrideIndex(targetIdx);
    setOverridePaused(false);
  }, [overrideRoutine, overrideIndex]);

  const handleOverrideTogglePause = useCallback(() => {
    setOverridePaused((prev) => {
      const nextPaused = !prev;
      const videoEl = videoRef.current;
      if (videoEl) {
        if (nextPaused) {
          videoEl.pause();
        } else {
          videoEl.play().catch(() => {});
        }
      }
      return nextPaused;
    });
  }, [videoRef]);

  // Timer for overrideRoutine when active
  useEffect(() => {
    if (!usingOverride || step !== 'player' || overridePaused) return;
    const current = overrideRoutine.queue[overrideIndex];
    if (!current) return;

    const isTimerDriven =
      current.kind === 'rest' ||
      current.kind === 'summary' ||
      current.kind === 'outro' ||
      current.kind === 'intro';

    if (!isTimerDriven) return;

    const interval = setInterval(() => {
      overrideRemainingRef.current = Math.max(
        0,
        overrideRemainingRef.current - 1,
      );
      setOverrideTimeLeft(overrideRemainingRef.current);

      if (overrideRemainingRef.current <= 0) {
        clearInterval(interval);
        if (current.kind !== 'outro') {
          handleOverrideNext();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [
    usingOverride,
    step,
    overridePaused,
    overrideRoutine,
    overrideIndex,
    handleOverrideNext,
  ]);

  const handleOverrideVideoTimeUpdate = useCallback(() => {
    if (!overrideRoutine) return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const current = overrideRoutine.queue[overrideIndex];
    if (current?.kind === 'intro') {
      const rawDur =
        Number.isFinite(videoEl.duration) && videoEl.duration > 0
          ? Math.min(INTRO_DURATION_SECONDS, Math.ceil(videoEl.duration))
          : INTRO_DURATION_SECONDS;
      const remaining = Math.max(0, Math.ceil(rawDur - videoEl.currentTime));
      overrideRemainingRef.current = remaining;
      setOverrideTotalDuration(rawDur);
      setOverrideTimeLeft(remaining);
      if (videoEl.currentTime >= INTRO_DURATION_SECONDS) {
        handleOverrideNext();
      }
      return;
    }

    if (current?.kind === 'workout' || current?.kind === 'warmup') {
      if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        const realDuration = Math.max(1, Math.ceil(videoEl.duration));
        const remaining = Math.max(
          0,
          Math.ceil(videoEl.duration - videoEl.currentTime),
        );
        overrideRemainingRef.current = remaining;
        setOverrideTotalDuration((prev) =>
          prev !== realDuration ? realDuration : prev,
        );
        setOverrideTimeLeft(remaining);
      }
    }
  }, [overrideRoutine, overrideIndex, videoRef, handleOverrideNext]);

  // Background audio controller
  useEffect(() => {
    const bgAudio = audioRef.current;
    if (!bgAudio) return;

    const shouldPlay =
      step === 'player' &&
      musicPlaying &&
      !activePaused &&
      activeItem?.kind !== 'intro';

    if (shouldPlay) {
      bgAudio.play().catch(() => {});
    } else {
      bgAudio.pause();
      if (step === 'config') {
        bgAudio.currentTime = 0;
      }
    }
  }, [step, musicPlaying, activePaused, activeItem?.kind, currentTrackId]);

  const handleToggleCreatorMode = useCallback(() => {
    setCreatorMode((prev) => {
      const next = !prev;
      if (next) {
        // Default music OFF in Creator Mode so user can add trending TikTok audio
        setMusicPlaying(false);
      }
      return next;
    });
  }, []);

  const handleLoadRoutineJson = useCallback(
    (payload: {
      meta: RoutineMeta;
      queue: RoutineItem[];
      handle?: string;
    }) => {
      const firstDuration = getItemDuration(
        payload.queue[0],
        payload.meta.slotSeconds,
      );
      overrideRemainingRef.current = firstDuration;
      setOverrideRoutine({ meta: payload.meta, queue: payload.queue });
      setOverrideIndex(0);
      setOverrideTotalDuration(firstDuration);
      setOverrideTimeLeft(firstDuration);
      setOverridePaused(false);
      if (payload.handle) {
        setCreatorHandle(payload.handle);
      }
      setStep('player');
    },
    [setStep],
  );

  const handleRestartFromBeginning = useCallback(() => {
    const targetMeta = activeMeta;
    const targetQueue = activeQueue;
    if (!targetMeta || targetQueue.length === 0) return;

    const firstDuration = getItemDuration(
      targetQueue[0],
      targetMeta.slotSeconds,
    );
    overrideRemainingRef.current = firstDuration;
    setOverrideRoutine({ meta: targetMeta, queue: targetQueue });
    setOverrideIndex(0);
    setOverrideTotalDuration(firstDuration);
    setOverrideTimeLeft(firstDuration);
    setOverridePaused(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [activeMeta, activeQueue, videoRef]);

  const handleStartWithIntent = (intent: RoutineIntent) => {
    setOverrideRoutine(null);
    lastIntentRef.current = intent;
    void generateFromIntent(intent);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    setOverrideRoutine(null);
    void generateWorkout(e);
  };

  const handleRepeatRoutine = () => {
    if (overrideRoutine) {
      handleRestartFromBeginning();
      return;
    }
    if (lastIntentRef.current) {
      void generateFromIntent(lastIntentRef.current);
      return;
    }
    if (meta) {
      void generateFromIntent({
        muscles: meta.muscles.map((m) => ({
          id: m.id,
          role: m.role,
          weight: m.role === 'primary' ? 1.0 : 0.6,
        })),
        difficulty: meta.difficulty,
        targetMinutes: Math.max(10, Math.round(meta.totalSeconds / 60)),
        slotSeconds: meta.slotSeconds,
        includeWarmup: meta.warmups.length > 0,
        focusLabel: meta.focusLabel,
      });
    }
  };

  const handleConfigJsonFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<SavedRoutinePayload>;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !parsed.meta ||
        !Array.isArray(parsed.queue) ||
        parsed.queue.length === 0
      ) {
        alert('El archivo JSON no contiene una rutina válida de EverydayM.');
        return;
      }
      handleLoadRoutineJson({
        meta: parsed.meta,
        queue: parsed.queue,
        handle: parsed.handle,
      });
      setTiktokModalOpen(true);
    } catch {
      alert('No se pudo leer el archivo everydaym-routine.json.');
    }
  };

  return (
    <main className="relative min-h-screen bg-[#080b09] bg-neon-grid text-white flex flex-col items-center justify-center p-3 sm:p-5 lg:p-6 selection:bg-[#4ade80] selection:text-black overflow-x-hidden overflow-y-auto">
      <audio
        ref={audioRef}
        src={PLAYLIST[currentTrackId].url}
        onEnded={() => setCurrentTrackId((prev) => (prev + 1) % PLAYLIST.length)}
      />

      {/* Ambient Neon Radial Glows */}
      <div className="pointer-events-none fixed inset-0 flex items-center justify-center -z-10">
        <div className="w-[680px] h-[680px] bg-gradient-to-tr from-[#166534]/35 via-[#22c55e]/20 to-[#4ade80]/15 rounded-full blur-[160px] opacity-80" />
      </div>

      <TiktokCreatorModal
        open={tiktokModalOpen}
        onClose={() => setTiktokModalOpen(false)}
        meta={activeMeta}
        queue={activeQueue}
        handle={creatorHandle}
        onChangeHandle={setCreatorHandle}
        showWatermark={showWatermark}
        onToggleWatermark={() => setShowWatermark((prev) => !prev)}
        onEnterCreatorRecording={() => {
          setCreatorMode(true);
          setMusicPlaying(false);
          setStep('player');
        }}
        onLoadRoutineJson={handleLoadRoutineJson}
      />

      {step === 'config' ? (
        <div className="w-full max-w-md lg:max-w-6xl glass-panel border border-[#22c55e]/30 p-5 sm:p-6 lg:p-7 rounded-[32px] backdrop-blur-2xl">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 mb-5 border-b border-white/10">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black uppercase tracking-[0.25em] text-[#4ade80] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" /> EverydayM · Entrena Cada Día
                </span>
                <span className="rounded-full border border-[#22c55e]/35 bg-[#22c55e]/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-[#4ade80]">
                  v2 Studio + IA
                </span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white uppercase italic mt-1 font-sans">
                DISEÑA TU WORKOUT
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-neutral-300 max-w-2xl">
                Describe con tus palabras o por voz qué quieres entrenar hoy y
                ajustaremos rondas, ejercicios, descansos y tiempos reales de cada
                vídeo.
              </p>
            </div>

            <div className="flex flex-wrap lg:flex-nowrap items-center gap-2.5 shrink-0">
              {/* Creator Mode 9:16 Pre-Toggle Button */}
              <button
                type="button"
                onClick={handleToggleCreatorMode}
                aria-pressed={creatorMode}
                className={`inline-flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-black uppercase tracking-wider transition-all ${
                  creatorMode
                    ? 'border-[#4ade80] bg-[#22c55e] text-black shadow-[0_0_25px_rgba(34,197,94,0.45)]'
                    : 'border-[#22c55e]/35 bg-[#141e17] text-[#4ade80] hover:border-[#4ade80] hover:bg-[#1a291f]'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>
                  Modo Creador TikTok 9:16 {creatorMode ? '· ACTIVO' : ''}
                </span>
              </button>

              <div className="hidden xl:flex items-center gap-2 rounded-2xl border border-[#22c55e]/25 bg-[#141c16] px-3.5 py-2">
                <Timer className="w-4 h-4 text-[#4ade80]" />
                <div className="text-left">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-neutral-300">
                    Slots Reales
                  </span>
                  <span className="text-xs font-black text-white">
                    Fase Prepárate 3-2-1
                  </span>
                </div>
              </div>

              <div className="hidden sm:flex w-11 h-11 rounded-2xl bg-[#1b251d] border border-[#22c55e]/35 items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.25)]">
                <Dumbbell className="w-5 h-5 text-[#4ade80]" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            {/* Primary Column: AI / Voice Prompt + Editable Chips */}
            <div className="lg:col-span-7 space-y-5">
              <RoutinePromptCard
                loading={loading}
                onStartIntent={handleStartWithIntent}
              />
            </div>

            {/* Secondary Column: Collapsible "Modo avanzado" + TikTok Creator Pack Card */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-3xl border border-[#22c55e]/25 bg-[#121814]/95 overflow-hidden shadow-lg">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((prev) => !prev)}
                  aria-expanded={advancedOpen}
                  className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1a251d] border border-[#22c55e]/30 text-[#4ade80]">
                      <SlidersHorizontal className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="block text-xs font-black uppercase tracking-[0.16em] text-white">
                        Modo avanzado
                      </span>
                      <span className="block text-xs text-neutral-300">
                        Configuración manual por rondas y mapa muscular
                      </span>
                    </div>
                  </div>
                  <span className="rounded-full border border-white/15 bg-black/30 p-1.5 text-[#4ade80]">
                    {advancedOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </span>
                </button>

                {advancedOpen && (
                  <form
                    onSubmit={handleManualSubmit}
                    className="space-y-4 px-5 pb-5 pt-2 border-t border-white/10"
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <NumberStepper
                        label="Ejercicios por ronda"
                        unit={
                          filters.exercisesPerRound === 1
                            ? 'ejercicio'
                            : 'ejercicios'
                        }
                        value={filters.exercisesPerRound}
                        min={1}
                        max={12}
                        onChange={(exercisesPerRound) =>
                          setFilters({ ...filters, exercisesPerRound })
                        }
                      />
                      <NumberStepper
                        label="Rondas totales"
                        unit={filters.totalRounds === 1 ? 'ronda' : 'rondas'}
                        value={filters.totalRounds}
                        min={1}
                        max={5}
                        onChange={(totalRounds) =>
                          setFilters({ ...filters, totalRounds })
                        }
                      />
                    </div>

                    <MuscleSelector
                      value={filters.muscles}
                      onChange={(muscles) => setFilters({ ...filters, muscles })}
                    />

                    <DifficultyScale
                      value={filters.difficulty}
                      onChange={(difficulty) =>
                        setFilters({ ...filters, difficulty })
                      }
                    />

                    <label className="flex items-center gap-3 p-3.5 bg-[#161c18]/90 border border-[#22c55e]/25 rounded-xl cursor-pointer hover:border-[#4ade80]/50 transition-colors">
                      <input
                        type="checkbox"
                        checked={filters.includeWarmup}
                        onChange={(e) =>
                          setFilters({
                            ...filters,
                            includeWarmup: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-[#22c55e] rounded"
                      />
                      <span className="text-xs font-bold tracking-wide text-neutral-200">
                        Incluir bloque de calentamiento
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full mt-2 bg-[#1b281e] hover:bg-[#22c55e] border border-[#22c55e]/50 text-[#4ade80] hover:text-black font-black uppercase tracking-wider py-3.5 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs"
                    >
                      {loading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4 fill-current" />
                      )}
                      Comenzar con Modo Manual
                    </button>
                  </form>
                )}
              </div>

              {/* TikTok Creator Suite & JSON Card */}
              <div className="rounded-3xl border border-[#22c55e]/30 bg-[#101712]/95 p-5 space-y-3.5 shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-black uppercase tracking-wider text-[#4ade80] flex items-center gap-1.5">
                    <Clapperboard className="w-4 h-4" /> Pack Creador TikTok 9:16
                  </span>
                  <span className="rounded-full bg-[#22c55e]/15 border border-[#22c55e]/35 px-2.5 py-0.5 text-[10px] font-black uppercase text-[#4ade80]">
                    OBS + Resumen 14s
                  </span>
                </div>

                <p className="text-xs text-neutral-300 leading-relaxed">
                  De cada rutina obtienes <strong className="text-white">dos vídeos</strong>:{' '}
                  la sesión completa de 20–40 min en escenario 9:16 limpio para
                  OBS (<code>/?rec=1</code>) y un{' '}
                  <strong className="text-white">resumen vertical de 14s</strong>{' '}
                  exportable a MP4 (1080×1920 a 30fps).
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() => configJsonInputRef.current?.click()}
                    className="rounded-2xl border border-[#22c55e]/40 bg-[#16231a] hover:bg-[#1e3024] py-2.5 px-3 text-xs font-black uppercase tracking-wider text-[#4ade80] flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" /> Cargar Rutina JSON
                  </button>
                  <input
                    ref={configJsonInputRef}
                    type="file"
                    accept="application/json,.json"
                    onChange={(e) => void handleConfigJsonFileChange(e)}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => setTiktokModalOpen(true)}
                    className="rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 py-2.5 px-3 text-xs font-black uppercase tracking-wider text-white flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 text-[#4ade80]" /> Estudio
                    TikTok 14s
                  </button>
                </div>
              </div>

              {/* Desktop Info / Studio Quality Card */}
              <div className="hidden lg:block rounded-3xl border border-white/10 bg-[#0d120f]/90 p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#4ade80]">
                  <ShieldCheck className="w-4 h-4" /> Experiencia de Estudio
                </div>
                <ul className="space-y-1.5 text-xs text-neutral-300 leading-relaxed">
                  <li>
                    • <strong className="text-white">Escenario 9:16 + Panel en vivo:</strong>{' '}
                    anillo SVG de cuenta atrás con aviso acústico en los últimos 3 s y
                    línea de tiempo completa.
                  </li>
                  <li>
                    • <strong className="text-white">Vídeos íntegros sin cortes:</strong>{' '}
                    cada ejercicio respeta la duración real del clip y añade el margen al
                    bloque <em>¡Prepárate!</em>.
                  </li>
                  <li className="flex items-center gap-1.5 pt-0.5 text-[#4ade80] font-semibold">
                    <Zap className="w-3.5 h-3.5 shrink-0" /> Sin repeticiones seguidas y
                    cálculo exacto de minutos.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <WorkoutPlayer
          queue={activeQueue}
          queueLength={activeQueue.length}
          currentIndex={activeIndex}
          currentItem={activeItem}
          timeLeft={activeTimeLeft}
          totalItemDuration={activeItemDuration}
          videoRef={videoRef}
          playlist={PLAYLIST}
          currentTrackId={currentTrackId}
          onSelectTrack={setCurrentTrackId}
          musicPlaying={musicPlaying}
          onToggleMusic={() => setMusicPlaying((prev) => !prev)}
          onExit={() => {
            setCreatorMode(false);
            setStep('config');
          }}
          onNext={usingOverride ? handleOverrideNext : nextItem}
          onPrev={usingOverride ? handleOverridePrev : prevItem}
          onRepeat={handleRepeatRoutine}
          isPaused={activePaused}
          onTogglePause={
            usingOverride ? handleOverrideTogglePause : togglePause
          }
          meta={activeMeta}
          timeline={activeTimeline}
          elapsedSeconds={activeElapsedSeconds}
          totalSeconds={activeTotalSeconds}
          onVideoTimeUpdate={
            usingOverride
              ? handleOverrideVideoTimeUpdate
              : handleVideoTimeUpdate
          }
          creatorMode={creatorMode}
          onToggleCreatorMode={handleToggleCreatorMode}
          onOpenTiktokModal={() => setTiktokModalOpen(true)}
          creatorHandle={creatorHandle}
          onChangeCreatorHandle={setCreatorHandle}
          showWatermark={showWatermark}
          onToggleWatermark={() => setShowWatermark((prev) => !prev)}
          onRestartFromBeginning={handleRestartFromBeginning}
        />
      )}
    </main>
  );
}

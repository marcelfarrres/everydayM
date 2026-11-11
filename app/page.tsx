'use client';

import { useState, useRef, useEffect } from 'react';
import { useWorkoutRoutine } from '@/hooks/useWorkoutRoutine';
import { MuscleSelector } from '@/components/workout/MuscleSelector';
import { WorkoutPlayer } from '@/components/workout/WorkoutPlayer';
import { RoutinePromptCard } from '@/components/workout/RoutinePromptCard';
import { DifficultyScale } from '@/components/ui/DifficultyScale';
import { NumberStepper } from '@/components/ui/NumberStepper';
import type { PlaylistTrack, RoutineIntent } from '@/types/workout';
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
    currentItem,
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
  const lastIntentRef = useRef<RoutineIntent | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const bgAudio = audioRef.current;
    if (!bgAudio) return;

    const shouldPlay =
      step === 'player' &&
      musicPlaying &&
      !isPaused &&
      currentItem?.kind !== 'intro';

    if (shouldPlay) {
      bgAudio.play().catch(() => {});
    } else {
      bgAudio.pause();
      if (step === 'config') {
        bgAudio.currentTime = 0;
      }
    }
  }, [step, musicPlaying, isPaused, currentItem?.kind, currentTrackId]);

  const handleStartWithIntent = (intent: RoutineIntent) => {
    lastIntentRef.current = intent;
    void generateFromIntent(intent);
  };

  const handleRepeatRoutine = () => {
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

  return (
    <main className="relative min-h-screen bg-[#080b09] text-white flex flex-col items-center justify-center p-3 sm:p-5 lg:p-6 selection:bg-[#4ade80] selection:text-black overflow-x-hidden overflow-y-auto">
      <audio
        ref={audioRef}
        src={PLAYLIST[currentTrackId].url}
        onEnded={() => setCurrentTrackId((prev) => (prev + 1) % PLAYLIST.length)}
      />

      <div className="pointer-events-none fixed inset-0 flex items-center justify-center -z-10">
        <div className="w-[640px] h-[640px] bg-gradient-to-tr from-[#166534]/35 via-[#22c55e]/20 to-[#4ade80]/15 rounded-full blur-[150px] opacity-80" />
      </div>

      {step === 'config' ? (
        <div className="w-full max-w-md lg:max-w-6xl bg-[#101411]/95 border border-[#22c55e]/30 p-5 sm:p-6 lg:p-7 rounded-[32px] shadow-[0_24px_70px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
          {/* Header */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 mb-5 border-b border-white/10">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.25em] text-[#4ade80] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" /> EverydayM · Entrena Cada Día
              </span>
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white uppercase italic mt-0.5 font-sans">
                DISEÑA TU WORKOUT
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-neutral-300 max-w-2xl">
                Describe con tus palabras o por voz qué quieres entrenar hoy y
                ajustaremos rondas, ejercicios, descansos y tiempos reales de cada
                vídeo.
              </p>
            </div>

            <div className="hidden lg:flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-[#22c55e]/25 bg-[#141c16] px-4 py-2.5">
                <Timer className="w-4 h-4 text-[#4ade80]" />
                <div className="text-left">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                    Slots Reales
                  </span>
                  <span className="text-xs font-black text-white">
                    Fase Prepárate 3-2-1
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-2xl border border-[#22c55e]/25 bg-[#141c16] px-4 py-2.5">
                <Zap className="w-4 h-4 text-[#4ade80]" />
                <div className="text-left">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-neutral-300">
                    Motor Inteligente
                  </span>
                  <span className="text-xs font-black text-white">
                    Sin repetir seguido
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-[#1b251d] border border-[#22c55e]/35 flex items-center justify-center shadow-[0_0_20px_rgba(34,197,94,0.25)]">
                <Dumbbell className="w-6 h-6 text-[#4ade80]" />
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

            {/* Secondary Column: Collapsible "Modo avanzado" (Manual Configurator) */}
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
                    onSubmit={generateWorkout}
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

              {/* Desktop Info / Studio Quality Card */}
              <div className="hidden lg:block rounded-3xl border border-white/10 bg-[#0d120f]/90 p-5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#4ade80]">
                  <ShieldCheck className="w-4 h-4" /> Experiencia de Estudio
                </div>
                <ul className="space-y-2 text-xs text-neutral-300 leading-relaxed">
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
                </ul>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <WorkoutPlayer
          queue={queue}
          queueLength={queue.length}
          currentIndex={currentIndex}
          currentItem={currentItem}
          timeLeft={timeLeft}
          totalItemDuration={totalItemDuration}
          videoRef={videoRef}
          playlist={PLAYLIST}
          currentTrackId={currentTrackId}
          onSelectTrack={setCurrentTrackId}
          musicPlaying={musicPlaying}
          onToggleMusic={() => setMusicPlaying((prev) => !prev)}
          onExit={() => setStep('config')}
          onNext={nextItem}
          onPrev={prevItem}
          onRepeat={handleRepeatRoutine}
          isPaused={isPaused}
          onTogglePause={togglePause}
          meta={meta}
          timeline={timeline}
          elapsedSeconds={elapsedSeconds}
          totalSeconds={totalSeconds}
          onVideoTimeUpdate={handleVideoTimeUpdate}
        />
      )}
    </main>
  );
}

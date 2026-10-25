'use client';

import { useState, useRef, useEffect } from 'react';
import { useWorkoutRoutine } from '@/hooks/useWorkoutRoutine';
import { MuscleSelector } from '@/components/workout/MuscleSelector';
import { WorkoutPlayer } from '@/components/workout/WorkoutPlayer';
import { DifficultyScale } from '@/components/ui/DifficultyScale';
import { NumberStepper } from '@/components/ui/NumberStepper';
import type { PlaylistTrack } from '@/types/workout';
import { Play, Loader2, Dumbbell, Sparkles } from 'lucide-react';

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
    currentIndex,
    currentItem,
    timeLeft,
    totalItemDuration,
    videoRef,
    filters,
    setFilters,
    generateWorkout,
    nextItem,
    handleVideoTimeUpdate,
  } = useWorkoutRoutine();

  const [currentTrackId, setCurrentTrackId] = useState(0);
  const [musicPlaying, setMusicPlaying] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const bgAudio = audioRef.current;
    if (!bgAudio) return;

    const shouldPlay =
      step === 'player' && musicPlaying && currentItem?.kind !== 'intro';

    if (shouldPlay) {
      bgAudio.play().catch(() => {});
    } else {
      bgAudio.pause();
      if (step === 'config') {
        bgAudio.currentTime = 0;
      }
    }
  }, [step, musicPlaying, currentItem?.kind, currentTrackId]);

  return (
    <main className="relative min-h-screen bg-[#080b09] text-white flex flex-col items-center justify-center p-4 selection:bg-[#4ade80] selection:text-black overflow-x-hidden overflow-y-auto">
      <audio
        ref={audioRef}
        src={PLAYLIST[currentTrackId].url}
        onEnded={() => setCurrentTrackId((prev) => (prev + 1) % PLAYLIST.length)}
      />

      <div className="pointer-events-none fixed inset-0 flex items-center justify-center -z-10">
        <div className="w-[500px] h-[500px] bg-gradient-to-tr from-[#166534]/35 via-[#22c55e]/25 to-[#4ade80]/15 rounded-full blur-[140px] opacity-75" />
      </div>

      {step === 'config' ? (
        <div className="w-full max-w-md bg-[#101411]/95 border border-[#22c55e]/30 p-7 rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#4ade80] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Generador de Rutinas
              </span>
              <h1 className="text-4xl font-black tracking-tight text-white uppercase italic mt-1 font-sans">
                WORKOUT
              </h1>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#1b251d] border border-[#22c55e]/30 flex items-center justify-center shadow-[0_0_15px_rgba(34,197,94,0.2)]">
              <Dumbbell className="w-5 h-5 text-[#4ade80]" />
            </div>
          </div>

          <form onSubmit={generateWorkout} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <NumberStepper
                label="Ejercicios por ronda"
                unit={filters.exercisesPerRound === 1 ? 'ejercicio' : 'ejercicios'}
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
                onChange={(totalRounds) => setFilters({ ...filters, totalRounds })}
              />
            </div>

            <MuscleSelector
              value={filters.muscles}
              onChange={(muscles) => setFilters({ ...filters, muscles })}
            />

            <DifficultyScale
              value={filters.difficulty}
              onChange={(difficulty) => setFilters({ ...filters, difficulty })}
            />

            <label className="flex items-center gap-3 p-3 bg-[#161c18]/80 border border-[#22c55e]/20 rounded-xl cursor-pointer hover:border-[#4ade80]/40 transition-colors">
              <input
                type="checkbox"
                checked={filters.includeWarmup}
                onChange={(e) =>
                  setFilters({ ...filters, includeWarmup: e.target.checked })
                }
                className="w-4 h-4 accent-[#22c55e] rounded"
              />
              <span className="text-xs font-semibold tracking-wide text-neutral-200">
                Incluir bloque de calentamiento
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-3 bg-[#22c55e] hover:bg-[#4ade80] text-black font-black uppercase tracking-wider py-4 rounded-2xl transition-all shadow-[0_10px_30px_rgba(34,197,94,0.35)] flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin text-black" />
              ) : (
                <Play className="w-5 h-5 fill-black" />
              )}
              Comenzar Entrenamiento
            </button>
          </form>
        </div>
      ) : (
        <WorkoutPlayer
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
          onVideoTimeUpdate={handleVideoTimeUpdate}
        />
      )}
    </main>
  );
}

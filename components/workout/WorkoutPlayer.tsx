'use client';

import type { RefObject } from 'react';
import { ChevronRight, Music, PictureInPicture2, RotateCcw, Timer } from 'lucide-react';
import { getDifficultyLevel } from '@/lib/difficulty';
import type { PlaylistTrack, RoutineItem } from '@/types/workout';

interface WorkoutPlayerProps {
  queueLength: number;
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
  onVideoTimeUpdate: () => void;
}

export function WorkoutPlayer({
  queueLength,
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
  onVideoTimeUpdate,
}: WorkoutPlayerProps) {
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
      // Ignorar si el navegador no soporta PiP en el estado actual
    }
  };

  return (
    <div className="w-full max-w-sm flex flex-col items-center">
      <div className="w-full flex justify-between items-center mb-3 px-1">
        <button
          type="button"
          onClick={onExit}
          className="text-xs text-neutral-400 hover:text-white flex items-center gap-1.5 bg-[#141b16] px-3.5 py-2 rounded-xl border border-[#22c55e]/20"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Salir
        </button>

        <span className="text-xs font-black tracking-wider uppercase bg-[#141b16] border border-[#22c55e]/30 px-3.5 py-1.5 rounded-full text-[#4ade80]">
          {currentIndex + 1} / {queueLength}
        </span>

        <div className="flex items-center gap-2">
          <select
            value={currentTrackId}
            onChange={(e) => onSelectTrack(Number(e.target.value))}
            aria-label="Seleccionar pista musical"
            className="bg-[#141b16] border border-[#22c55e]/30 text-[#4ade80] text-[10px] font-black uppercase tracking-wider px-2 py-2 rounded-xl focus:outline-none focus:border-[#4ade80] max-w-[120px] truncate cursor-pointer"
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
                : 'bg-[#141b16] border-[#22c55e]/20 text-neutral-400'
            }`}
            title="Música de fondo"
            aria-label="Alternar música de fondo"
          >
            <Music className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="w-full bg-[#141b16] h-2 rounded-full overflow-hidden mb-3 border border-[#22c55e]/20 shadow-inner">
        <div
          className="bg-[#22c55e] h-full transition-all duration-300 shadow-[0_0_12px_#22c55e]"
          style={{
            width: `${Math.max(
              0,
              Math.min(100, ((totalItemDuration - timeLeft) / totalItemDuration) * 100),
            )}%`,
          }}
        />
      </div>

      <div className="relative w-full aspect-[9/16] bg-[#0c110e] rounded-[32px] overflow-hidden border border-[#22c55e]/30 shadow-[0_20px_60px_rgba(0,0,0,0.9)]">
        {currentItem?.kind === 'intro' ? (
          <div className="relative w-full h-full">
            <video
              key={currentItem.exercise.video_url}
              ref={videoRef}
              src={currentItem.exercise.video_url}
              autoPlay
              playsInline
              muted={false}
              onTimeUpdate={(e) => {
                if (e.currentTarget.volume !== 1.0) e.currentTarget.volume = 1.0;
                if (e.currentTarget.currentTime >= 10) onNext();
              }}
              onEnded={onNext}
              className="w-full h-full object-cover"
            />

            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/80 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[#4ade80] mb-3 animate-pulse shadow-black drop-shadow-md">
                Iniciando Sistema
              </span>
              <h2
                aria-label="Everyday M"
                className="flex flex-col items-center text-center font-sans drop-shadow-[0_0_25px_rgba(34,197,94,0.6)]"
              >
                <span
                  aria-hidden="true"
                  className="text-[clamp(2.75rem,11vw,4.75rem)] font-black uppercase italic leading-[0.82] tracking-[-0.08em] text-white"
                >
                  EVERYDAY
                </span>
                <span
                  aria-hidden="true"
                  className="mt-2 flex items-center justify-center gap-2 text-[clamp(6rem,20vw,8rem)] font-extralight leading-[0.78] tracking-[-0.04em]"
                >
                  <span className="bg-gradient-to-b from-[#4ade80] to-[#22c55e] bg-clip-text text-transparent">
                    M
                  </span>
                  <span className="bg-gradient-to-b from-white to-[#4ade80] bg-clip-text text-transparent">
                    M
                  </span>
                </span>
              </h2>

              <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-48 h-1.5 bg-white/10 rounded-full overflow-hidden backdrop-blur-sm">
                <div className="h-full bg-[#4ade80] animate-[progress_10s_linear_forwards]" />
              </div>
            </div>
          </div>
        ) : currentItem?.kind === 'rest' ? (
          <div className="w-full h-full flex flex-col justify-between p-6 bg-gradient-to-b from-[#0c110e] via-[#101913] to-[#0c110e]">
            <div className="flex items-center justify-between pt-2">
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#1b271e] border border-[#22c55e]/30 text-[#4ade80] text-[11px] font-black uppercase tracking-wider">
                <Timer className="w-3.5 h-3.5" />
                {currentItem.isEndOfRound ? 'Fin de Ronda' : 'Descanso'}
              </span>
              <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-white/10 text-white border border-white/10">
                Ronda {currentItem.nextRound} / {currentItem.totalRounds}
              </span>
            </div>

            <div className="flex flex-col items-center py-4">
              <span className="text-8xl font-black tracking-tighter text-white font-sans drop-shadow-[0_0_25px_rgba(34,197,94,0.3)]">
                {timeLeft}
              </span>
              <span className="text-[11px] font-black uppercase tracking-[0.3em] text-[#4ade80] mt-1">
                SEGUNDOS
              </span>
            </div>

            {/* Vista previa Picture-in-Picture (PiP) del siguiente ejercicio */}
            <div className="w-full bg-white text-black rounded-3xl p-4 shadow-2xl flex flex-col items-center">
              <div className="w-full flex items-center justify-between mb-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">
                  SIGUIENTE EJERCICIO
                </span>
                <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                  {currentItem.nextExercise.muscle}
                </span>
              </div>
              <p className="text-base font-black tracking-tight text-neutral-900 mb-3 text-center uppercase leading-tight line-clamp-1">
                {currentItem.nextExercise.title}
              </p>
              <div className="w-24 aspect-[9/16] rounded-2xl overflow-hidden bg-black border-2 border-neutral-900 shadow-md">
                <video
                  key={currentItem.nextExercise.video_url}
                  src={currentItem.nextExercise.video_url}
                  autoPlay
                  loop
                  muted
                  playsInline
                  className="w-full h-full object-cover pointer-events-none"
                />
              </div>
            </div>
          </div>
        ) : (
          <>
            <video
              key={currentItem?.exercise.video_url}
              ref={videoRef}
              src={currentItem?.exercise.video_url}
              autoPlay
              playsInline
              muted={true}
              onTimeUpdate={onVideoTimeUpdate}
              onEnded={onNext}
              className="w-full h-full object-cover"
            />

            <div className="absolute top-4 left-4 right-4 flex justify-between items-center pointer-events-none">
              {currentItem?.kind === 'workout' ? (
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-[#101913]/90 border border-[#22c55e]/40 text-[#4ade80] backdrop-blur-md">
                  Ronda {currentItem.round}/{currentItem.totalRounds} · Ex{' '}
                  {currentItem.exerciseIndexInRound}/{currentItem.totalExercisesPerRound}
                </span>
              ) : (
                <span className="text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/30 text-amber-300 backdrop-blur-md">
                  Calentamiento
                </span>
              )}

              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={handleTogglePiP}
                  title="Modo Picture-in-Picture"
                  aria-label="Activar modo Picture-in-Picture"
                  className="bg-black/70 backdrop-blur-md p-1.5 rounded-full border border-[#22c55e]/40 text-[#4ade80] hover:bg-black/90 transition-colors"
                >
                  <PictureInPicture2 className="w-3.5 h-3.5" />
                </button>
                <div className="bg-black/70 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-[#22c55e]/40 text-sm font-black text-[#4ade80] pointer-events-none">
                  {timeLeft}s
                </div>
              </div>
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black via-black/60 to-transparent pointer-events-none">
              <h2 className="text-xl font-black uppercase tracking-tight text-white leading-snug drop-shadow-md">
                {currentItem?.exercise.title}
              </h2>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md bg-[#22c55e] text-black">
                  {currentItem?.exercise.muscle}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-white/20 text-white backdrop-blur-md">
                  Dificultad {getDifficultyLevel(currentItem?.exercise.difficulty)}/10
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="w-full mt-4">
        <button
          type="button"
          onClick={onNext}
          className="w-full py-4 bg-[#141b16] hover:bg-[#1b251e] border border-[#22c55e]/30 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 text-white hover:border-[#4ade80]/60 active:scale-[0.98]"
        >
          Siguiente <ChevronRight className="w-4 h-4 text-[#4ade80]" />
        </button>
      </div>
    </div>
  );
}

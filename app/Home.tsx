'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2, Play, X } from 'lucide-react';
import { useWorkoutRoutine } from '@/hooks/useWorkoutRoutine';
import { MuscleSelector } from '@/components/workout/MuscleSelector';
import { WorkoutPlayer } from '@/components/workout/player/WorkoutPlayer';
import { RoutineComposer } from '@/components/workout/RoutineComposer';
import { TiktokExport } from '@/components/workout/TiktokExport';
import { DifficultyScale } from '@/components/ui/DifficultyScale';
import { NumberStepper } from '@/components/ui/NumberStepper';
import { unlockPlayerAudio } from '@/lib/audio/unlock';
import { useCatalogMusic } from '@/lib/audio/useMusic';
import type { RoutineIntent, RoutineItem, RoutineMeta } from '@/types/workout';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

/** `studio`: this server has the Studio switched on (your computer). On the public web it is
 *  off, and the Studio button, its dialog and everything TikTok simply aren't there. */
export function Home({ studio }: { studio: boolean }) {
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
    totalSeconds,
    isPaused,
    togglePause,
    videoRef,
    filters,
    setFilters,
    generateWorkout,
    generateFromIntent,
    startBuiltRoutine,
    nextItem,
    prevItem,
    handleVideoTimeUpdate,
  } = useWorkoutRoutine();

  const [tiktokOpen, setTiktokOpen] = useState(false);
  const [prompt, setPrompt] = useState('');

  const lastIntentRef = useRef<RoutineIntent | null>(null);
  const studioDialogRef = useRef<HTMLDialogElement | null>(null);

  // The playlist comes with the catalogue, so the music can start in the "Empezar" tap.
  useCatalogMusic();

  // Runs inside the "Empezar" tap (RoutineComposer calls it synchronously): sound is unlocked here.
  const handleStartPrepared = (builtQueue: RoutineItem[], builtMeta: RoutineMeta, intent: RoutineIntent, text: string) => {
    unlockPlayerAudio({ queue: builtQueue });
    lastIntentRef.current = intent;
    setPrompt(text);
    startBuiltRoutine(builtQueue, builtMeta);
  };

  const handleRepeatRoutine = () => {
    unlockPlayerAudio({ startMusic: false }); // the "Repetir" tap; the new routine is built after an await
    if (lastIntentRef.current) {
      void generateFromIntent(lastIntentRef.current);
      return;
    }
    if (meta) {
      void generateFromIntent({
        muscles: meta.muscles.map((m) => ({ id: m.id, role: m.role, weight: m.role === 'primary' ? 1.0 : 0.6 })),
        difficulty: meta.difficulty,
        targetMinutes: Math.max(10, Math.round(meta.totalSeconds / 60)),
        slotSeconds: meta.slotSeconds,
        includeWarmup: meta.warmups.length > 0,
        focusLabel: meta.focusLabel,
      });
    }
  };

  return (
    <main className="relative min-h-dvh bg-paper text-ink selection:bg-ink selection:text-white">
      {studio && <TiktokExport open={tiktokOpen} onClose={() => setTiktokOpen(false)} queue={queue} meta={meta} prompt={prompt} />}

      {step === 'config' ? (
        <>
          <RoutineComposer
            onStart={handleStartPrepared}
            onOpenStudio={studio ? () => studioDialogRef.current?.showModal() : undefined}
          />
          {studio && (
          <dialog
            ref={studioDialogRef}
            aria-label="Estudio"
            className="m-auto max-h-[88dvh] w-[min(94vw,32rem)] overflow-y-auto rounded-[32px] bg-paper p-6 font-[family-name:var(--font-display)] text-ink shadow-[0_40px_80px_-30px_rgba(0,0,0,0.5)] backdrop:bg-black/50 backdrop:backdrop-blur-sm"
          >
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-3xl font-semibold tracking-[-0.03em]">Estudio</h2>
                <button
                  type="button"
                  onClick={() => studioDialogRef.current?.close()}
                  aria-label="Cerrar"
                  className={`flex h-11 w-11 items-center justify-center rounded-full bg-ink/8 hover:bg-ink/15 ${FOCUS}`}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <Link
                href="/admin"
                className={`flex items-center justify-between gap-4 rounded-3xl bg-white p-5 shadow-[0_16px_34px_-26px_rgba(0,0,0,0.5)] ${FOCUS}`}
              >
                <span>
                  <span className="block text-xl font-semibold">Tus vídeos</span>
                  <span className="mt-1 block text-[15px] text-ink/60">Sube clips desde el ordenador o el móvil.</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink/50" aria-hidden="true" />
              </Link>
              <p className="text-[15px] leading-snug text-ink/60">
                Los vídeos para TikTok se crean desde la rutina: menú «···» del reproductor.
              </p>

              <details className="group rounded-3xl bg-ink/5 p-4">
                <summary className={`cursor-pointer list-none text-lg font-semibold [&::-webkit-details-marker]:hidden ${FOCUS}`}>
                  Modo manual <span className="text-ink/60">· elige bloques y músculos</span>
                </summary>
                <form
                  onSubmit={(e) => {
                    unlockPlayerAudio({ startMusic: false }); // the routine may still fail: music starts with the player
                    void generateWorkout(e);
                  }}
                  className="mt-4 space-y-4"
                >
                  <div className="grid grid-cols-2 gap-3">
                    <NumberStepper
                      label="Series por bloque"
                      unit={filters.exercisesPerRound === 1 ? 'serie' : 'series'}
                      value={filters.exercisesPerRound}
                      min={1}
                      max={12}
                      onChange={(exercisesPerRound) => setFilters({ ...filters, exercisesPerRound })}
                    />
                    <NumberStepper
                      label="Bloques"
                      unit={filters.totalRounds === 1 ? 'bloque' : 'bloques'}
                      value={filters.totalRounds}
                      min={1}
                      max={5}
                      onChange={(totalRounds) => setFilters({ ...filters, totalRounds })}
                    />
                  </div>
                  <MuscleSelector value={filters.muscles} onChange={(muscles) => setFilters({ ...filters, muscles })} />
                  <DifficultyScale value={filters.difficulty} onChange={(difficulty) => setFilters({ ...filters, difficulty })} />
                  <label className="flex cursor-pointer items-center gap-3 rounded-2xl bg-white p-3.5">
                    <input
                      type="checkbox"
                      checked={filters.includeWarmup}
                      onChange={(e) => setFilters({ ...filters, includeWarmup: e.target.checked })}
                      className="h-4 w-4 rounded accent-ink"
                    />
                    <span className="text-[15px] font-medium">Con calentamiento</span>
                  </label>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-lg font-semibold text-white disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5 fill-current" />}
                    Empezar
                  </button>
                </form>
              </details>
            </div>
          </dialog>
          )}
        </>
      ) : (
        <WorkoutPlayer
          queue={queue}
          currentIndex={currentIndex}
          currentItem={currentItem}
          timeLeft={timeLeft}
          totalItemDuration={totalItemDuration}
          videoRef={videoRef}
          onExit={() => setStep('config')}
          onNext={nextItem}
          onPrev={prevItem}
          onRepeat={handleRepeatRoutine}
          isPaused={isPaused}
          onTogglePause={togglePause}
          meta={meta}
          timeline={timeline}
          totalSeconds={totalSeconds}
          onVideoTimeUpdate={handleVideoTimeUpdate}
          onOpenTiktok={studio ? () => setTiktokOpen(true) : undefined}
        />
      )}
    </main>
  );
}

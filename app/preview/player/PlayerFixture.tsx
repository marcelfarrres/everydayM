'use client';

import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { useWorkoutRoutine } from '@/hooks/useWorkoutRoutine';
import { WorkoutPlayer } from '@/components/workout/player/WorkoutPlayer';
import { buildRoutine } from '@/lib/routine';
import type { RoutineItem, RoutineMeta, WorkoutFilters } from '@/types/workout';
import { FIXTURE_EXERCISES, FIXTURE_MUSCLES, seeded } from './fixtures';

/*
 * Development only: the real engine and the real player on fixture exercises. A small "Estados"
 * panel jumps to each moment (it walks the routine with the player's own next/previous).
 */

const FILTERS: WorkoutFilters = {
  difficulty: 8, // short rests, so the states come round quickly
  muscles: FIXTURE_MUSCLES,
  exercisesPerRound: 3,
  totalRounds: 3,
  includeWarmup: true,
};

// The engine picks the talks itself: two talks for three long rests, so one always goes without.
function build(seed: number): { queue: RoutineItem[]; meta: RoutineMeta } {
  return buildRoutine(FIXTURE_EXERCISES, FILTERS, seeded(seed));
}

type Jump = { label: string; find: (item: RoutineItem) => boolean };
const JUMPS: Jump[] = [
  { label: 'Calentamiento', find: (q) => q.kind === 'warmup' },
  { label: 'Serie', find: (q) => q.kind === 'workout' },
  { label: 'Descanso corto', find: (q) => q.kind === 'rest' && q.restKind === 'short' },
  { label: 'Descanso largo con vídeos hablados', find: (q) => q.kind === 'rest' && q.restKind === 'long' && q.talks.length > 0 },
  { label: 'Descanso largo sin vídeos hablados', find: (q) => q.kind === 'rest' && q.restKind === 'long' && q.talks.length === 0 },
  { label: 'Final', find: (q) => q.kind === 'outro' },
];

export function PlayerFixture() {
  const routine = useWorkoutRoutine();
  const { step, queue, meta, currentIndex, nextItem, prevItem, startBuiltRoutine } = routine;
  const [seed, setSeed] = useState(7);
  const [target, setTarget] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [musicOn, setMusicOn] = useState(false);
  const [musicVolume, setMusicVolume] = useState(0.8);

  const start = (nextSeed: number) => {
    const built = build(nextSeed);
    setSeed(nextSeed);
    setTarget(null);
    startBuiltRoutine(built.queue, built.meta);
  };

  // Walk one step at a time towards the chosen moment, with the player's own next/previous.
  useEffect(() => {
    if (target === null) return;
    const t = setTimeout(() => {
      if (currentIndex === target) setTarget(null);
      else if (currentIndex < target) nextItem();
      else prevItem();
    }, 0);
    return () => clearTimeout(t);
  }, [target, currentIndex, nextItem, prevItem]);

  if (step !== 'player') {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-paper px-6 text-center font-[family-name:var(--font-display)] text-ink">
        <p className="max-w-sm text-[15px] text-ink/70">
          Reproductor con ejercicios de prueba (todos usan <code>/marcel-ready.mp4</code>). Solo en desarrollo.
        </p>
        {/* a real tap first, as in the app: it is what lets a talk start with sound */}
        <button
          type="button"
          onClick={() => start(seed)}
          className="flex h-16 items-center gap-3 rounded-full bg-ink px-10 text-xl font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <Play className="h-5 w-5 fill-current" aria-hidden="true" />
          Empezar
        </button>
      </main>
    );
  }

  const item = queue[currentIndex];
  const describe = item?.kind === 'rest' ? `descanso ${item.restKind === 'long' ? 'largo' : 'corto'} · ${item.talks.length} hablados` : item?.kind;

  return (
    <>
      <WorkoutPlayer
        queue={routine.queue}
        currentIndex={currentIndex}
        currentItem={routine.currentItem}
        timeLeft={routine.timeLeft}
        totalItemDuration={routine.totalItemDuration}
        videoRef={routine.videoRef}
        musicOn={musicOn}
        onToggleMusic={() => setMusicOn((on) => !on)}
        musicVolume={musicVolume}
        onMusicVolume={setMusicVolume}
        onExit={() => routine.setStep('config')}
        onNext={nextItem}
        onPrev={prevItem}
        onRepeat={() => start(seed + 1)}
        isPaused={routine.isPaused}
        onTogglePause={routine.togglePause}
        meta={meta}
        timeline={routine.timeline}
        totalSeconds={routine.totalSeconds}
        onVideoTimeUpdate={routine.handleVideoTimeUpdate}
        onOpenTiktok={() => window.alert('Aquí se abriría «Crear clip» (solo con el Estudio activo).')}
      />

      {/* DEV: jump between states */}
      <div className="fixed left-1 top-1/2 z-[80] -translate-y-1/2 font-[family-name:var(--font-display)] text-[13px]">
        <button
          type="button"
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
          className="min-h-11 rounded-full bg-[#ffe27a] px-3 font-semibold text-ink shadow"
        >
          Estados
        </button>
        {panelOpen && (
          <div className="mt-1 flex w-56 flex-col gap-1 rounded-2xl bg-white p-2 text-ink shadow-lg">
            <p className="px-2 pb-1 text-[12px] text-ink/70">
              Ahora: {currentIndex + 1}/{queue.length} · {describe}
            </p>
            {JUMPS.map((jump) => {
              const index = queue.findIndex(jump.find);
              return (
                <button
                  key={jump.label}
                  type="button"
                  disabled={index < 0 || target !== null}
                  onClick={() => {
                    setTarget(index);
                    setPanelOpen(false);
                  }}
                  className="min-h-11 rounded-xl px-2 text-left font-medium hover:bg-ink/5 disabled:text-ink/40"
                >
                  {jump.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

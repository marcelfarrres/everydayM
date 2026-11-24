'use client';

import { useEffect, useState } from 'react';
import { Play } from 'lucide-react';
import { useWorkoutRoutine } from '@/hooks/useWorkoutRoutine';
import { WorkoutPlayer } from '@/components/workout/player/WorkoutPlayer';
import type { CheerDemo } from '@/components/workout/player/CheerHits';
import { HIT_WORDS } from '@/lib/routine/cheers';
import { getMusicEngine } from '@/lib/audio/music';
import { unlockPlayerAudio } from '@/lib/audio/unlock';
import { buildRoutine } from '@/lib/routine';
import type { RoutineItem, RoutineMeta, WorkoutFilters } from '@/types/workout';
import { fixtureMusic } from './fixtureMusic';
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

const HIT_WORD_LIST = Object.values(HIT_WORDS).flat();

function seekNearEnd(video: HTMLVideoElement | null) {
  if (video && Number.isFinite(video.duration)) video.currentTime = Math.max(0, video.duration - 4.2);
}

type Jump ={ label: string; find: (item: RoutineItem) => boolean };
const JUMPS: Jump[] = [
  { label: 'Calentamiento', find: (q) => q.kind === 'warmup' },
  { label: 'Serie', find: (q) => q.kind === 'workout' },
  { label: 'Última serie (antes del final)', find: (q) => q.kind === 'outro' },
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
  // The dev controls stay folded behind a small dot, so the page looks like the real player.
  const [devOpen, setDevOpen] = useState(false);
  const [withMusic, setWithMusic] = useState(true);
  const [demo, setDemo] = useState<CheerDemo | null>(null);
  const [demoWord, setDemoWord] = useState('');

  // The fixture playlist (or none, to see the silent player); the engine is reachable from the
  // console as window.__music for checks.
  useEffect(() => {
    const engine = getMusicEngine();
    engine?.setTracks(withMusic ? fixtureMusic() : []);
    (window as unknown as { __music?: unknown }).__music = engine;
  }, [withMusic]);

  // Called from a tap ("Empezar", "Repetir"): sound is unlocked here, as in the app.
  const start = (nextSeed: number) => {
    const built = build(nextSeed);
    unlockPlayerAudio({ queue: built.queue });
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
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input type="checkbox" checked={withMusic} onChange={(e) => setWithMusic(e.target.checked)} className="h-4 w-4 accent-ink" />
          Con música de prueba (sintetizada)
        </label>
      </main>
    );
  }

  const item = queue[currentIndex];
  const fireHit = () => {
    const word = demoWord || HIT_WORD_LIST[Math.floor(Math.random() * HIT_WORD_LIST.length)];
    setDemo((last) => ({
      id: (last?.id ?? 0) + 1,
      hit: { queueIndex: currentIndex, moment: 'mid', group: 'mid', word, seed: Math.floor(Math.random() * 2 ** 32) },
    }));
  };
  // The rocket's ignition and takeoff: the clip on screen jumps to its last 4 s.
  const ignite = () => seekNearEnd(routine.videoRef.current);
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
        cheerDemo={demo ?? undefined}
      />

      {/* DEV: one small dot opens the controls below; folded by default */}
      <button
        type="button"
        onClick={() => {
          setDevOpen((v) => !v);
          setPanelOpen(false);
        }}
        aria-expanded={devOpen}
        aria-label={devOpen ? 'Ocultar controles de prueba' : 'Mostrar controles de prueba'}
        className="fixed left-1 top-16 z-[80] flex h-11 w-11 cursor-pointer items-center justify-center"
      >
        <span aria-hidden="true" className={`h-3 w-3 rounded-full ${devOpen ? 'bg-[#ffe27a]' : 'bg-[#ffe27a]/60'} shadow`} />
      </button>

      {/* DEV: fire a comic hit now (it shows only during a serie, as in the app) */}
      <div
        hidden={!devOpen}
        className={`fixed bottom-1/4 left-1 z-[80] flex-col gap-1 font-[family-name:var(--font-display)] text-[13px] ${devOpen ? 'flex' : ''}`}
      >
        <button
          type="button"
          onClick={fireHit}
          className="min-h-11 rounded-full bg-[#ffe27a] px-3 font-semibold text-ink shadow"
        >
          ¡Golpe!
        </button>
        <select
          aria-label="Palabra del golpe"
          value={demoWord}
          onChange={(e) => setDemoWord(e.target.value)}
          className="min-h-11 w-28 rounded-xl bg-white px-1 text-ink shadow"
        >
          <option value="">al azar</option>
          {HIT_WORD_LIST.map((word) => (
            <option key={word} value={word}>
              {word}
            </option>
          ))}
        </select>
        {item?.kind !== 'workout' && <p className="w-28 rounded-xl bg-white/90 px-2 py-1 text-[11px] text-ink">Solo se ve en una serie</p>}
        {/* the clip jumps to its last 4 s: the rocket lights up and takes off (before a rest or the end) */}
        <button
          type="button"
          onClick={ignite}
          disabled={item?.kind !== 'workout' && item?.kind !== 'warmup'}
          className="min-h-11 rounded-full bg-[#ffe27a] px-3 font-semibold text-ink shadow disabled:opacity-50"
        >
          Ignición
        </button>
      </div>

      {/* DEV: jump between states */}
      <div
        hidden={!devOpen}
        className="fixed left-1 top-1/2 z-[80] -translate-y-1/2 font-[family-name:var(--font-display)] text-[13px]"
      >
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
              const found = queue.findIndex(jump.find);
              const index = jump.label.startsWith('Última serie') && found > 0 ? found - 1 : found;
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

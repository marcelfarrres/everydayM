'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
  INTRO_DURATION_SECONDS,
  buildRoutine,
  buildTimeline,
  getItemDuration,
  getRestDuration,
} from '@/lib/routine';
import type {
  Exercise,
  MuscleSelection,
  RoutineIntent,
  RoutineItem,
  RoutineMeta,
  TimelineSegment,
  WorkoutFilters,
} from '@/types/workout';

export type {
  Exercise,
  RoutineIntent,
  RoutineItem,
  RoutineMeta,
  TimelineSegment,
  WorkoutFilters,
};

export function useWorkoutRoutine() {
  const [step, setStep] = useState<'config' | 'player'>('config');
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<RoutineItem[]>([]);
  const [meta, setMeta] = useState<RoutineMeta | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const [timeLeft, setTimeLeft] = useState(60);
  const [totalItemDuration, setTotalItemDuration] = useState(60);
  const remainingRef = useRef<number>(60);

  const videoRef = useRef<HTMLVideoElement>(null);

  const [filters, setFilters] = useState<WorkoutFilters>({
    difficulty: 5,
    muscles: [] as MuscleSelection[],
    exercisesPerRound: 5,
    totalRounds: 3,
    includeWarmup: true,
  });

  const timeline = useMemo(
    () => buildTimeline(queue, meta?.slotSeconds),
    [queue, meta?.slotSeconds],
  );

  const totalSeconds = useMemo(
    () =>
      meta?.totalSeconds ??
      timeline.reduce((acc, segment) => acc + segment.duration, 0),
    [meta?.totalSeconds, timeline],
  );

  const elapsedSeconds = useMemo(() => {
    const seg = timeline[currentIndex];
    if (!seg) return 0;
    const itemElapsed = Math.max(
      0,
      Math.min(seg.duration, totalItemDuration - timeLeft),
    );
    return Math.min(totalSeconds, seg.start + itemElapsed);
  }, [timeline, currentIndex, totalItemDuration, timeLeft, totalSeconds]);

  const startBuiltRoutine = useCallback(
    (builtQueue: RoutineItem[], builtMeta: RoutineMeta) => {
      const initialDuration = getItemDuration(
        builtQueue[0],
        builtMeta.slotSeconds,
      );
      remainingRef.current = initialDuration;
      setMeta(builtMeta);
      setQueue(builtQueue);
      setCurrentIndex(0);
      setTotalItemDuration(initialDuration);
      setTimeLeft(initialDuration);
      setIsPaused(false);
      setStep('player');
    },
    [],
  );

  const generateWorkout = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!filters.muscles.some((selection) => selection.role === 'primary')) {
      alert('Marca al menos un músculo principal para generar la rutina.');
      return;
    }

    setLoading(true);

    try {
      const { data: allExercises, error } = await supabase
        .from('exercises')
        .select('*');

      if (error) throw error;
      if (!allExercises || allExercises.length === 0) {
        alert('No hay ejercicios registrados. Sube clips en /admin primero.');
        setLoading(false);
        return;
      }

      const { queue: builtQueue, meta: builtMeta } = buildRoutine(
        allExercises as Exercise[],
        filters,
      );
      startBuiltRoutine(builtQueue, builtMeta);
    } catch (err: unknown) {
      console.error(err);
      alert('Error al generar la rutina');
    } finally {
      setLoading(false);
    }
  };

  const generateFromIntent = useCallback(
    async (intent: RoutineIntent) => {
      setLoading(true);

      try {
        const { data: allExercises, error } = await supabase
          .from('exercises')
          .select('*');

        if (error) throw error;
        if (!allExercises || allExercises.length === 0) {
          alert('No hay ejercicios registrados. Sube clips en /admin primero.');
          setLoading(false);
          return;
        }

        const { queue: builtQueue, meta: builtMeta } = buildRoutine(
          allExercises as Exercise[],
          intent,
        );

        setFilters({
          difficulty: builtMeta.difficulty,
          muscles: builtMeta.muscles,
          exercisesPerRound: builtMeta.exercisesPerRound || 5,
          totalRounds: builtMeta.rounds,
          includeWarmup: intent.includeWarmup,
        });

        startBuiltRoutine(builtQueue, builtMeta);
      } catch (err: unknown) {
        console.error(err);
        alert('Error al generar la rutina');
      } finally {
        setLoading(false);
      }
    },
    [startBuiltRoutine],
  );

  const nextItem = useCallback(() => {
    if (currentIndex < queue.length - 1) {
      const nextIdx = currentIndex + 1;
      const nextDuration = getItemDuration(queue[nextIdx], meta?.slotSeconds);
      remainingRef.current = nextDuration;
      setTotalItemDuration(nextDuration);
      setTimeLeft(nextDuration);
      setCurrentIndex(nextIdx);
      setIsPaused(false);
      return;
    }

    // Already on the final item (outro): stay in 'player' with 0s remaining so the user can exit or repeat.
    remainingRef.current = 0;
    setTimeLeft(0);
  }, [currentIndex, queue, meta?.slotSeconds]);

  const prevItem = useCallback(() => {
    if (queue.length === 0) return;

    const targetIdx = currentIndex > 0 ? currentIndex - 1 : 0;
    const prevDuration = getItemDuration(queue[targetIdx], meta?.slotSeconds);
    remainingRef.current = prevDuration;
    setTotalItemDuration(prevDuration);
    setTimeLeft(prevDuration);
    setCurrentIndex(targetIdx);
    setIsPaused(false);

    if (targetIdx === currentIndex && videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [currentIndex, queue, meta?.slotSeconds]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => {
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
  }, []);

  useEffect(() => {
    if (step !== 'player') return;
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (isPaused) {
      videoEl.pause();
    } else {
      videoEl.play().catch(() => {});
    }
  }, [isPaused, currentIndex, step]);

  useEffect(() => {
    if (step !== 'player' || isPaused) return;
    const current = queue[currentIndex];
    if (!current) return;

    const isTimerDriven =
      current.kind === 'rest' ||
      current.kind === 'summary' ||
      current.kind === 'outro' ||
      current.kind === 'intro';

    if (!isTimerDriven) return;

    const interval = setInterval(() => {
      remainingRef.current = Math.max(0, remainingRef.current - 1);
      setTimeLeft(remainingRef.current);

      if (remainingRef.current <= 0) {
        clearInterval(interval);
        if (current.kind !== 'outro') {
          nextItem();
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentIndex, queue, isPaused, step, nextItem]);

  const handleVideoTimeUpdate = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const current = queue[currentIndex];
    if (current?.kind === 'intro') {
      const rawDur =
        Number.isFinite(videoEl.duration) && videoEl.duration > 0
          ? Math.min(INTRO_DURATION_SECONDS, Math.ceil(videoEl.duration))
          : INTRO_DURATION_SECONDS;
      const remaining = Math.max(
        0,
        Math.ceil(rawDur - videoEl.currentTime),
      );
      remainingRef.current = remaining;
      setTotalItemDuration(rawDur);
      setTimeLeft(remaining);
      if (videoEl.currentTime >= INTRO_DURATION_SECONDS) {
        nextItem();
      }
      return;
    }

    if (
      current?.kind === 'workout' ||
      current?.kind === 'warmup'
    ) {
      if (Number.isFinite(videoEl.duration) && videoEl.duration > 0) {
        const realDuration = Math.max(1, Math.ceil(videoEl.duration));
        const remaining = Math.max(
          0,
          Math.ceil(videoEl.duration - videoEl.currentTime),
        );
        remainingRef.current = remaining;
        setTotalItemDuration((prev) =>
          prev !== realDuration ? realDuration : prev,
        );
        setTimeLeft(remaining);
      }
    }
  }, [queue, currentIndex, nextItem]);

  return {
    step,
    setStep,
    loading,
    queue,
    meta,
    timeline,
    currentIndex,
    currentItem: queue[currentIndex],
    timeLeft,
    totalItemDuration,
    elapsedSeconds,
    totalSeconds,
    isPaused,
    setIsPaused,
    togglePause,
    videoRef,
    filters,
    setFilters,
    getRestDuration,
    generateWorkout,
    generateFromIntent,
    nextItem,
    prevItem,
    handleVideoTimeUpdate,
  };
}

'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import {
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
  // When the running timer-driven item ends (performance.now() ms); null while paused or video-driven.
  const deadlineRef = useRef<number | null>(null);

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
      deadlineRef.current = null;
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
    deadlineRef.current = null;
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
    deadlineRef.current = null;
    remainingRef.current = prevDuration;
    setTotalItemDuration(prevDuration);
    setTimeLeft(prevDuration);
    setCurrentIndex(targetIdx);
    setIsPaused(false);

    if (targetIdx === currentIndex && videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [currentIndex, queue, meta?.slotSeconds]);

  /** Add time to the current timer-driven item (rest): "+10 s". */
  const extendItem = useCallback((seconds: number) => {
    if (deadlineRef.current !== null) deadlineRef.current += seconds * 1000;
    else remainingRef.current += seconds;
    setTotalItemDuration((prev) => prev + seconds);
    setTimeLeft((prev) => prev + seconds);
  }, []);

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

  const handleVideoTimeUpdate = useCallback(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const current = queue[currentIndex];
    if (
      current?.kind === 'workout' ||
      current?.kind === 'warmup'
    ) {
      // The ref can still hold the previous clip for a moment after a change: only trust this item's video.
      if (videoEl.getAttribute('src') !== current.exercise.video_url) return;
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
  }, [queue, currentIndex]);

  // One clock for every item, read 10 times a second so the seconds turn over on time:
  // exercise clips follow their own video; intro, summary, rest and outro follow a deadline,
  // which survives pauses and never drifts the way a 1 s setInterval does.
  useEffect(() => {
    if (step !== 'player' || isPaused) return;
    const current = queue[currentIndex];
    if (!current) return;

    const fromVideo = current.kind === 'warmup' || current.kind === 'workout';
    if (!fromVideo) {
      deadlineRef.current = performance.now() + remainingRef.current * 1000;
    }

    const tick = () => {
      if (fromVideo) {
        handleVideoTimeUpdate();
        return;
      }
      if (deadlineRef.current === null) return;
      const left = Math.max(0, (deadlineRef.current - performance.now()) / 1000);
      setTimeLeft(Math.ceil(left));
      if (left <= 0 && current.kind !== 'outro') {
        nextItem();
      }
    };
    const interval = setInterval(tick, 100);

    return () => {
      clearInterval(interval);
      // Paused mid-item: keep the exact time left. (Skips clear the deadline first.)
      if (deadlineRef.current !== null) {
        remainingRef.current = Math.max(0, (deadlineRef.current - performance.now()) / 1000);
        deadlineRef.current = null;
      }
    };
  }, [currentIndex, queue, isPaused, step, nextItem, handleVideoTimeUpdate]);

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
    startBuiltRoutine,
    nextItem,
    prevItem,
    extendItem,
    handleVideoTimeUpdate,
  };
}

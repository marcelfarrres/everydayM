'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { getExerciseMuscles } from '@/components/workout/MuscleSelector';
import { getDifficultyLevel } from '@/lib/difficulty';
import type {
  Exercise,
  MuscleSelection,
  RoutineItem,
  WorkoutFilters,
} from '@/types/workout';

export type { Exercise, RoutineItem, WorkoutFilters };

function getItemDuration(item: RoutineItem | undefined): number {
  return item?.kind === 'rest' ? item.duration : 60;
}

export function useWorkoutRoutine() {
  const [step, setStep] = useState<'config' | 'player'>('config');
  const [loading, setLoading] = useState(false);
  const [queue, setQueue] = useState<RoutineItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [timeLeft, setTimeLeft] = useState(60);
  const [totalItemDuration, setTotalItemDuration] = useState(60);

  const videoRef = useRef<HTMLVideoElement>(null);

  const [filters, setFilters] = useState<WorkoutFilters>({
    difficulty: 5,
    muscles: [] as MuscleSelection[],
    exercisesPerRound: 5,
    totalRounds: 3,
    includeWarmup: true,
  });

  const getRestDuration = (difficulty: number) =>
    20 - Math.round(((difficulty - 1) * 10) / 9);

  const generateWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
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

      const intros = allExercises.filter((ex) => ex.type?.toLowerCase() === 'intro');
      const warmups = allExercises.filter((ex) => ex.type === 'warmup');
      let workouts = allExercises.filter(
        (ex) => ex.type !== 'warmup' && ex.type?.toLowerCase() !== 'intro',
      );
      if (workouts.length === 0) workouts = allExercises;

      const primaryTargetIds = new Set(
        filters.muscles
          .filter((selection) => selection.role === 'primary')
          .map((selection) => selection.id),
      );
      const targetMuscleIds = new Set(filters.muscles.map((selection) => selection.id));

      const scored = workouts.map((ex) => {
        const exerciseMuscles = getExerciseMuscles(ex.muscles, ex.muscle);
        const matchesPrimaryTarget = exerciseMuscles.some(
          (exerciseMuscle) =>
            exerciseMuscle.role === 'primary' &&
            primaryTargetIds.has(exerciseMuscle.id),
        );
        const matchesSelectedMuscle = exerciseMuscles.some((exerciseMuscle) =>
          targetMuscleIds.has(exerciseMuscle.id),
        );
        const difficultyDifference = Math.abs(
          getDifficultyLevel(ex.difficulty) - filters.difficulty,
        );
        const score = 1 + (10 - difficultyDifference);
        const musclePriority = matchesPrimaryTarget ? 0 : matchesSelectedMuscle ? 1 : 2;

        return { exercise: ex as Exercise, score, musclePriority };
      });

      const pickWeighted = (
        pool: typeof scored,
        excludedIds: Set<string>,
      ): Exercise | null => {
        const available = pool.filter((item) => !excludedIds.has(item.exercise.id));
        if (available.length === 0) return null;

        const totalWeight = available.reduce((acc, curr) => acc + curr.score, 0);
        let randomVal = Math.random() * totalWeight;

        for (const item of available) {
          if (randomVal < item.score) return item.exercise;
          randomVal -= item.score;
        }
        return available[0].exercise;
      };

      const circuitExercises: Exercise[] = [];
      const usedIds = new Set<string>();

      for (let i = 0; i < filters.exercisesPerRound; i++) {
        const priorityOrder = (i + 1) % 4 === 0 ? [1, 0, 2] : [0, 1, 2];
        let picked: Exercise | null = null;

        for (const priority of priorityOrder) {
          const pool = scored.filter((item) => item.musclePriority === priority);
          picked = pickWeighted(pool, usedIds);
          if (picked) break;
        }

        if (!picked) {
          usedIds.clear();
          for (const priority of priorityOrder) {
            const pool = scored.filter((item) => item.musclePriority === priority);
            picked = pickWeighted(pool, usedIds);
            if (picked) break;
          }
        }

        if (picked) {
          usedIds.add(picked.id);
          circuitExercises.push(picked);
        }
      }

      const restSec = getRestDuration(filters.difficulty);
      const newQueue: RoutineItem[] = [];

      if (intros.length > 0) {
        newQueue.push({ kind: 'intro', exercise: intros[0] as Exercise });
      }

      if (filters.includeWarmup && warmups.length > 0) {
        warmups.slice(0, 3).forEach((w) => {
          newQueue.push({ kind: 'warmup', exercise: w as Exercise });
        });
      }

      for (let r = 1; r <= filters.totalRounds; r++) {
        circuitExercises.forEach((ex, exIdx) => {
          newQueue.push({
            kind: 'workout',
            exercise: ex,
            round: r,
            totalRounds: filters.totalRounds,
            exerciseIndexInRound: exIdx + 1,
            totalExercisesPerRound: circuitExercises.length,
          });

          const isLast =
            r === filters.totalRounds && exIdx === circuitExercises.length - 1;

          if (!isLast) {
            const isEndOfRound = exIdx === circuitExercises.length - 1;
            const nextRound = isEndOfRound ? r + 1 : r;
            const nextExercise = isEndOfRound
              ? circuitExercises[0]
              : circuitExercises[exIdx + 1];

            newQueue.push({
              kind: 'rest',
              duration: isEndOfRound ? restSec + 10 : restSec,
              nextExercise,
              nextRound,
              totalRounds: filters.totalRounds,
              isEndOfRound,
            });
          }
        });
      }

      const initialDuration = getItemDuration(newQueue[0]);
      setTotalItemDuration(initialDuration);
      setTimeLeft(initialDuration);
      setQueue(newQueue);
      setCurrentIndex(0);
      setStep('player');
    } catch (err: unknown) {
      console.error(err);
      alert('Error al generar la rutina');
    } finally {
      setLoading(false);
    }
  };

  const nextItem = useCallback(() => {
    if (currentIndex < queue.length - 1) {
      const nextIdx = currentIndex + 1;
      const nextDuration = getItemDuration(queue[nextIdx]);
      setTotalItemDuration(nextDuration);
      setTimeLeft(nextDuration);
      setCurrentIndex(nextIdx);
      return;
    }

    alert('¡ENTRENAMIENTO COMPLETADO!');
    setStep('config');
    setCurrentIndex(0);
  }, [currentIndex, queue]);

  useEffect(() => {
    const current = queue[currentIndex];
    if (!current || current.kind !== 'rest') return;

    let remaining = current.duration;
    const interval = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
        nextItem();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [currentIndex, queue, nextItem]);

  const handleVideoTimeUpdate = () => {
    if (videoRef.current) {
      const remaining = Math.ceil(
        videoRef.current.duration - videoRef.current.currentTime,
      );
      if (!isNaN(remaining)) setTimeLeft(remaining);
    }
  };

  return {
    step,
    setStep,
    loading,
    queue,
    currentIndex,
    currentItem: queue[currentIndex],
    timeLeft,
    totalItemDuration,
    videoRef,
    filters,
    setFilters,
    generateWorkout,
    nextItem,
    handleVideoTimeUpdate,
  };
}

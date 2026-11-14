'use client';

import { useState } from 'react';
import type { Exercise } from '@/types/workout';

/** Where an exercise's cut-out lives (made by scripts/studio/make-thumbs.mjs). */
export function figureUrl(id: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
  return `${base}/storage/v1/object/public/workout-videos/thumbs/${id}.webp`;
}

/** The exercise's person, cut out (transparent background). Renders nothing if there is none yet. */
export function ExerciseFigure({ exercise, className = '' }: { exercise: Pick<Exercise, 'id' | 'title'>; className?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small transparent cut-outs from Supabase
    <img
      src={figureUrl(exercise.id)}
      alt={exercise.title}
      title={exercise.title}
      loading="lazy"
      draggable={false}
      onError={() => setMissing(true)}
      className={`select-none object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.35)] ${className}`}
    />
  );
}

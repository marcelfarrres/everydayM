'use client';

import { useEffect, useState, type RefObject } from 'react';
import { estimateTextWidth, type MeasureText } from '@/components/workout/padRocketShape';

/*
 * Measuring the labels written on the rockets (the first screen's, the routine's stages): an
 * estimate until the browser can measure, then the real widths in the font the element uses (a
 * canvas measurement), again once the web font has arrived. Shared by LaunchBase, the creator's
 * text bar and RocketShip.
 */

/** The real width of a label in `family` at `weight` (a canvas measurement), once it can be made. */
export function canvasMeasure(family: string, weight = 600): MeasureText | null {
  if (typeof document === 'undefined') return null;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  return (text, px) => {
    ctx.font = `${weight} ${px}px ${family}`;
    // a hair of margin for the rendering's rounding
    return ctx.measureText(text).width * 1.03 + 1;
  };
}

/**
 * Measures labels in the font `ref`'s element uses: an estimate until the browser can measure,
 * then the real widths (again once the web font has arrived).
 */
export function useTextMeasure(ref: RefObject<HTMLElement | null>, weight = 600): MeasureText {
  const [measure, setMeasure] = useState<MeasureText>(() => estimateTextWidth);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let alive = true;
    const real = () => {
      const m = canvasMeasure(getComputedStyle(el).fontFamily, weight);
      if (alive && m) setMeasure(() => m);
    };
    real();
    document.fonts?.ready.then(real).catch(() => {});
    return () => {
      alive = false;
    };
  }, [ref, weight]);
  return measure;
}

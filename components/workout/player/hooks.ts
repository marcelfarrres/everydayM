'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { playCountdownBeep } from '@/lib/audio';

/** `value`, but `ms` later (at once when `ms` is 0): lets a change happen behind the clouds instead of before them. */
export function useLagged<T>(value: T, ms: number): T {
  const [lagged, setLagged] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setLagged(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return ms <= 0 ? value : lagged;
}

/**
 * True for `ms` after `key` changes (never on mount, never when `enabled` is false): e.g. while
 * the clouds of a rest that just began are still on screen.
 */
export function useBusyAfter(key: unknown, ms: number, enabled: boolean): boolean {
  // Every change of key counts, also a return to an earlier key (rest -> back -> same rest again
  // within `ms`): the clouds play on each change, so comparing keys alone would miss it.
  const [seen, setSeen] = useState(key);
  const [changes, setChanges] = useState(0);
  if (seen !== key) {
    setSeen(key);
    setChanges((n) => n + 1);
  }
  // The change whose busy time is over. Starts at the first: nothing plays on mount.
  const [settled, setSettled] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setSettled(changes), enabled ? ms : 0);
    return () => clearTimeout(t);
  }, [changes, ms, enabled]);
  return enabled && settled !== changes;
}

/**
 * Guards against accidental taps: for `ms` after `key` changes, `blocked()` is true.
 * A second tap on "next" must not land on "Saltar" of the rest that just appeared in the same
 * place, and nothing under the clouds can be pressed while they cover the screen.
 */
export function useTapGuard(key: unknown, ms: number): () => boolean {
  const since = useRef(0);
  const span = useRef(ms);
  useEffect(() => {
    since.current = performance.now();
    span.current = ms;
  }, [key, ms]);
  return useCallback(() => performance.now() - since.current < span.current, []);
}

/** Beep (and a tap on the iPhone) on each of the last three seconds. */
export function useCountdownBeep(timeLeft: number, enabled: boolean) {
  const last = useRef<number | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (timeLeft > 0 && timeLeft <= 3) {
      if (last.current !== timeLeft) {
        last.current = timeLeft;
        playCountdownBeep(timeLeft);
        Haptics.impact({ style: timeLeft === 1 ? ImpactStyle.Heavy : ImpactStyle.Light }).catch(() => {});
      }
    } else {
      last.current = null;
    }
  }, [timeLeft, enabled]);
}

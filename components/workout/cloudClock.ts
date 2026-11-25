'use client';

import { useLayoutEffect, useSyncExternalStore } from 'react';

/*
 * The one clock of the clouds of a rest. Everything written on them (the words, which of a block's
 * sentences stands, "Luego: …", the countdown's place) and the % badge's way into its sentence
 * read the same number, `t` (ms since the clouds began), in the same frame: none of them can run
 * ahead of another, whether the device is slow, the tab was hidden or the routine was paused.
 *
 * The clock is one Web Animation (id "cloud-clock", on an invisible element of CloudTransition),
 * so it lives on the document's timeline like the clouds themselves. Each frame `t` is read from
 * it once and handed to:
 *   painters   functions that write styles straight onto their elements (opacity, transform),
 *              pure functions of `t` (rocketFlight.ts: wordsAt, sentenceAt, badgeAt);
 *   selectors  useCloudMoment: a component re-renders only when what it picks out changes
 *              (e.g. "are the clouds still closed?").
 * Moving the animation's currentTime (as a test does) moves everything with it.
 */

export const CLOUD_CLOCK_ID = 'cloud-clock';

/** `key`: the rest whose clouds the clock is running for (null: never started). `t`: null when not running. */
export interface CloudMoment {
  key: number | null;
  t: number | null;
}

const IDLE: CloudMoment = { key: null, t: null };
let clock: Animation | null = null;
let runKey: number | null = null;
let moment: CloudMoment = IDLE;
let frame = 0;
const painters = new Set<(t: number | null) => void>();
const listeners = new Set<() => void>();

function read(): number | null {
  if (!clock || clock.playState === 'finished' || clock.playState === 'idle') return null;
  const now = clock.currentTime;
  return typeof now === 'number' ? now : null;
}

function tick() {
  cancelAnimationFrame(frame);
  frame = 0;
  const t = read();
  if (t !== moment.t || runKey !== moment.key) moment = { key: runKey, t };
  painters.forEach((paint) => paint(moment.t));
  listeners.forEach((listener) => listener());
  if (t !== null) frame = requestAnimationFrame(tick);
}

// Development only: a test can step the clock (after moving its currentTime) without waiting for
// a frame, which a hidden tab hardly gets.
if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') {
  (window as Window & { __cloudClockTick?: () => void }).__cloudClockTick = tick;
}

/** The clouds of rest `key` begin now, for `durationMs`: the clock starts from 0 (a running one stops). */
export function startCloudClock(host: HTMLElement, key: number, durationMs: number) {
  clock?.cancel();
  clock = host.animate([{ opacity: 0 }, { opacity: 0 }], { id: CLOUD_CLOCK_ID, duration: durationMs });
  runKey = key;
  tick();
}

/** The clouds are gone for good (the player closes): everything goes back to rest. */
export function stopCloudClock() {
  clock?.cancel();
  clock = null;
  tick();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Something about the clouds' moment, re-rendering only when it changes (return a primitive). */
export function useCloudMoment<T extends string | number | boolean | null>(select: (m: CloudMoment) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => select(moment),
    () => select(IDLE),
  );
}

/** Paint on every frame of the clock (and once now). `paint` should be stable (useCallback). */
export function useCloudPainter(paint: (t: number | null) => void) {
  useLayoutEffect(() => {
    painters.add(paint);
    paint(moment.t);
    return () => {
      painters.delete(paint);
    };
  }, [paint]);
}

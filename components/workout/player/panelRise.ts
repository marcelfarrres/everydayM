'use client';

import { useSyncExternalStore } from 'react';

/*
 * How much taller than PANEL.H the phone's rocket panels stand right now (a name or a rest's
 * "Descanso · Luego: …" on two lines: panelRise in rocketShape.ts), px. RocketWidget measures it;
 * the stage reads it so the next exercise's small window stands over the first panel, not under it.
 */

let rise = 0;
const listeners = new Set<() => void>();

export function setPanelRise(px: number) {
  const next = Math.max(0, Math.round(px));
  if (next === rise) return;
  rise = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function usePanelRise(): number {
  return useSyncExternalStore(
    subscribe,
    () => rise,
    () => 0,
  );
}

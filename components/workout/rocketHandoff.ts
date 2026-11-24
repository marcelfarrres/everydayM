import { FLIGHT } from '@/components/workout/rocketFlight';

/*
 * One rocket from the routine creator to the player. "Empezar" launches the creator's rocket and
 * says when it will be out of the top of the screen; the player's widget, mounting a moment later,
 * waits until then (and the hand-over beat) before it arrives and parks for the warm-up, so the two
 * read as one rocket that went and came back, never two at once.
 */

let outOfSightAt = 0;

/** The creator's rocket will be out of sight at `at` (performance.now() time). */
export function launchedUntil(at: number) {
  outOfSightAt = at;
}

/** How long the widget waits before it arrives (0 if no rocket was launched just now). Read once. */
export function arrivalDelay(now: number): number {
  const wait = outOfSightAt - now;
  outOfSightAt = 0;
  return wait > 0 ? wait + FLIGHT.handoverBeatMs : 0;
}

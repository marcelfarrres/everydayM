import type { SfxOneShot } from '@/lib/audio/sfxRecipes';
import { DOCK, FLIGHT, RETURN_BRAKE_AT, SEPARATION, launchLeadMs, separates, type Flight, type LaunchStart } from './rocketFlight';

/*
 * The sounds of a flight of the widget rocket, at the same moments as its animations (see
 * playFlight in RocketWidget): pure, from the same Flight and the same constants.
 */

export interface FlightSound {
  /** when (the same clock as Flight: performance.now() ms) */
  at: number;
  sfx: SfxOneShot;
}

export interface FlightSounds {
  hits: FlightSound[];
  /** the slow rise in the clouds: when the `slowMo` loop starts and stops (null: none) */
  slowMo: [number, number] | null;
  /** when the rocket shoots off; null: it doesn't */
  launchAt: number | null;
}

/** What sounds, and when, for a flight `f` that starts from `start` (none for a fade: nothing flies). */
export function flightSounds(f: Flight, start: LaunchStart): FlightSounds {
  const hits: FlightSound[] = [];
  let slowMo: [number, number] | null = null;
  let launchAt: number | null = null;

  if (f.leftAt !== null && Number.isFinite(f.leftAt) && f.how !== 'fade') {
    const t0 = f.leftAt;
    // its panels slide in before it moves (not when they already have, nor when it waits in the clouds)
    if (!f.placed && start === 'open') hits.push({ at: t0, sfx: 'banner' });
    if (!f.placed) {
      launchAt = t0 + launchLeadMs(start);
      hits.push({ at: launchAt, sfx: 'launch' });
    }
    if (f.how === 'clouds') {
      const lift = t0 + FLIGHT.cloudLiftMs + (f.extra ?? 0);
      if (separates(f.extra) && !f.placed) {
        // the separation (SEPARATION): the slow motion stops (with its fade) as the engine goes out;
        // the part gives at the hammer's blow; the engine coughs twice and catches
        const S = SEPARATION;
        slowMo = [t0 + FLIGHT.appearMs, t0 + S.engineOffMs];
        hits.push({ at: t0 + S.releaseMs, sfx: 'separate' });
        for (const at of [...S.sputtersMs, S.catchMs]) hits.push({ at: t0 + at, sfx: 'ignite' });
      } else {
        // from coming up from below (braking into slow motion) until it speeds off out of the top
        slowMo = [f.placed ? t0 : t0 + FLIGHT.appearMs, lift];
      }
      hits.push({ at: lift, sfx: 'boost' });
    }
  }

  if (f.returnAt !== null && Number.isFinite(f.returnAt)) {
    const parked = f.returnAt + FLIGHT.returnMs;
    hits.push({ at: f.returnAt + FLIGHT.returnMs * RETURN_BRAKE_AT, sfx: 'land' });
    // its panels slide out of the hull (once it has stretched)
    hits.push({ at: parked + DOCK.outAtMs, sfx: 'banner' });
  }

  return { hits, slowMo, launchAt };
}

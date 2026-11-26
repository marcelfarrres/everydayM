import { describe, expect, it } from 'vitest';
import { BLOCK_END_EXTRA_MS } from '@/lib/routine/duration';
import { FLIGHT, POD, PRELAUNCH, RETURN_BRAKE_AT, SEPARATION, arrival, nextFlight, PARKED } from './rocketFlight';
import { flightSounds } from './rocketSounds';

const names = (s: ReturnType<typeof flightSounds>) => s.hits.map((h) => h.sfx);

describe('flightSounds', () => {
  it('into the clouds from the crouch: launch at once, slow motion, boost, then the way back', () => {
    const f = nextFlight(PARKED, 'clouds', 1000);
    const s = flightSounds(f, 'crouched');
    expect(names(s)).toEqual(['launch', 'boost', 'land', 'banner']);
    expect(s.launchAt).toBe(1000);
    expect(s.slowMo).toEqual([1000 + FLIGHT.appearMs, 1000 + FLIGHT.cloudLiftMs]);
    expect(s.hits.find((h) => h.sfx === 'boost')?.at).toBe(1000 + FLIGHT.cloudLiftMs);
    expect(s.hits.find((h) => h.sfx === 'land')?.at).toBe(f.returnAt! + FLIGHT.returnMs * RETURN_BRAKE_AT);
    expect(s.hits.at(-1)?.at).toBe(f.returnAt! + FLIGHT.returnMs + POD.inDelayMs);
  });

  it('with its banner out ("Siguiente" early): the banner folds first, the launch after its lead', () => {
    const s = flightSounds(nextFlight(PARKED, 'clouds', 0), 'open');
    expect(names(s).slice(0, 2)).toEqual(['banner', 'launch']);
    expect(s.launchAt).toBe(FLIGHT.foldMs + PRELAUNCH.quickMs);
  });

  it('longer clouds move the boost and the end of the slow motion', () => {
    const s = flightSounds(nextFlight(PARKED, 'clouds', 0, 3000), 'crouched');
    expect(s.slowMo?.[1]).toBe(FLIGHT.cloudLiftMs + 3000);
  });

  it('the separation after a block: the slow motion stops as the engine goes out, then the part, the fins, the coughs, the catch', () => {
    const f = nextFlight(PARKED, 'clouds', 0, BLOCK_END_EXTRA_MS);
    const s = flightSounds(f, 'crouched');
    expect(s.slowMo).toEqual([FLIGHT.appearMs, SEPARATION.engineOffMs]);
    expect(names(s)).toEqual(['launch', 'separate', 'clack', 'ignite', 'ignite', 'ignite', 'boost', 'land', 'banner']);
    // (the fins' clack while they spring out)
    const clack = s.hits.find((h) => h.sfx === 'clack')?.at ?? NaN;
    expect(clack).toBeGreaterThan(SEPARATION.finsMs);
    expect(clack).toBeLessThan(SEPARATION.finsMs + SEPARATION.finsSpringMs);
    const at = s.hits.map((h) => h.at);
    expect(at).toEqual([...at].sort((x, y) => x - y));
    expect(s.hits.find((h) => h.sfx === 'separate')?.at).toBe(SEPARATION.releaseMs);
    expect(s.hits.filter((h) => h.sfx === 'ignite').map((h) => h.at)).toEqual([...SEPARATION.sputtersMs, SEPARATION.catchMs]);
    expect(s.hits.find((h) => h.sfx === 'boost')?.at).toBe(SEPARATION.liftMs);
  });

  it('waiting in its place as the clouds play again: no launch, slow motion from now', () => {
    const f = { leftAt: 500, how: 'clouds' as const, placed: true, returnAt: 9000 };
    const s = flightSounds(f, 'crouched');
    expect(s.launchAt).toBeNull();
    expect(names(s)).toEqual(['boost', 'land', 'banner']);
    expect(s.slowMo?.[0]).toBe(500);
  });

  it('the last takeoff: launch and nothing after', () => {
    const s = flightSounds(nextFlight(PARKED, 'end', 0), 'crouched');
    expect(names(s)).toEqual(['launch']);
    expect(s.slowMo).toBeNull();
  });

  it('the arrival and an interrupted flight only sound on the way back', () => {
    expect(names(flightSounds(arrival(200), 'open'))).toEqual(['land', 'banner']);
    const fade = { leftAt: 0, how: 'fade' as const, returnAt: 3000 };
    expect(flightSounds(fade, 'open').launchAt).toBeNull();
    expect(names(flightSounds(fade, 'open'))).toEqual(['land', 'banner']);
  });
});

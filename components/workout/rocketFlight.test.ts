import { describe, expect, it } from 'vitest';
import { exercise } from '@/lib/routine/fixtures.test-helpers';
import { TALK_LEAD_MS } from '@/lib/routine/duration';
import type { RoutineItem } from '@/types/workout';
import {
  AWAY_POSE,
  CLOUDS,
  CLOUD_TIMING,
  FLIGHT,
  PARKED,
  PARKED_AFTER_CLOUDS_MS,
  PARKED_POSE,
  RETURN_KEYFRAMES,
  TAKEOFF_KEYFRAMES,
  arrival,
  bigRocketVisibleAt,
  ignitionLevel,
  launchesAfter,
  nextFlight,
  parkedFrom,
  phaseAt,
  pose,
  widgetVisibleAt,
  type Flight,
  type FlightEvent,
} from './rocketFlight';

describe('cloud timing', () => {
  it('opens the clouds exactly when a long rest starts its talks', () => {
    expect(CLOUDS.openingMs).toBe(TALK_LEAD_MS);
    expect(CLOUD_TIMING.closeMs + CLOUD_TIMING.staggerMs + CLOUD_TIMING.holdMs).toBe(TALK_LEAD_MS);
    expect(CLOUD_TIMING.liftMs + CLOUD_TIMING.liftLeadMs).toBe(TALK_LEAD_MS);
  });
});

describe('hand-over between the two rockets (phone)', () => {
  it('lets the big rocket rise only after the widget rocket has gone, and the widget come back only after the big one has gone', () => {
    expect(FLIGHT.bigRiseStartMs).toBeGreaterThan(FLIGHT.takeoffMs);
    expect(FLIGHT.bigRiseEndMs - FLIGHT.bigRiseStartMs).toBeGreaterThanOrEqual(600);
    expect(FLIGHT.bigRiseEndMs).toBeLessThan(CLOUD_TIMING.liftMs);
    expect(FLIGHT.returnStartMs).toBeGreaterThan(FLIGHT.bigGoneMs);
  });

  it('parks again before the clouds would let the shortest rest end, and after they have gone', () => {
    expect(PARKED_AFTER_CLOUDS_MS).toBeGreaterThan(CLOUDS.clearMs);
    expect(PARKED_AFTER_CLOUDS_MS).toBeLessThan(6000); // the shortest rest is 10 s
  });

  it('starts its content fade with the takeoff and settles within the return', () => {
    expect(FLIGHT.contentOutMs).toBeLessThanOrEqual(FLIGHT.anticipationMs);
    expect(FLIGHT.settleMs).toBeLessThan(FLIGHT.returnMs);
  });

  // Walk a sequence of events and sample every 10 ms: the widget rocket and the big rocket of the
  // latest cloud run are never visible at the same moment.
  const check = (events: [number, FlightEvent][], until: number) => {
    let f = arrival(0);
    let clouds: number | null = null;
    let k = 0;
    for (let t = 0; t <= until; t += 10) {
      while (k < events.length && events[k][0] <= t) {
        const [at, event] = events[k++];
        f = nextFlight(f, event, at);
        if (event === 'clouds') clouds = at;
      }
      const big = clouds !== null && bigRocketVisibleAt(t - clouds);
      if (big) expect({ t, widget: widgetVisibleAt(f, t) }).toEqual({ t, widget: false });
    }
    return f;
  };

  it('holds for a plain rest', () => {
    const f = check([[5000, 'clouds']], 15000);
    expect(phaseAt(f, 5000 + PARKED_AFTER_CLOUDS_MS)).toBe('parked');
  });

  it('holds when skips start the clouds again at any moment of a flight', () => {
    for (let second = 30; second <= 6000; second += 170) {
      check(
        [
          [2000, 'clouds'],
          [2000 + second, 'clouds'],
        ],
        16000,
      );
    }
  });

  it('holds for a burst of jumps (the fixture walking the routine)', () => {
    check(
      [
        [2000, 'clouds'],
        [2016, 'clouds'],
        [2032, 'clouds'],
        [4100, 'clouds'],
        [4116, 'end'],
        [9000, 'show'],
        [9500, 'clouds'],
      ],
      20000,
    );
  });
});

describe('the rocket after any interruption', () => {
  it('arrives once when the player opens', () => {
    const f = arrival(1000);
    expect(phaseAt(f, 1000)).toBe('returning');
    expect(phaseAt(f, 1000 + FLIGHT.returnMs)).toBe('parked');
  });

  it('takes off and comes back when a rest begins', () => {
    const f = nextFlight(PARKED, 'clouds', 0);
    expect(f).toEqual({ leftAt: 0, how: 'takeoff', returnAt: FLIGHT.returnStartMs });
    expect(phaseAt(f, 100)).toBe('leaving');
    expect(phaseAt(f, FLIGHT.takeoffMs + 1)).toBe('away');
    expect(phaseAt(f, FLIGHT.returnStartMs + 1)).toBe('returning');
    expect(parkedFrom(f)).toBe(PARKED_AFTER_CLOUDS_MS);
  });

  it('keeps flying out (no second takeoff) when the clouds start again while it leaves', () => {
    const f = nextFlight(nextFlight(PARKED, 'clouds', 0), 'clouds', 500);
    expect(f.leftAt).toBe(0);
    expect(f.how).toBe('takeoff');
    expect(f.returnAt).toBe(500 + FLIGHT.returnStartMs);
  });

  it('fades where it is when it is needed away while coming back', () => {
    const coming = nextFlight(PARKED, 'clouds', 0);
    const t = FLIGHT.returnStartMs + 300;
    const f = nextFlight(coming, 'clouds', t);
    expect(f).toEqual({ leftAt: t, how: 'fade', returnAt: t + FLIGHT.returnStartMs });
    expect(phaseAt(f, t + FLIGHT.fadeMs)).toBe('away');
  });

  it('leaves for good at the end and comes back when the routine starts again', () => {
    const end = nextFlight(PARKED, 'end', 0);
    expect(end.returnAt).toBeNull();
    expect(phaseAt(end, 60_000)).toBe('away');
    expect(parkedFrom(end)).toBe(Infinity);
    // asked back before it has finished leaving: it comes back once it has
    const early = nextFlight(end, 'show', 200);
    expect(early.returnAt).toBe(FLIGHT.takeoffMs);
    const back = nextFlight(end, 'show', 9000);
    expect(back.returnAt).toBe(9000);
    expect(phaseAt(back, 9000 + FLIGHT.returnMs)).toBe('parked');
  });

  it('ignores "show" when it is parked or already coming back', () => {
    expect(nextFlight(PARKED, 'show', 10)).toBe(PARKED);
    const coming: Flight = nextFlight(PARKED, 'clouds', 0);
    expect(nextFlight(coming, 'show', 100)).toBe(coming);
  });

  it('is never left away by a rest: every cloud run ends parked', () => {
    let f: Flight = PARKED;
    const times = [0, 40, 900, 1400, 2600, 3500, 3900, 4600];
    times.forEach((t) => {
      f = nextFlight(f, 'clouds', t);
    });
    expect(phaseAt(f, 4600 + PARKED_AFTER_CLOUDS_MS)).toBe('parked');
  });
});

describe('ignition', () => {
  const serie = (title: string): RoutineItem => ({
    kind: 'workout',
    exercise: exercise(title, ['gluteos']),
    round: 1,
    totalRounds: 1,
    exerciseIndexInRound: 1,
    totalExercisesPerRound: 2,
  });
  const rest: RoutineItem = {
    kind: 'rest',
    duration: 12,
    prepSeconds: 0,
    nextExercise: exercise('b', ['gluteos']),
    nextRound: 1,
    totalRounds: 1,
    isEndOfRound: false,
    restKind: 'short',
    talks: [],
  };

  it('lights only before a rest or the end', () => {
    const outro = { kind: 'outro', duration: 8 } as unknown as RoutineItem;
    const queue: RoutineItem[] = [{ kind: 'warmup', exercise: exercise('w', ['gluteos']) }, { kind: 'warmup', exercise: exercise('w2', ['gluteos']) }, rest, serie('a'), serie('b'), outro];
    expect(queue.map((_, i) => launchesAfter(queue, i))).toEqual([false, true, false, false, true, false]);
  });

  it('grows one step each of the last three seconds', () => {
    // as the clock shows it: 2.2 s left reads "0:03"
    expect([10, 4, 3.4, 3, 2.2, 2, 1, 0.3, 0].map(ignitionLevel)).toEqual([0, 0, 0, 1, 1, 2, 3, 3, 3]);
  });
});

describe('poses', () => {
  const fns = (transform: string) => transform.match(/[a-zA-Z0-9]+(?=\()/g)?.filter((f) => f !== 'calc');

  it('use the same list of functions, so every pair interpolates', () => {
    const all = [...TAKEOFF_KEYFRAMES, ...RETURN_KEYFRAMES].map((k) => fns(k.transform));
    all.forEach((list) => expect(list).toEqual(fns(PARKED_POSE)));
  });

  it('start and end where they should', () => {
    expect(TAKEOFF_KEYFRAMES[0].transform).toBe(PARKED_POSE);
    expect(AWAY_POSE.opacity).toBe(0);
    expect(RETURN_KEYFRAMES[0].opacity).toBe(0);
    expect(RETURN_KEYFRAMES.at(-1)).toMatchObject({ transform: PARKED_POSE, opacity: 1, offset: 1 });
    [TAKEOFF_KEYFRAMES, RETURN_KEYFRAMES].forEach((keys) => {
      const offsets = keys.map((k) => k.offset);
      expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    });
  });

  it('turns the apparent size into depth', () => {
    expect(pose({ s: 0.5 })).toContain('translate3d(calc(0px / 0.5), calc(0px / 0.5), -900px)');
    expect(PARKED_POSE).toContain(', 0px) rotateZ(0deg) rotateY(0deg) scale(1, 1)');
  });
});

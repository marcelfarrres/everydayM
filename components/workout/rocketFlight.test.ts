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
  POD,
  RETURN_KEYFRAMES,
  SINK,
  SPUTTER,
  SPUTTER_FLAME_KEYFRAMES,
  SPUTTER_KEYFRAMES,
  TAKEOFF_KEYFRAMES,
  TAKEOFF_OFFSCREEN_AT,
  UPRIGHT,
  arrival,
  bigRocketVisibleAt,
  controlsLiveAt,
  controlsLiveFrom,
  ignitionLevel,
  launchesAfter,
  nextFlight,
  parkedFrom,
  phaseAt,
  podOutFrom,
  podShownAt,
  pose,
  sinkAt,
  sinkTransform,
  springBackKeyframes,
  sputtersBetween,
  widgetOnScreenAt,
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

  it('holds a beat with no rocket on screen between one leaving and the other arriving, both ways', () => {
    // the widget rocket is out of the top by this moment of its takeoff
    const widgetGone = FLIGHT.takeoffMs * TAKEOFF_OFFSCREEN_AT;
    expect(FLIGHT.bigRiseStartMs - widgetGone).toBeGreaterThanOrEqual(300);
    expect(FLIGHT.bigRiseStartMs - FLIGHT.takeoffMs).toBeGreaterThanOrEqual(FLIGHT.handoverBeatMs);
    expect(FLIGHT.returnStartMs - FLIGHT.bigGoneMs).toBeGreaterThanOrEqual(FLIGHT.handoverBeatMs);
    expect(FLIGHT.handoverBeatMs).toBeGreaterThanOrEqual(250);
    // the takeoff keyframe for "out of the top" is a whole screen up
    const out = TAKEOFF_KEYFRAMES.find((k) => k.offset === TAKEOFF_OFFSCREEN_AT);
    expect(out?.transform).toContain('-100vh');
    expect(out?.opacity).toBe(1);
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
      // and the beat: no big rocket for a while after the widget one was last on screen
      if (big && clouds !== null && t - clouds < FLIGHT.bigRiseStartMs + 10) {
        expect(widgetOnScreenAt(f, t - FLIGHT.handoverBeatMs)).toBe(false);
      }
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

describe('the control pod and the controls', () => {
  it('is out while parked, goes in at the start of a takeoff and pops out once it has parked again', () => {
    expect(podShownAt(PARKED, 0)).toBe(true);
    const f = nextFlight(PARKED, 'clouds', 1000);
    expect(podShownAt(f, 1000 + POD.outMs / 2)).toBe(true); // going in
    expect(POD.outMs).toBeLessThanOrEqual(FLIGHT.anticipationMs); // in before the rocket moves off
    expect(podShownAt(f, 1000 + POD.outMs + 1)).toBe(false);
    expect(podShownAt(f, 1000 + FLIGHT.takeoffMs + 10)).toBe(false); // away
    expect(podShownAt(f, 1000 + FLIGHT.returnStartMs + 100)).toBe(false); // coming back
    const parked = parkedFrom(f);
    expect(podShownAt(f, parked + 1)).toBe(false); // the squash first
    expect(podShownAt(f, parked + POD.inDelayMs)).toBe(true);
    expect(podOutFrom(f)).toBe(parked + POD.inDelayMs + POD.inMs);
  });

  it('never shows the pod while the rocket fades, and keeps it in for good at the end', () => {
    const coming = nextFlight(PARKED, 'clouds', 0);
    const t = FLIGHT.returnStartMs + 300;
    const fade = nextFlight(coming, 'clouds', t);
    expect(podShownAt(fade, t + 10)).toBe(false);
    const end = nextFlight(PARKED, 'end', 0);
    expect(podShownAt(end, 60_000)).toBe(false);
    expect(podOutFrom(end)).toBe(Infinity);
  });

  it('lets the controls work exactly while it is parked, with a moment to hand back control', () => {
    const f = arrival(500);
    expect(controlsLiveAt(f, 600)).toBe(false);
    expect(controlsLiveFrom(f, 600)).toBe(500 + FLIGHT.returnMs);
    expect(controlsLiveAt(f, 500 + FLIGHT.returnMs)).toBe(true);
    expect(controlsLiveFrom(f, 500 + FLIGHT.returnMs)).toBeNull();
    expect(controlsLiveFrom(nextFlight(PARKED, 'end', 0), 10)).toBeNull(); // away for good: no timer
    expect(controlsLiveAt(PARKED, 0)).toBe(true);
  });

  // Any sequence of interruptions ends in one defined resting pose: parked with the pod out and
  // the controls live, or (after the end) away with the pod in and nothing to press.
  it('always ends in a defined resting pose after any burst of skips, jumps and repeats', () => {
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const events: FlightEvent[] = ['clouds', 'end', 'show'];
    for (let run = 0; run < 300; run++) {
      let f: Flight = rand() < 0.5 ? arrival(0) : PARKED;
      let t = 0;
      let last: FlightEvent = 'show';
      for (let i = 0, n = 1 + Math.floor(rand() * 6); i < n; i++) {
        t += Math.floor(rand() * 6000);
        last = events[Math.floor(rand() * 3)];
        f = nextFlight(f, last, t);
      }
      const later = t + PARKED_AFTER_CLOUDS_MS + POD.inDelayMs + POD.inMs + 10;
      const phase = phaseAt(f, later);
      expect(['parked', 'away']).toContain(phase);
      expect(podShownAt(f, later)).toBe(phase === 'parked');
      expect(controlsLiveAt(f, later)).toBe(phase === 'parked');
      if (phase === 'away') expect(f.returnAt).toBeNull();
      if (last === 'clouds') expect(phase).toBe('parked');
    }
  });
});

describe('the warm-up sputter', () => {
  const warm = (title: string): RoutineItem => ({ kind: 'warmup', exercise: exercise(title, ['gluteos']) });

  it('happens between two warm-up clips, and nowhere else', () => {
    const a = warm('a');
    const b = warm('b');
    expect(sputtersBetween(a, b)).toBe(true);
    expect(sputtersBetween(b, a)).toBe(true);
    expect(sputtersBetween(a, a)).toBe(false);
    expect(sputtersBetween(undefined, a)).toBe(false);
    expect(sputtersBetween(a, { kind: 'outro', duration: 8 } as unknown as RoutineItem)).toBe(false);
  });

  it('lasts about a second and lands where it was', () => {
    expect(SPUTTER.ms).toBeGreaterThanOrEqual(800);
    expect(SPUTTER.ms).toBeLessThanOrEqual(1200);
    expect(SPUTTER_KEYFRAMES[0].transform).toBe(SPUTTER_KEYFRAMES.at(-1)?.transform);
    expect(SPUTTER_KEYFRAMES.at(-1)?.transform).toBe('translate(0px, 0px) scale(1, 1)');
    expect(SPUTTER_FLAME_KEYFRAMES.at(-1)?.opacity).toBe(0);
  });

  it('is not a flight: the rocket stays parked and its controls keep working', () => {
    // the sputter never makes a Flight, so whatever was live stays live through it
    for (let t = 0; t <= SPUTTER.ms; t += 50) {
      expect(controlsLiveAt(PARKED, t)).toBe(true);
      expect(podShownAt(PARKED, t)).toBe(true);
    }
  });
});

describe('the rest: it sinks as it fills', () => {
  it('sinks and tilts more as the water rises, from upright to its most', () => {
    expect(sinkAt(0)).toEqual(UPRIGHT);
    expect(sinkAt(1)).toEqual({ y: SINK.maxPx, rz: SINK.maxTilt });
    let prev = sinkAt(0);
    for (let l = 0.05; l <= 1.0001; l += 0.05) {
      const s = sinkAt(l);
      expect(s.y).toBeGreaterThan(prev.y);
      expect(s.rz).toBeLessThan(prev.rz);
      prev = s;
    }
    // half full, it has sunk about half
    expect(sinkAt(0.5).y).toBeCloseTo(SINK.maxPx / 2, 0);
  });

  it('never goes past its most, whatever the clock says', () => {
    expect(sinkAt(-3)).toEqual(UPRIGHT);
    expect(sinkAt(7)).toEqual(sinkAt(1));
    expect(sinkAt(Number.NaN)).toEqual(UPRIGHT);
    expect(Math.abs(SINK.maxTilt)).toBeLessThanOrEqual(3);
  });

  it('springs back upright from wherever it had sunk ("¡pam!")', () => {
    for (const l of [0, 0.3, 1]) {
      const keys = springBackKeyframes(sinkAt(l));
      expect(keys[0].transform).toBe(sinkTransform(sinkAt(l)));
      expect(keys.at(-1)?.transform).toBe(sinkTransform(UPRIGHT));
    }
    expect(sinkTransform(UPRIGHT)).toBe('translateY(0px) rotate(0deg)');
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

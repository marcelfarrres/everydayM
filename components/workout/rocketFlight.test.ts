import { describe, expect, it } from 'vitest';
import { exercise } from '@/lib/routine/fixtures.test-helpers';
import { TALK_LEAD_MS } from '@/lib/routine/duration';
import type { RoutineItem } from '@/types/workout';
import {
  AWAY_POSE,
  CLOUDS,
  CLOUD_TIMING,
  FLIGHT,
  FOLD_AT,
  HOP,
  LAUNCH_OFFSCREEN_AT,
  launchKeyframes,
  PREVIEW,
  PREVIEW_OUT_AFTER_REST_MS,
  RUN_PAST,
  SHAKE,
  engineShake,
  warningFlame,
  warningLevel,
  riseKeyframes,
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
  UPRIGHT_AT,
  CLOUD_LEAVE_MS,
  CLOUD_OFFSCREEN_AT,
  WORDS,
  arrival,
  cloudKeyframes,
  cloudFlameKeyframes,
  railTop,
  controlsLiveAt,
  controlsLiveFrom,
  ignitionLevel,
  launchesAfter,
  nextFlight,
  nudge,
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

describe('one rocket through the clouds (phone)', () => {
  const spot = { dx: -60, dy: -420, k: 1.35 };

  it('stays in the clouds long enough to read the words, and takes off once, as they are about to open', () => {
    // the words are in by WORDS.phoneDelayMs + fadeMs and go as it takes off
    const readable = FLIGHT.cloudLiftMs - (WORDS.phoneDelayMs + WORDS.fadeMs);
    expect(readable).toBeGreaterThanOrEqual(2450);
    // it is in its place before the words come in, and while the clouds close
    expect(FLIGHT.settledMs).toBeLessThanOrEqual(WORDS.phoneDelayMs + WORDS.fadeMs);
    expect(FLIGHT.placedMs).toBeGreaterThan(CLOUD_TIMING.closeMs);
    expect(FLIGHT.cloudLiftMs).toBe(CLOUD_TIMING.liftMs);
    expect(CLOUD_LEAVE_MS).toBe(FLIGHT.cloudLiftMs + FLIGHT.cloudExitMs);
  });

  it('is one object on screen all the way, from parked to out of the top, and comes back after a beat', () => {
    const f = nextFlight(PARKED, 'clouds', 0);
    expect(f.how).toBe('clouds');
    expect(widgetOnScreenAt(f, FLIGHT.placedMs)).toBe(true);
    expect(widgetOnScreenAt(f, FLIGHT.cloudLiftMs + 100)).toBe(true);
    const gone = FLIGHT.cloudLiftMs + FLIGHT.cloudExitMs * CLOUD_OFFSCREEN_AT;
    expect(widgetOnScreenAt(f, gone + 1)).toBe(false);
    expect(FLIGHT.returnStartMs - gone).toBeGreaterThanOrEqual(FLIGHT.handoverBeatMs);
    expect(phaseAt(f, CLOUD_LEAVE_MS + 1)).toBe('away');
    expect(phaseAt(f, PARKED_AFTER_CLOUDS_MS)).toBe('parked');
  });

  it('goes to its place in one move, waits there nose up and full size, and climbs straight out', () => {
    const keys = cloudKeyframes(spot);
    const at = (ms: number) => keys.find((k) => Math.abs(k.offset - ms / CLOUD_LEAVE_MS) < 0.0002);
    expect(keys[0].transform).toBe(PARKED_POSE);
    expect(at(FLIGHT.foldMs)?.transform).toBe(PARKED_POSE);
    const placed = at(FLIGHT.settledMs)?.transform;
    expect(placed).toContain('rotateZ(-90deg)');
    expect(placed).toContain('calc((-60px) / 1)');
    expect(placed).toContain('scale(1.35, 1.35)');
    // still until it takes off
    expect(at(FLIGHT.cloudLiftMs - 180)?.transform).toBe(placed);
    // out of the top, still opaque, then gone; straight up (the same x)
    const out = at(FLIGHT.cloudLiftMs + FLIGHT.cloudExitMs * CLOUD_OFFSCREEN_AT);
    expect(out?.transform).toContain('- 100vh - 400px');
    expect(out?.transform).toContain('calc((-60px) / 1)');
    expect(out?.opacity).toBe(1);
    expect(keys.at(-1)).toMatchObject({ offset: 1, opacity: 0 });
    keys.forEach((k) => expect(k.opacity === 1 || k.offset === 1).toBe(true));
    const offsets = keys.map((k) => k.offset);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
    // the flame keeps the same moments
    expect(cloudFlameKeyframes().at(-1)?.offset).toBe(1);
  });

  it('stays in its place when the clouds play again while it waits there', () => {
    const f = nextFlight(PARKED, 'clouds', 0);
    const again = nextFlight(f, 'clouds', 2000);
    expect(again).toEqual({ leftAt: 2000, how: 'clouds', placed: true, returnAt: 2000 + FLIGHT.returnStartMs });
    expect(podShownAt(again, 2010)).toBe(false);
    const placed = cloudKeyframes(spot, true);
    expect(placed[0].transform).toBe(cloudKeyframes(spot)[4].transform);
    // once it has taken off it just flies on, and comes back later
    expect(nextFlight(f, 'clouds', FLIGHT.cloudLiftMs + 200)).toEqual({ ...f, returnAt: FLIGHT.cloudLiftMs + 200 + FLIGHT.returnStartMs });
  });

  it('stands on the rail of the routine, from low (start) to high (done)', () => {
    expect(railTop(0)).toBe(66);
    expect(railTop(1)).toBe(22);
    expect(railTop(7)).toBe(22);
  });

  it('parks again before the clouds would let the shortest rest end, and after they have gone', () => {
    expect(PARKED_AFTER_CLOUDS_MS).toBeGreaterThan(CLOUDS.clearMs);
    expect(PARKED_AFTER_CLOUDS_MS).toBeLessThan(7000); // the shortest rest is 10 s
  });

  it('folds the banner in before it moves, and settles within the return', () => {
    expect(POD.outMs).toBe(FLIGHT.foldMs);
    expect(TAKEOFF_KEYFRAMES.find((k) => k.offset === FOLD_AT)?.transform).toBe(PARKED_POSE);
    expect(FLIGHT.foldMs).toBeLessThan(FLIGHT.anticipationMs);
    expect(FLIGHT.settleMs).toBeLessThan(FLIGHT.returnMs);
  });

  it('at the end of the routine, takes off straight out of the top, at full size and opaque', () => {
    const climbing = TAKEOFF_KEYFRAMES.filter((k) => k.offset >= UPRIGHT_AT);
    expect(climbing.length).toBeGreaterThanOrEqual(3);
    climbing.forEach((k) => {
      expect(k.transform).toContain('rotateZ(-90deg)');
      expect(k.transform).toContain('translate3d(calc((0px) / 1)');
    });
    TAKEOFF_KEYFRAMES.forEach((k) => {
      expect(k.transform).toMatch(/, 0px\) rotateZ/);
      if (k.offset <= TAKEOFF_OFFSCREEN_AT) expect(k.opacity).toBe(1);
    });
    expect(nextFlight(PARKED, 'end', 0).how).toBe('takeoff');
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
    expect(f).toEqual({ leftAt: 0, how: 'clouds', returnAt: FLIGHT.returnStartMs });
    expect(phaseAt(f, 100)).toBe('leaving');
    expect(phaseAt(f, CLOUD_LEAVE_MS + 1)).toBe('away');
    expect(phaseAt(f, FLIGHT.returnStartMs + 1)).toBe('returning');
    expect(parkedFrom(f)).toBe(PARKED_AFTER_CLOUDS_MS);
  });

  it('keeps flying out (no second takeoff) when the clouds start again while it leaves', () => {
    const f = nextFlight(nextFlight(PARKED, 'clouds', 0), 'clouds', 500);
    expect(f.leftAt).toBe(0);
    expect(f.how).toBe('clouds');
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

  it('springs the banner out half a second after it lands', () => {
    expect(POD.inDelayMs).toBeGreaterThanOrEqual(400);
    expect(POD.inDelayMs).toBeLessThanOrEqual(700);
  });

  it('lets the controls work only once it is parked and its banner is coming out', () => {
    const f = arrival(500);
    const parked = 500 + FLIGHT.returnMs;
    expect(controlsLiveAt(f, 600)).toBe(false);
    expect(controlsLiveFrom(f, 600)).toBe(parked + POD.inDelayMs);
    expect(controlsLiveAt(f, parked)).toBe(false); // landed, no banner yet
    expect(controlsLiveAt(f, parked + POD.inDelayMs)).toBe(true);
    expect(controlsLiveFrom(f, parked + POD.inDelayMs)).toBeNull();
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
    expect(SPUTTER_KEYFRAMES.at(-1)?.transform).toBe(nudge({}));
    expect(nudge({})).toBe('translate(0px, 0px) rotate(0deg) scale(1, 1)');
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
    // it really tilts now (the tail dips off the screen: see rocketShape.test), but not over
    expect(Math.abs(SINK.maxTilt)).toBeGreaterThanOrEqual(5);
    expect(Math.abs(SINK.maxTilt)).toBeLessThanOrEqual(8);
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

// (the routine creator's tilt, as CreatorRocket's CREATOR.tilt: a client module, not imported here)
const CREATOR_TILT = -12;

describe('the window of the next exercise (a long rest with talks)', () => {
  it('springs out of the rocket just after its banner, once the rocket has parked', () => {
    expect(PREVIEW.lagMs).toBeGreaterThanOrEqual(150);
    expect(PREVIEW.lagMs).toBeLessThanOrEqual(250);
    expect(PREVIEW_OUT_AFTER_REST_MS).toBe(PARKED_AFTER_CLOUDS_MS + POD.inDelayMs + PREVIEW.lagMs);
    // the clouds are gone by then, and the banner has started to come out
    expect(PREVIEW_OUT_AFTER_REST_MS).toBeGreaterThan(CLOUDS.clearMs);
    expect(PREVIEW_OUT_AFTER_REST_MS).toBeGreaterThan(PARKED_AFTER_CLOUDS_MS + POD.inDelayMs);
  });
});

describe('the warning before the ignition', () => {
  it('lights a small blue flame at 10 s and grows it steadily until the ignition takes over', () => {
    expect(warningLevel(12)).toBe(0);
    expect(warningLevel(10)).toBe(0);
    expect(warningLevel(9.9)).toBeGreaterThan(0);
    let prev = 0;
    for (let t = 9.5; t > 3.01; t -= 0.5) {
      const w = warningLevel(t);
      expect(w).toBeGreaterThan(prev);
      prev = w;
    }
    expect(warningLevel(3.05)).toBeGreaterThan(0.95);
    // from the ignition on, the red flame is the one
    expect(warningLevel(3)).toBe(0);
    expect(warningLevel(1)).toBe(0);
    // its last size is the ignition's first step (IGNITION[1] in the widget: 0.32 x 0.7)
    const last = warningFlame(1);
    expect(Math.abs(last.sx - 0.32)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(last.sy - 0.7)).toBeLessThanOrEqual(0.03);
  });

  it('shakes a little from 10 s, more and more, and meets the ignition without a jump', () => {
    expect(engineShake(11).amp).toBe(0);
    expect(engineShake(10).amp).toBeGreaterThan(0);
    expect(engineShake(10).amp).toBeLessThan(0.5);
    let prev = 0;
    for (let t = 10; t > 3.01; t -= 0.5) {
      const a = engineShake(t).amp;
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
    expect(Math.abs(engineShake(3.02).amp - engineShake(3).amp)).toBeLessThanOrEqual(0.15);
    expect(engineShake(3).amp).toBe(SHAKE.rocket[1]);
    expect(engineShake(0.5).amp).toBe(SHAKE.rocket[3]);
  });
});

describe('landing with a run-up', () => {
  it('runs past its place and off the screen a little, pulls back, and parks', () => {
    const atPlace = RETURN_KEYFRAMES.findIndex((k) => k.transform.includes('calc((0px) / 1)'));
    const past = RETURN_KEYFRAMES.findIndex((k) => k.transform.includes(`calc((${RUN_PAST}) / 1)`));
    expect(atPlace).toBeGreaterThan(0);
    expect(past).toBeGreaterThan(atPlace);
    expect(parseFloat(RUN_PAST)).toBeGreaterThanOrEqual(15); // its nose leaves the screen
    // then back past its place the other way, and parked
    expect(RETURN_KEYFRAMES[past + 1].transform).toMatch(/calc\(\(-\d+px\) \/ 1\)/);
    expect(RETURN_KEYFRAMES.at(-1)).toMatchObject({ transform: PARKED_POSE, opacity: 1, offset: 1 });
    // the run-up takes longer than before but it parks before the shortest rest is over
    expect(FLIGHT.returnMs).toBeGreaterThanOrEqual(1500);
    expect(PARKED_AFTER_CLOUDS_MS).toBeLessThan(7000);
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

  it("launch the routine creator's rocket the same way, from its tilt, straight out of the top", () => {
    const keys = launchKeyframes(CREATOR_TILT);
    keys.forEach((k) => expect(fns(k.transform)).toEqual(fns(PARKED_POSE)));
    expect(keys[0]).toMatchObject({ offset: 0, opacity: 1 });
    expect(keys[0].transform).toContain(`rotateZ(${CREATOR_TILT}deg)`);
    expect(keys.at(-1)).toMatchObject({ offset: 1, opacity: 0 });
    // nose up from the turn on, and out of the top at LAUNCH_OFFSCREEN_AT, still opaque
    keys.filter((k) => k.offset >= LAUNCH_OFFSCREEN_AT - 0.3).forEach((k) => expect(k.transform).toContain('rotateZ(-90deg)'));
    expect(keys.find((k) => Math.abs(k.offset - LAUNCH_OFFSCREEN_AT) < 0.002)).toMatchObject({ opacity: 1 });
    expect(keys.find((k) => Math.abs(k.offset - LAUNCH_OFFSCREEN_AT) < 0.002)?.transform).toContain('-100vh');
    // a hop between two questions, out and back up, stays within about 0.7 s
    expect(HOP.hopMs * LAUNCH_OFFSCREEN_AT + HOP.riseMs).toBeLessThanOrEqual(750);
    // and the next rocket rises from below into its tilt
    expect(riseKeyframes(CREATOR_TILT).at(-1)?.transform).toBe(`translateY(0px) rotate(${CREATOR_TILT}deg)`);
  });

  it('turns the apparent size into depth', () => {
    expect(pose({ s: 0.5 })).toContain('translate3d(calc((0px) / 0.5), calc((0px) / 0.5), -900px)');
    expect(PARKED_POSE).toContain(', 0px) rotateZ(0deg) rotateY(0deg) scale(1, 1)');
  });
});

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
  CROUCH_POSE,
  PRELAUNCH,
  PRELAUNCH_KEYFRAMES,
  REPAIR,
  STANDS,
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
  crouchAt,
  launchLeadMs,
  repairPlan,
  sinkTransform,
  springBackKeyframes,
  takeoffKeyframes,
  sputtersBetween,
  waitingEngine,
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

  it('stays in the clouds long enough to read the words, and leaves once, as they are about to open', () => {
    // the words are in by WORDS.phoneDelayMs + fadeMs and go as it leaves (0.45 s shorter since 25-11-2026)
    const readable = FLIGHT.cloudLiftMs - (WORDS.phoneDelayMs + WORDS.fadeMs);
    expect(readable).toBeGreaterThanOrEqual(2000);
    expect(TALK_LEAD_MS).toBe(3370);
    // it is back in sight, rising slowly, before the words come in
    expect(FLIGHT.slowMs).toBeLessThanOrEqual(WORDS.phoneDelayMs + WORDS.fadeMs + 600);
    expect(FLIGHT.cloudLiftMs).toBe(CLOUD_TIMING.liftMs);
    expect(CLOUD_LEAVE_MS).toBe(FLIGHT.cloudLiftMs + FLIGHT.cloudExitMs);
  });

  it('is one object on screen all the way, from parked to out of the top, and comes back after a beat', () => {
    const f = nextFlight(PARKED, 'clouds', 0);
    expect(f.how).toBe('clouds');
    expect(widgetOnScreenAt(f, FLIGHT.slowMs)).toBe(true);
    expect(widgetOnScreenAt(f, FLIGHT.cloudLiftMs + 100)).toBe(true);
    const gone = FLIGHT.cloudLiftMs + FLIGHT.cloudExitMs * CLOUD_OFFSCREEN_AT;
    expect(widgetOnScreenAt(f, gone + 1)).toBe(false);
    expect(FLIGHT.returnStartMs - gone).toBeGreaterThanOrEqual(FLIGHT.handoverBeatMs);
    expect(phaseAt(f, CLOUD_LEAVE_MS + 1)).toBe('away');
    expect(phaseAt(f, PARKED_AFTER_CLOUDS_MS)).toBe('parked');
  });

  it('shoots off to the right, waits out of sight, comes up from below and rises slowly, then leaves by the top', () => {
    const keys = cloudKeyframes(spot, false, 'crouched');
    const at = (ms: number) => keys.find((k) => Math.abs(k.offset - ms / CLOUD_LEAVE_MS) < 0.0002);
    expect(keys[0].transform).toBe(CROUCH_POSE);
    // out by the right edge (where the nose points), on screen until then
    const right = at(FLIGHT.exitRightMs);
    expect(right?.transform).toContain('100vw + 260px');
    expect(right?.opacity).toBe(1);
    expect(FLIGHT.exitRightMs).toBeLessThanOrEqual(450);
    // a pause out of sight (0.5 to 0.8 s)
    const pause = FLIGHT.appearMs - FLIGHT.exitRightMs;
    expect(pause).toBeGreaterThanOrEqual(500);
    expect(pause).toBeLessThanOrEqual(800);
    expect(at(FLIGHT.exitRightMs + 20)?.opacity).toBe(0);
    expect(at(FLIGHT.appearMs - 20)?.opacity).toBe(0);
    // up from below, standing, nose up and at the clouds' size
    const below = at(FLIGHT.appearMs);
    expect(below?.transform).toContain('+ 100vh');
    expect(below?.transform).toContain('rotateZ(-90deg)');
    expect(below?.opacity).toBe(1);
    // slow, but never still: from below its place to above it, at a pace you can see
    const slow = at(FLIGHT.slowMs)?.transform;
    const lift = at(FLIGHT.cloudLiftMs)?.transform;
    expect(slow).toContain(`calc((${spot.dy + FLIGHT.driftPx}px) / 1)`);
    expect(lift).toContain(`calc((${spot.dy - FLIGHT.driftPx}px) / 1)`);
    const pace = (2 * FLIGHT.driftPx) / ((FLIGHT.cloudLiftMs - FLIGHT.slowMs) / 1000);
    expect(pace).toBeGreaterThanOrEqual(30); // px/s
    expect(pace).toBeLessThanOrEqual(120);
    expect(slow).toContain('scale(1.35, 1.35)');
    // then faster out of the top, still opaque, then gone; straight up (the same x)
    const out = at(FLIGHT.cloudLiftMs + FLIGHT.cloudExitMs * CLOUD_OFFSCREEN_AT);
    expect(out?.transform).toContain('- 100vh - 400px');
    expect(out?.transform).toContain('calc((-60px) / 1)');
    expect(out?.opacity).toBe(1);
    expect(keys.at(-1)).toMatchObject({ offset: 1, opacity: 0 });
    const offsets = keys.map((k) => k.offset);
    expect(offsets).toEqual([...offsets].sort((x, y) => x - y));
    // the flame: out while out of sight, low while it rises slowly
    const flame = cloudFlameKeyframes(false, 'crouched');
    const fAt = (ms: number) => flame.find((k) => Math.abs(k.offset - ms / CLOUD_LEAVE_MS) < 0.0002);
    expect(fAt(FLIGHT.exitRightMs + 20)?.opacity).toBe(0);
    expect(fAt(FLIGHT.slowMs)?.transform).toBe('scale(0.55, 0.85)');
    expect(flame.at(-1)?.offset).toBe(1);
    // the part comes off while it is in sight, and has fallen before it leaves
    expect(FLIGHT.dropMs).toBeGreaterThanOrEqual(FLIGHT.slowMs);
  });

  it('stays in its place when the clouds play again while it waits there', () => {
    const f = nextFlight(PARKED, 'clouds', 0);
    const again = nextFlight(f, 'clouds', 2000);
    expect(again).toEqual({ leftAt: 2000, how: 'clouds', placed: true, returnAt: 2000 + FLIGHT.returnStartMs });
    expect(podShownAt(again, 2010)).toBe(false);
    const placed = cloudKeyframes(spot, true);
    expect(placed[0].transform).toContain('rotateZ(-90deg)');
    expect(placed.at(-1)?.transform).toBe(cloudKeyframes(spot).at(-1)?.transform);
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

describe('the rest: the rocket is repaired', () => {
  const inside = (plan: ReturnType<typeof repairPlan>) =>
    [...plan.hits, ...plan.turns, ...plan.puffs, ...plan.swaps.flat()].every((t) => t >= plan.enterEnd && t <= plan.exitStart);

  it('comes in, works and is gone before the rest ends, whatever its length', () => {
    for (const P of [2000, 2500, 3900, 4000, 6000, 9000, 15000, 40000]) {
      const plan = repairPlan(P);
      expect(plan.none).toBe(false);
      expect(plan.enterEnd).toBeGreaterThan(0);
      expect(plan.enterEnd).toBeLessThanOrEqual(plan.exitStart);
      expect(plan.exitStart).toBeLessThan(plan.exitEnd);
      // gone before the "¡pam!" at 0, never cut halfway
      expect(plan.exitEnd).toBeLessThanOrEqual(P - 250);
      expect(inside(plan)).toBe(true);
      expect(plan.hits.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('they enter about 0.6 s, the second a little later, and leave 1.2 s before the end', () => {
    const plan = repairPlan(20000);
    expect(plan.enterEnd).toBe(REPAIR.enterMs + REPAIR.lagMs);
    expect(plan.exitStart).toBe(20000 - REPAIR.exitLeadMs);
    expect(plan.exitEnd - plan.exitStart).toBe(REPAIR.exitMs);
  });

  it('too short for anyone: nothing; short: in, two blows, out', () => {
    expect(repairPlan(1900).none).toBe(true);
    expect(repairPlan(Number.NaN).none).toBe(true);
    expect(repairPlan(-5).none).toBe(true);
    const short = repairPlan(3000);
    expect(short.short).toBe(true);
    expect(short.hits).toHaveLength(2);
    expect(short.swaps).toHaveLength(0);
    expect(repairPlan(REPAIR.shortBelowMs).short).toBe(false);
  });

  it('the two never move as one: the wrench a third of a beat after the hammer', () => {
    const plan = repairPlan(12000);
    for (const t of plan.turns) expect(plan.hits).not.toContain(t);
    const gap = plan.turns[0] - plan.hits[0];
    expect(gap).toBeGreaterThan(REPAIR.beatMs / 4);
    expect(gap).toBeLessThan(REPAIR.beatMs / 2);
  });

  it('faster in the last 3 s', () => {
    const P = 15000;
    const plan = repairPlan(P);
    const beats = plan.hits.slice(1).map((t, i) => t - plan.hits[i]);
    const early = beats.filter((_, i) => plan.hits[i + 1] < P - REPAIR.fastFromEndMs - 800);
    const late = beats.filter((_, i) => plan.hits[i] > P - REPAIR.fastFromEndMs + REPAIR.beatMs);
    expect(Math.min(...early)).toBeGreaterThanOrEqual(REPAIR.beatMs - 1);
    expect(Math.max(...late)).toBeLessThan(REPAIR.beatMs * 0.8);
  });

  it('they cross over now and then, never while hammering, never in the last stretch', () => {
    const plan = repairPlan(20000);
    expect(plan.swaps.length).toBeGreaterThanOrEqual(2);
    for (const [a, b] of plan.swaps) {
      expect(b - a).toBe(REPAIR.swapMs);
      expect(b).toBeLessThan(plan.exitStart - REPAIR.fastFromEndMs + 601);
      for (const h of plan.hits) expect(h > a - 250 && h < b + 250).toBe(false);
    }
    expect(repairPlan(5000).swaps).toHaveLength(0);
  });

  it('with a talk on, calm: slower, no sparks or jolts', () => {
    const busy = repairPlan(20000);
    const calm = repairPlan(20000, true);
    expect(calm.calm).toBe(true);
    expect(calm.sparks).toBe(false);
    expect(busy.sparks).toBe(true);
    expect(calm.hits.length).toBeLessThan(busy.hits.length);
    expect(calm.hits[1] - calm.hits[0]).toBe(REPAIR.calmBeatMs);
  });

  it('its stands lift it a few px, and it springs back from there ("¡pam!")', () => {
    expect(STANDS.liftPx).toBeGreaterThanOrEqual(2);
    expect(STANDS.liftPx).toBeLessThanOrEqual(6);
    expect(STANDS.lowPx).toBeLessThan(STANDS.liftPx);
    const keys = springBackKeyframes({ y: -STANDS.lowPx, rz: 0 });
    expect(keys[0].transform).toBe(sinkTransform({ y: -STANDS.lowPx, rz: 0 }));
    expect(keys.at(-1)?.transform).toBe(sinkTransform(UPRIGHT));
    expect(sinkTransform(UPRIGHT)).toBe('translateY(0px) rotate(0deg)');
  });
});

describe('the takeoff, led by the clock', () => {
  it('folds its banner first, then crouches in the last 0.7 s, quicker and quicker, all the way at 0', () => {
    expect(crouchAt(5)).toBe(0);
    expect(crouchAt(PRELAUNCH.leadS)).toBe(0);
    expect(crouchAt(0)).toBe(1);
    expect(crouchAt(-1)).toBe(1);
    expect(crouchAt(Number.NaN)).toBe(0);
    let prev = 0;
    let step = 0;
    for (let t = 0.6; t >= -0.0001; t -= 0.1) {
      const c = crouchAt(t);
      expect(c).toBeGreaterThan(prev);
      expect(c - prev).toBeGreaterThanOrEqual(step - 0.001);
      step = c - prev;
      prev = c;
    }
    // nothing moves with the banner out: it has folded in before the crouch starts
    expect(PRELAUNCH.foldLeadS - PRELAUNCH.leadS).toBeGreaterThanOrEqual(POD.outMs / 1000);
    // a more contained crouch than before
    expect(CROUCH_POSE).toContain('scale(0.92, 1.09)');
  });

  it('the crouch goes from parked to the pose the takeoff starts from', () => {
    expect(PRELAUNCH_KEYFRAMES[0].transform).toBe(PARKED_POSE);
    expect(PRELAUNCH_KEYFRAMES.at(-1)?.transform).toBe(CROUCH_POSE);
    expect(takeoffKeyframes('crouched')[0].transform).toBe(CROUCH_POSE);
    expect(cloudKeyframes({ dx: -100, dy: -300, k: 2 }, false, 'crouched')[0].transform).toBe(CROUCH_POSE);
  });

  it('never moves with its banner out: it folds in, then crouches quickly, then goes', () => {
    expect(launchLeadMs('crouched')).toBe(0);
    expect(launchLeadMs('folded')).toBe(PRELAUNCH.quickMs);
    expect(launchLeadMs('open')).toBe(FLIGHT.foldMs + PRELAUNCH.quickMs);
    const from = takeoffKeyframes('crouched');
    // from its crouch, no pause: the next frame is already climbing
    expect(from[1].transform).not.toBe(CROUCH_POSE);
    for (const [start, len] of [
      ['open', FLIGHT.takeoffMs],
      ['folded', FLIGHT.takeoffMs],
    ] as const) {
      const keys = takeoffKeyframes(start);
      const clouds = cloudKeyframes({ dx: -100, dy: -300, k: 2 }, false, start);
      for (const [list, total] of [
        [keys, len],
        [clouds, CLOUD_LEAVE_MS],
      ] as const) {
        // parked until the banner is in (open), then the crouch
        const still = list.filter((k) => k.transform === PARKED_POSE).map((k) => k.offset * total);
        expect(Math.max(...still)).toBeCloseTo(launchLeadMs(start) - PRELAUNCH.quickMs, 0);
        const crouch = list.find((k) => k.transform === CROUCH_POSE);
        expect((crouch?.offset ?? 1) * total).toBeCloseTo(launchLeadMs(start), 0);
        const offsets = list.map((k) => k.offset);
        expect([...offsets].sort((x, y) => x - y)).toEqual(offsets);
      }
      expect(keys.at(-1)?.transform).toBe(from.at(-1)?.transform);
    }
  });

  it('its last tremble is a little softer than before', () => {
    expect(SHAKE.rocket[3]).toBeLessThan(4.6);
    expect(SHAKE.rocket[3]).toBeGreaterThanOrEqual(3);
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

describe("the creator's rocket on the minutes", () => {
  it('burns from almost nothing to a long flare, and trembles harder, the more minutes', () => {
    expect(waitingEngine(0)).toEqual({ flame: 0.06, shake: 0.25 });
    expect(waitingEngine(1)).toEqual({ flame: 2.2, shake: 3 });
    expect(waitingEngine(-1)).toEqual(waitingEngine(0));
    expect(waitingEngine(5)).toEqual(waitingEngine(1));
    expect(waitingEngine(Number.NaN)).toEqual(waitingEngine(0));
    let prev = waitingEngine(0);
    for (let i = 1; i <= 20; i++) {
      const e = waitingEngine(i / 20);
      expect(e.flame).toBeGreaterThan(prev.flame);
      expect(e.shake).toBeGreaterThan(prev.shake);
      prev = e;
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  DOCK,
  FLIGHT,
  PANELS_IN_MS,
  PANELS_OUT_MS,
  PRELAUNCH,
  PREVIEW,
  PREVIEW_OUT_AFTER_REST_MS,
  PARKED_AFTER_CLOUDS_MS,
  ANTICIPATION_AT,
  compressTiming,
  controlsLiveFrom,
  launchLeadMs,
  nextFlight,
  parkedFrom,
  podOutFrom,
  podShownAt,
  prelaunchCompress,
  stretchFrom,
  PARKED,
} from './rocketFlight';
import { PANEL, PANEL_TIME, SHIP, lookTransform, panelLayout, panelRise, segmentAt, stackGeometry, widgetFrame, widgetLayout, type LookPair } from './rocketShape';
import { flightSounds } from './rocketSounds';

/*
 * The bar's dock (phone): parked, the rocket always takes the bar's whole length; it lands at its
 * real length, stretches, and its panels slide out of the hull; it leaves the other way round.
 */

const translate = (t: string) => Number(/translateX\(([-\d.]+)px\)/.exec(t)?.[1] ?? NaN);
const scale = (t: string) => Number(/scaleX\(([-\d.]+)\)/.exec(t)?.[1] ?? 1);

describe('the stretched rocket', () => {
  it('shares the whole body among the stages still on, with the nose and the tail where the whole rocket has them', () => {
    for (const frame of [265, 299, 325, 460]) {
      const whole = stackGeometry({ width: frame, blocks: 4 });
      for (const first of [1, 2, 3, 4]) {
        const full = stackGeometry({ width: frame, blocks: 4, first, stretch: true });
        const real = stackGeometry({ width: frame, blocks: 4, first });
        expect(full.x0).toBeCloseTo(whole.x0, 0);
        expect(full.xs).toBe(whole.xs);
        expect(full.tip).toBe(whole.tip);
        expect(full.segments.map((s) => s.block)).toEqual(real.segments.map((s) => s.block));
        const lengths = full.segments.map((s) => s.end - s.start);
        for (const l of lengths) expect(l).toBeCloseTo((whole.xs - whole.x0) / (5 - first), 0);
        // the stages still on are longer, so the current block's hilo has more room
        if (first > 1) expect(full.segments[0].content.right - full.segments[0].content.left).toBeGreaterThan(real.segments[0].content.right - real.segments[0].content.left);
      }
    }
  });

  it('is the real one when nothing has come off (one block, or all of them still on)', () => {
    expect(stackGeometry({ width: 325, blocks: 1, stretch: true })).toEqual(stackGeometry({ width: 325, blocks: 1 }));
    expect(stackGeometry({ width: 325, blocks: 3, boosters: true, stretch: true })).toEqual(stackGeometry({ width: 325, blocks: 3, boosters: true }));
  });
});

describe('the stretch as transforms (no line gets thicker, the nose keeps its place in the drawing)', () => {
  const L = widgetLayout(378, { blocks: 4, first: 3, boosters: false });
  const pair: LookPair = {
    real: stackGeometry({ width: L.frame, blocks: 4, first: 3 }),
    full: stackGeometry({ width: L.frame, blocks: 4, first: 3, stretch: true }),
    shift: L.ship.shift,
  };

  it('is nothing at the length it is drawn at', () => {
    for (const drawn of [0, 1] as const) {
      expect(translate(lookTransform(pair, drawn, drawn, { kind: 'shift' }))).toBeCloseTo(drawn ? 0 : pair.shift, 6);
      expect(lookTransform(pair, drawn, drawn, { kind: 'tail' })).toBe('translateX(0px)');
      for (const block of [3, 4]) {
        expect(lookTransform(pair, drawn, drawn, { kind: 'start', block })).toBe('translateX(0px)');
        expect(lookTransform(pair, drawn, drawn, { kind: 'end', block })).toBe('translateX(0px)');
        expect(lookTransform(pair, drawn, drawn, { kind: 'body', block, left: 0 })).toBe('translateX(0px) scaleX(1)');
      }
    }
  });

  it('shows the drawing of one length exactly where the other has its parts', () => {
    for (const [drawn, u] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const from = drawn ? pair.full : pair.real;
      const to = u ? pair.full : pair.real;
      for (const s of from.segments) {
        const t = to.segments.find((x) => x.block === s.block)!;
        const body = lookTransform(pair, drawn, u, { kind: 'body', block: s.block, left: 0 });
        // x' = tx + k·x, from the frame's left edge
        expect(translate(body) + scale(body) * s.start).toBeCloseTo(t.start, 1);
        expect(translate(body) + scale(body) * s.end).toBeCloseTo(t.end, 1);
        // its hilo (from its own left edge) lands inside the new segment
        const hilo = lookTransform(pair, drawn, u, { kind: 'body', block: s.block, left: s.content.left });
        const left = s.content.left + translate(hilo);
        expect(left).toBeGreaterThan(t.start);
        expect(left + scale(hilo) * (s.content.right - s.content.left)).toBeLessThan(t.end);
        expect(s.end + translate(lookTransform(pair, drawn, u, { kind: 'end', block: s.block }))).toBeCloseTo(t.end, 1);
        expect(s.start + translate(lookTransform(pair, drawn, u, { kind: 'start', block: s.block }))).toBeCloseTo(t.start, 1);
      }
      expect(from.x0 + translate(lookTransform(pair, drawn, u, { kind: 'tail' }))).toBeCloseTo(to.x0, 1);
    }
  });

  it('moves the nose only with the drawing, and stretches about the middle where the whole rocket stands', () => {
    const nose = (u: number) => pair.real.xs + translate(lookTransform(pair, 0, u, { kind: 'shift' }));
    expect(nose(1) - nose(0)).toBeCloseTo(-pair.shift, 6);
    // the middle of what shows stays put, all the way
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      const shift = translate(lookTransform(pair, 0, u, { kind: 'shift' }));
      const tail = segmentAt(pair, 3, u)!.start;
      expect((tail + pair.real.xs) / 2 + shift).toBeCloseTo((pair.full.x0 + pair.full.xs) / 2, 0);
    }
  });
});

describe('the panels', () => {
  for (const vw of [320, 360, 390, 430]) {
    it(`stand on the hull's straight part, flush on its top line, reaching into it (${vw} px)`, () => {
      const L = widgetLayout(vw - 12);
      const whole = stackGeometry({ width: L.frame });
      const P = panelLayout(L);
      expect(P.left).toBeCloseTo(L.ship.left + whole.x0, 1);
      expect(P.right).toBeCloseTo(L.ship.left + whole.xs, 1);
      expect(P.base).toBe(L.ship.top + SHIP.F);
      expect(P.base - P.top).toBe(PANEL.H);
      expect(P.clip).toBeGreaterThan(P.base);
      // they reach far enough into the hull for its "¡pam!" (a 0.7 squash from its belly) and its stands
      expect(P.clip - P.base).toBeGreaterThanOrEqual(SHIP.T * 0.3 + 4);
      expect(P.clip).toBeLessThan(P.base + SHIP.T);
      expect(P.top).toBeGreaterThanOrEqual(0);
      // two panels side by side: the controls (three 44 px targets) and the name and time
      // (on a narrow phone the rocket takes more of the width, so the name still has room: 25-11-2026)
      expect(P.right - P.left - PANEL.SEAM - 3 * 44).toBeGreaterThanOrEqual(95);
      // with the boosters on they stand on the boosters' top line
      const B = panelLayout(L, true);
      expect(B.base - B.top).toBe(PANEL.H + SHIP.F - SHIP.STROKE / 2);
      expect(B.clip).toBe(P.clip);
    });
  }

  it("keep the time's place where the rest's countdown comes to stand", () => {
    expect(PANEL_TIME.left).toBe(PANEL.LINE + PANEL.PAD);
    expect(PANEL_TIME.top + 28).toBeLessThanOrEqual(PANEL.H);
    expect(PANEL_TIME.top).toBeGreaterThanOrEqual(PANEL.LINE + 18);
  });

  it('grow upwards for a name on two lines, by exactly its second line: the time stays where it was', () => {
    const L = widgetLayout(378);
    const P = panelLayout(L);
    expect(panelRise(15, 1)).toBe(0);
    for (const size of [14, 13, 12, 11]) {
      const rise = panelRise(size, 2);
      // two lines of size + 2 px in the room of one of 18 px
      expect(rise).toBe(2 * (size + 2) - 18);
      const T = panelLayout(L, false, rise);
      expect(P.top - T.top).toBe(rise);
      expect(T.base).toBe(P.base);
      expect(T.clip).toBe(P.clip);
      // the centred content (lines and the 28 px time) leaves the same room above and below
      expect((PANEL.H + rise - PANEL.LINE - (2 * (size + 2) + 28)) / 2).toBeCloseTo((PANEL.H - PANEL.LINE - (18 + 28)) / 2, 5);
    }
  });

  it('give the narrow phone a longer rocket, and leave 360 px and up as they were', () => {
    expect(widgetFrame(308)).toBe(296);
    expect(widgetFrame(348)).toBe(Math.round(348 * 0.86));
    expect(widgetFrame(378)).toBe(Math.round(378 * 0.86));
  });
});

describe('the dock on the timeline', () => {
  it('lands, stretches, and then the panels slide out: the controls work from then', () => {
    expect(DOCK.outAtMs).toBe(DOCK.stretchAtMs + DOCK.stretchMs);
    expect(DOCK.stretchMs).toBeGreaterThanOrEqual(250);
    expect(DOCK.stretchMs).toBeLessThanOrEqual(300);
    expect(DOCK.outMs).toBeGreaterThanOrEqual(150);
    expect(PANELS_OUT_MS).toBeLessThanOrEqual(300);
    // the settle's squash is mostly done before it stretches
    expect(DOCK.stretchAtMs).toBeGreaterThanOrEqual(FLIGHT.settleMs * 0.5);
    const f = nextFlight(PARKED, 'clouds', 1000);
    const parked = parkedFrom(f);
    expect(stretchFrom(f)).toBe(parked + DOCK.stretchAtMs);
    expect(controlsLiveFrom(f, 1000)).toBe(parked + DOCK.outAtMs);
    expect(podShownAt(f, parked + DOCK.outAtMs - 1)).toBe(false);
    expect(podShownAt(f, parked + DOCK.outAtMs)).toBe(true);
    expect(podOutFrom(f)).toBe(parked + DOCK.outAtMs + PANELS_OUT_MS);
    expect(stretchFrom(PARKED)).toBe(-Infinity);
    // the click of the panels as they come out
    expect(flightSounds(f, 'open').hits.at(-1)).toEqual({ at: parked + DOCK.outAtMs, sfx: 'banner' });
  });

  it('the window of the next exercise comes out after the panels are out', () => {
    expect(PREVIEW_OUT_AFTER_REST_MS).toBe(PARKED_AFTER_CLOUDS_MS + DOCK.outAtMs + PREVIEW.lagMs);
    expect(PREVIEW.lagMs).toBeGreaterThanOrEqual(DOCK.outMs);
  });

  it('leaving, the panels go in, it shrinks, and only then does it move off', () => {
    for (const start of ['open', 'folded', 'crouched'] as const) {
      const c = compressTiming(start);
      expect(c.delay + c.ms).toBeLessThanOrEqual(launchLeadMs(start) || c.ms);
      if (start === 'open') expect(c.delay).toBe(PANELS_IN_MS);
    }
    // the panels are in before the takeoff's still part ends (its crouch starts there)
    expect(PANELS_IN_MS).toBeLessThanOrEqual(FLIGHT.foldMs);
    expect(FLIGHT.foldMs).toBeLessThan(FLIGHT.anticipationMs);
    expect(ANTICIPATION_AT).toBeGreaterThan(0);
    const f = nextFlight(PARKED, 'clouds', 1000);
    expect(podShownAt(f, 1000 + PANELS_IN_MS - 1)).toBe(true);
    expect(podShownAt(f, 1000 + PANELS_IN_MS)).toBe(false);
  });

  it('in the last second: in, shrunk, and only a fifth of the crouch has passed by then', () => {
    const end = prelaunchCompress.delay + prelaunchCompress.ms;
    const crouchFrom = (PRELAUNCH.foldLeadS - PRELAUNCH.leadS) * 1000;
    expect(end).toBeLessThanOrEqual(crouchFrom + PRELAUNCH.leadS * 1000 * 0.2);
    expect(prelaunchCompress.delay).toBe(PANELS_IN_MS);
  });
});

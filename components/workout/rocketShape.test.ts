import { describe, expect, it } from 'vitest';
import { PAM_NUDGES, POD_FOLDED, SHAKE, SPRING_NUDGES, SPUTTER_NUDGES, STANDS, type Nudge } from './rocketFlight';
import { BANNER, BAR_TEXT, SHIP, WIDGET, barLines, barThickness, hullHalfAt, shiftFor, shipGeometry, stackGeometry, widgetLayout, type Stack, type WidgetLayout } from './rocketShape';

// The widget's width on phones of 320, 360 and 390 px (6 px each side) and a tablet's cap.
const WIDTHS = [308, 348, 378, 576];
const { T, F, STROKE } = SHIP;

type Pt = { x: number; y: number };

/** A point under `translate(x, y) rotate(rz) scale(sx, sy)` about `origin`, as CSS applies it. */
function moved(p: Pt, n: Nudge, origin: Pt): Pt {
  const { x = 0, y = 0, rz = 0, sx = 1, sy = 1 } = n;
  const dx = (p.x - origin.x) * sx;
  const dy = (p.y - origin.y) * sy;
  const r = (rz * Math.PI) / 180;
  return { x: origin.x + x + dx * Math.cos(r) - dy * Math.sin(r), y: origin.y + y + dx * Math.sin(r) + dy * Math.cos(r) };
}

/** The rocket's outline where it could meet the banner (the boosters' band, the body's top, the cap), in rocket pixels. */
function topOutline(L: WidgetLayout): Pt[] {
  const { g } = L;
  const pts: Pt[] = [];
  if (g.boosters) for (let x = g.boosters.x0; x <= g.boosters.x1; x += 4) pts.push({ x, y: STROKE / 2 });
  for (let x = g.x0; x <= g.xs; x += 4) pts.push({ x, y: F });
  for (let x = g.xs; x <= g.tip; x += 2) pts.push({ x, y: g.cy - hullHalfAt(g, x) });
  return pts;
}
const squashOrigin = (L: WidgetLayout): Pt => ({ x: (L.g.x0 + L.g.tip) / 2, y: F + T });

/** The highest the rocket's top gets under these moves, in widget pixels. */
const highest = (L: WidgetLayout, moves: Nudge[], origin: Pt) =>
  Math.min(...moves.flatMap((n) => topOutline(L).map((p) => moved(p, n, origin).y))) + L.ship.top;

/** Where the body's top and bottom lines are at the mast, in widget pixels. */
const bodyAtMast = (L: WidgetLayout, n: Nudge, origin: Pt) => {
  const x = L.pivot.x;
  return { top: moved({ x, y: F }, n, origin).y + L.ship.top, bottom: moved({ x, y: F + T }, n, origin).y + L.ship.top };
};

// a warm-up's rocket (boosters on), a block's, and what is left near the end
const WARMUP: Stack = { blocks: 3, first: 1, boosters: true };
const BLOCK1: Stack = { blocks: 3, first: 1, boosters: false };
const LAST: Stack = { blocks: 3, first: 3, boosters: false };
const STAGES = [WARMUP, BLOCK1, { blocks: 3, first: 2, boosters: false }, LAST];

describe('the rocket by segments (RocketShip)', () => {
  it.each([1, 2, 3, 4, 6])('splits its body into %i equal segments, block 1 at the tail', (n) => {
    const g = stackGeometry({ width: 330, blocks: n });
    expect(g.segments).toHaveLength(n);
    expect(g.segments.map((s) => s.block)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    const lengths = g.segments.map((s) => s.end - s.start);
    lengths.forEach((l) => expect(l).toBeCloseTo(lengths[0], 0));
    expect(g.segments[0].start).toBe(g.x0);
    expect(g.segments.at(-1)?.end).toBeCloseTo(g.xs, 0);
    expect(g.joints).toHaveLength(n - 1);
  });

  it('keeps each segment\'s series clear of its joints and outline, the middle of it white', () => {
    const g = stackGeometry({ width: 330, blocks: 4 });
    for (const seg of g.segments) {
      expect(seg.content.left).toBeGreaterThan(seg.start + SHIP.JOINT / 2);
      expect(seg.content.right).toBeLessThan(seg.end - SHIP.STROKE / 2);
      expect(seg.content.top).toBeGreaterThanOrEqual(F + STROKE);
      expect(seg.content.bottom).toBeLessThanOrEqual(F + T - STROKE);
      // room for the thick line of the serie in progress (13 px)
      expect(seg.content.bottom - seg.content.top).toBeGreaterThanOrEqual(13 + 2 * 4);
      for (const j of g.joints) expect(j.x <= seg.content.left - SHIP.JOINT / 2 || j.x >= seg.content.right + SHIP.JOINT / 2).toBe(true);
    }
  });

  it('keeps the same segments where they were as the first ones come off (the nose stays put)', () => {
    const whole = stackGeometry({ width: 330, blocks: 4 });
    const left = stackGeometry({ width: 330, blocks: 4, first: 3 });
    expect(left.segments.map((s) => s.block)).toEqual([3, 4]);
    expect(left.segments[0]).toEqual(whole.segments[2]);
    expect(left.tip).toBe(whole.tip);
    // the tail's nozzle is now the third segment's
    expect(left.x0).toBe(whole.segments[2].start);
    expect(left.xe).toBeCloseTo(left.x0 - SHIP.NOZZLE, 5);
    // and it never runs out: past the last, the last segment stays
    expect(stackGeometry({ width: 330, blocks: 4, first: 9 }).segments.map((s) => s.block)).toEqual([4]);
  });

  it('has a short nose with a window and a probe, and boosters only with all its segments on', () => {
    const g = stackGeometry({ width: 330, blocks: 3, boosters: true });
    expect(g.tip - g.xs).toBe(SHIP.NOSE);
    expect((g.tip - g.xs) / T).toBeLessThanOrEqual(1.2);
    expect(g.window.cx).toBeGreaterThan(g.xs);
    expect(g.window.cx).toBeLessThan(g.xs + SHIP.CAP);
    expect(g.boosters).not.toBeNull();
    // shorter than the body, and inside the band above and below it
    expect((g.boosters?.x1 ?? 0) - (g.boosters?.x0 ?? 0)).toBeLessThan(g.xs - g.x0);
    expect(stackGeometry({ width: 330, blocks: 3, first: 2, boosters: true }).boosters).toBeNull();
    expect(stackGeometry({ width: 330, blocks: 3 }).boosters).toBeNull();
  });

  it('stands centred whatever is left of it', () => {
    for (const first of [1, 2, 3, 4]) {
      const g = stackGeometry({ width: 330, blocks: 4, first });
      const shift = shiftFor(g);
      const whole = stackGeometry({ width: 330, blocks: 4 });
      expect((g.xe + g.tip) / 2 + shift).toBeCloseTo((whole.xe + whole.tip) / 2, 0);
    }
  });

  it('is every other rocket of the app as one segment with no boosters', () => {
    const g = shipGeometry(300);
    expect(g.segments).toHaveLength(1);
    expect(g.boosters).toBeNull();
    expect(g.content).toEqual(g.segments[0].content);
  });
});

// every width with every stage of the rocket
const CASES = WIDTHS.flatMap((w) => STAGES.map((st) => [w, st] as const));
const label = (st: Stack) => `${st.boosters ? 'warm-up' : `segments ${st.first}-${st.blocks}`}`;

describe('the widget', () => {
  it.each(WIDTHS)('is low and short: banner, mast and rocket in at most 125 px from the bottom, at %i px', (width) => {
    const L = widgetLayout(width, WARMUP);
    expect(L.box + WIDGET.BOTTOM).toBeLessThanOrEqual(125);
    expect(L.ship.top + L.g.H).toBeLessThanOrEqual(L.box);
    expect(L.box - (L.ship.top + L.g.H)).toBeLessThanOrEqual(STROKE);
  });

  it.each(WIDTHS)('fits the name, the time and three 44 px buttons in the banner, inside the widget, at %i px', (width) => {
    const L = widgetLayout(width);
    const { banner } = L;
    expect(banner.left).toBeGreaterThanOrEqual(0);
    expect(banner.right).toBeLessThanOrEqual(L.B);
    expect(banner.bottom - banner.top - 2 * STROKE).toBeGreaterThanOrEqual(BANNER.BTN);
    const text = banner.right - banner.left - 2 * STROKE - 12 - 3 - 3 * BANNER.BTN - 3 * 2;
    expect(text).toBeGreaterThanOrEqual(122);
    expect(banner.bottom - banner.top - 2 * STROKE).toBeGreaterThanOrEqual(18 + 28);
  });

  it.each(CASES)('stands the banner on a mast from the body, centred over what is left, at %i px (%o)', (width, stack) => {
    const L = widgetLayout(width, stack);
    const { g } = L;
    // the mast's foot is on the body, whatever is left of it
    expect(L.pivot.x).toBeGreaterThan(g.x0 + SHIP.JOINT);
    expect(L.pivot.x).toBeLessThan(g.xs - 2);
    expect(L.mast.top).toBeLessThan(L.banner.bottom);
    expect(L.mast.bottom).toBeGreaterThan(L.ship.top + F);
    expect(L.mast.bottom).toBeLessThan(L.ship.top + F + T);
    expect(L.ship.top - L.banner.bottom).toBe(BANNER.CLEAR);
    // centred: its middle under the banner's
    expect(L.center.x).toBeCloseTo((L.banner.left + L.banner.right) / 2, -0.5);
    expect(L.ship.left + L.ship.shift + g.xe).toBeGreaterThanOrEqual(0);
  });

  it.each(WIDTHS)('folds the banner into the body, out of sight behind it, at %i px', (width) => {
    const L = widgetLayout(width, LAST);
    const [kx, ky] = (/scale\(([\d.]+), ([\d.]+)\)/.exec(POD_FOLDED) ?? []).slice(1).map(Number);
    const folded = {
      left: L.fold.x + (L.banner.left - L.fold.x) * kx,
      right: L.fold.x + (L.banner.right - L.fold.x) * kx,
      top: L.fold.y + (L.banner.top - L.fold.y) * ky,
      bottom: L.fold.y + (L.mast.bottom - L.fold.y) * ky,
    };
    expect(folded.top).toBeGreaterThan(L.ship.top + F + STROKE);
    expect(folded.bottom).toBeLessThan(L.ship.top + F + T - STROKE);
    expect(folded.left).toBeGreaterThan(L.ship.left + L.ship.shift + L.g.x0);
    expect(folded.right).toBeLessThan(L.ship.left + L.ship.shift + L.g.xs);
  });
});

describe('the rocket moving in its place', () => {
  it.each(WIDTHS)('coughs in the warm-up (boosters on) without touching the banner or losing its mast, at %i px', (width) => {
    const L = widgetLayout(width, WARMUP);
    const origin = squashOrigin(L);
    expect(highest(L, SPUTTER_NUDGES, origin)).toBeGreaterThanOrEqual(L.banner.bottom + 0.5);
    expect(Math.min(...SPUTTER_NUDGES.map((n) => n.y ?? 0))).toBeLessThanOrEqual(-3);
    for (const n of SPUTTER_NUDGES) {
      const body = bodyAtMast(L, n, origin);
      expect(body.top).toBeLessThan(L.mast.bottom - 1);
      expect(body.bottom).toBeGreaterThan(L.mast.bottom + 1);
    }
  });

  it.each(CASES)('lands its "¡pam!" without touching the banner or losing its mast, at %i px (%o)', (width, stack) => {
    const L = widgetLayout(width, stack);
    expect(highest(L, SPRING_NUDGES, L.pivot)).toBeGreaterThanOrEqual(L.banner.bottom + 0.5);
    expect(highest(L, PAM_NUDGES, squashOrigin(L))).toBeGreaterThanOrEqual(L.banner.bottom + 0.5);
    for (const n of SPRING_NUDGES) {
      const body = bodyAtMast(L, n, L.pivot);
      expect(body.top).toBeLessThan(L.mast.bottom - 1);
      expect(body.bottom).toBeGreaterThan(L.mast.bottom + 1);
    }
    expect(Math.min(...PAM_NUDGES.map((n) => n.sy ?? 1))).toBeLessThanOrEqual(0.75);
  });

  it.each(WIDTHS)('on its stands in a rest it rises only a few px, clear of the banner and on its mast, at %i px', (width) => {
    for (const stack of [BLOCK1, LAST]) {
      const S = widgetLayout(width, stack);
      // up on its stands (with the bounce), a jolt, and lowered as they are taken away
      for (const y of [0, -STANDS.liftPx - 1.4, -STANDS.liftPx + 1.6, -STANDS.lowPx]) {
        const n = { y, rz: 0 };
        expect(highest(S, [n], S.pivot)).toBeGreaterThanOrEqual(S.banner.bottom + 1);
        const body = bodyAtMast(S, n, S.pivot);
        expect(body.top).toBeLessThan(S.mast.bottom - 1);
        expect(body.bottom).toBeGreaterThan(S.mast.bottom + 1);
      }
    }
  });

  it.each(CASES)('shakes harder each of the last three seconds, still clear of the banner, at %i px (%o)', (width, stack) => {
    const L = widgetLayout(width, stack);
    for (const list of [SHAKE.rocket, SHAKE.text]) {
      for (let i = 1; i < list.length; i++) expect(list[i]).toBeGreaterThan(list[i - 1]);
    }
    expect(SHAKE.rocket[3]).toBeGreaterThanOrEqual(3);
    expect(SHAKE.text[3]).toBeLessThanOrEqual(2.5);
    const amp = SHAKE.rocket[3];
    const middle = { x: (L.g.xe + L.g.tip) / 2, y: L.g.cy };
    for (const rz of [-0.22 * amp, 0.22 * amp]) {
      expect(highest(L, [{ x: amp, y: -0.7 * amp, rz }], middle)).toBeGreaterThanOrEqual(L.banner.bottom - 1);
    }
    void label;
  });
});

describe("the routine creator's bar", () => {
  it('stays the usual rocket with one line, and grows a line at a time up to three', () => {
    const k = 1.15;
    expect(barThickness(1, k)).toBe(SHIP.T);
    const t = [1, 2, 3].map((n) => barThickness(n, k));
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1]);
    expect(BAR_TEXT.MAX_LINES).toBe(3);
    expect(barThickness(9, k)).toBe(t[2]);
    // every line fits inside the body, clear of its outline
    [1, 2, 3].forEach((n) => {
      const inner = (barThickness(n, k) - SHIP.STROKE) * k; // (half a stroke each side)
      expect(inner).toBeGreaterThanOrEqual(n * BAR_TEXT.LINE + 2 * BAR_TEXT.AIR - 0.5);
    });
    // the drawing follows: a thicker body, and a nose cap that grows with it
    const thin = shipGeometry(330);
    const thick = shipGeometry(330, t[2]);
    expect(thick.H - thin.H).toBeCloseTo(t[2] - SHIP.T, 5);
    expect(thick.tip - thick.xs - SHIP.PROBE).toBe(Math.round(thick.T * 0.9));
    expect(hullHalfAt(thick, thick.xs + 1)).toBeCloseTo(thick.T / 2, 0);
    // still long and slim, with room for the sentence
    expect((thick.tip - thick.xe) / thick.T).toBeGreaterThanOrEqual(4);
    expect(thick.content.right - thick.content.left).toBeGreaterThanOrEqual(140);
  });

  it('counts the lines of the field from its content height', () => {
    expect(barLines(44)).toBe(1);
    expect(barLines(68)).toBe(2);
    expect(barLines(92)).toBe(3);
    expect(barLines(116)).toBe(3);
    expect(barLines(300)).toBe(BAR_TEXT.MAX_LINES);
    expect(barLines(0)).toBe(1);
  });
});

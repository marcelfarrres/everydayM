import { describe, expect, it } from 'vitest';
import { BOB, PAM_NUDGES, POD_FOLDED, SHAKE, SINK, SPRING_NUDGES, SPUTTER_NUDGES, sinkAt, type Nudge } from './rocketFlight';
import { BANNER, BAR_TEXT, SHIP, WIDGET, barLines, barThickness, hullHalfAt, overlaps, shipGeometry, widgetLayout, type WidgetLayout } from './rocketShape';

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

/** The rocket's outline where it could meet the banner (top fin tips, body top, nose), in rocket pixels. */
function topOutline(L: WidgetLayout): Pt[] {
  const { g } = L;
  const pts: Pt[] = [
    { x: g.parts.finTop.left, y: 0 },
    { x: g.x0, y: 0 },
  ];
  for (let x = g.x0; x <= g.xs; x += 4) pts.push({ x, y: F });
  for (let x = g.xs; x <= g.tip; x += 2) pts.push({ x, y: g.cy - hullHalfAt(g, x) });
  return pts;
}
const bottomFin = (L: WidgetLayout): Pt[] => [
  { x: L.g.parts.finBottom.left, y: F + T + F },
  { x: L.g.x0, y: F + T + F },
];
const squashOrigin = (L: WidgetLayout): Pt => ({ x: (L.g.x0 + L.g.tip) / 2, y: F + T });

/** The highest the rocket's top gets under these moves, in widget pixels. */
const highest = (L: WidgetLayout, moves: Nudge[], origin: Pt) =>
  Math.min(...moves.flatMap((n) => topOutline(L).map((p) => moved(p, n, origin).y))) + L.ship.top;

/** Where the body's top and bottom lines are at the mast, in widget pixels. */
const bodyAtMast = (L: WidgetLayout, n: Nudge, origin: Pt) => {
  const x = L.mast.x - L.ship.left;
  return { top: moved({ x, y: F }, n, origin).y + L.ship.top, bottom: moved({ x, y: F + T }, n, origin).y + L.ship.top };
};

describe('the rocket (RocketShip)', () => {
  it.each(WIDTHS)('keeps every part of the rocket clear of the hilo at %i px', (width) => {
    const { g } = widgetLayout(width);
    const grown = { ...g.content, left: g.content.left - (SHIP.CONTENT_GAP - 1), right: g.content.right + (SHIP.CONTENT_GAP - 1) };
    for (const [name, part] of Object.entries(g.parts)) {
      expect({ name, overlaps: overlaps(grown, part) }).toEqual({ name, overlaps: false });
    }
    expect(g.content.left).toBeGreaterThan(g.x0);
    expect(g.content.right).toBeLessThan(g.xs);
    expect(g.content.top).toBeGreaterThanOrEqual(F + STROKE / 2);
    expect(g.content.bottom).toBeLessThanOrEqual(F + T - STROKE / 2);
  });

  it.each(WIDTHS)('gives the hilo nearly the whole body, with room for the thick line of the serie in progress, at %i px', (width) => {
    const { g } = widgetLayout(width);
    const w = g.content.right - g.content.left;
    expect(w / (g.xs - g.x0)).toBeGreaterThanOrEqual(0.8);
    expect(w).toBeGreaterThanOrEqual(130);
    // the line of the serie in progress is 13 px (Hilo `lg`), with air above and below
    expect(g.content.bottom - g.content.top).toBeGreaterThanOrEqual(13 + 2 * 4);
  });

  it.each(WIDTHS)('is slim, with a long, sharp nose, at %i px', (width) => {
    const { g } = widgetLayout(width);
    expect((g.tip - g.xe) / T).toBeGreaterThanOrEqual(7);
    const nose = g.tip - g.xs;
    expect(nose / T).toBeGreaterThanOrEqual(2.4);
    // sharp: a quarter of the nose back from the tip it is less than half the body's thickness
    expect(hullHalfAt(g, g.tip - nose / 4)).toBeLessThan(T / 4);
    expect(g.H).toBe(T + 2 * F);
  });
});

describe('the widget', () => {
  it.each(WIDTHS)('is low and short: banner, mast and rocket in at most 125 px from the bottom, at %i px', (width) => {
    const L = widgetLayout(width);
    expect(L.box + WIDGET.BOTTOM).toBeLessThanOrEqual(125);
    // the rocket is the bottom of it
    expect(L.ship.top + L.g.H).toBeLessThanOrEqual(L.box);
    expect(L.box - (L.ship.top + L.g.H)).toBeLessThanOrEqual(STROKE);
  });

  it.each(WIDTHS)('fits the name, the time and three 44 px buttons in the banner, inside the widget, at %i px', (width) => {
    const L = widgetLayout(width);
    const { banner } = L;
    expect(banner.left).toBeGreaterThanOrEqual(0);
    expect(banner.right).toBeLessThanOrEqual(L.B);
    expect(banner.bottom - banner.top - 2 * STROKE).toBeGreaterThanOrEqual(BANNER.BTN);
    // border, the text's left padding (12), the buttons' side (3), three buttons and their gaps
    const text = banner.right - banner.left - 2 * STROKE - 12 - 3 - 3 * BANNER.BTN - 3 * 2;
    // "Calentamiento" at 15 px (about 105 px) and the list's chevron (14 px and its gap)
    expect(text).toBeGreaterThanOrEqual(122);
    // the name (15 px) over the time (28 px)
    expect(banner.bottom - banner.top - 2 * STROKE).toBeGreaterThanOrEqual(18 + 28);
  });

  it.each(WIDTHS)('stands the banner on a mast from the body, clear of the top fin, at %i px', (width) => {
    const L = widgetLayout(width);
    const { g } = L;
    const mastX = L.mast.x - L.ship.left;
    expect(mastX).toBeGreaterThan(g.content.left);
    expect(mastX).toBeLessThan(g.content.right);
    expect(L.mast.top).toBeLessThan(L.banner.bottom);
    expect(L.mast.bottom).toBeGreaterThan(L.ship.top + F);
    expect(L.mast.bottom).toBeLessThan(L.ship.top + F + T);
    expect(L.ship.top - L.banner.bottom).toBe(BANNER.CLEAR);
  });

  it.each(WIDTHS)('folds the banner into the body, out of sight behind it, at %i px', (width) => {
    const L = widgetLayout(width);
    const [kx, ky] = (/scale\(([\d.]+), ([\d.]+)\)/.exec(POD_FOLDED) ?? []).slice(1).map(Number);
    const folded = {
      left: L.fold.x + (L.banner.left - L.fold.x) * kx,
      right: L.fold.x + (L.banner.right - L.fold.x) * kx,
      top: L.fold.y + (L.banner.top - L.fold.y) * ky,
      bottom: L.fold.y + (L.mast.bottom - L.fold.y) * ky,
    };
    expect(folded.top).toBeGreaterThan(L.ship.top + F + STROKE);
    expect(folded.bottom).toBeLessThan(L.ship.top + F + T - STROKE);
    expect(folded.left).toBeGreaterThan(L.ship.left + L.g.x0);
    expect(folded.right).toBeLessThan(L.ship.left + L.g.xs);
  });
});

describe('the rocket moving in its place', () => {
  it.each(WIDTHS)('coughs in the warm-up without touching the banner or losing its mast, at %i px', (width) => {
    const L = widgetLayout(width);
    const origin = squashOrigin(L);
    expect(highest(L, SPUTTER_NUDGES, origin)).toBeGreaterThanOrEqual(L.banner.bottom + 1);
    // a hop you can see
    expect(Math.min(...SPUTTER_NUDGES.map((n) => n.y ?? 0))).toBeLessThanOrEqual(-3);
    for (const n of SPUTTER_NUDGES) {
      const body = bodyAtMast(L, n, origin);
      expect(body.top).toBeLessThan(L.mast.bottom - 1);
      expect(body.bottom).toBeGreaterThan(L.mast.bottom + 1);
    }
  });

  it.each(WIDTHS)('lands its "¡pam!" without touching the banner or losing its mast, at %i px', (width) => {
    const L = widgetLayout(width);
    const pivot = L.pivot;
    expect(highest(L, SPRING_NUDGES, pivot)).toBeGreaterThanOrEqual(L.banner.bottom + 0.5);
    expect(highest(L, PAM_NUDGES, squashOrigin(L))).toBeGreaterThanOrEqual(L.banner.bottom + 0.5);
    for (const n of SPRING_NUDGES) {
      const body = bodyAtMast(L, n, pivot);
      expect(body.top).toBeLessThan(L.mast.bottom - 1);
      expect(body.bottom).toBeGreaterThan(L.mast.bottom + 1);
    }
    // marked: a deep squash
    expect(Math.min(...PAM_NUDGES.map((n) => n.sy ?? 1))).toBeLessThanOrEqual(0.75);
  });

  it.each(WIDTHS)('sinks in a rest until its tail dips off the bottom of the screen, but only a little, at %i px', (width) => {
    const L = widgetLayout(width);
    const full = sinkAt(1);
    expect(full).toEqual({ y: SINK.maxPx, rz: SINK.maxTilt });
    const lowest = Math.max(...bottomFin(L).map((p) => moved(p, full, L.pivot).y)) + L.ship.top;
    const below = lowest - L.box - WIDGET.BOTTOM; // px under the bottom of the screen
    expect(below).toBeGreaterThanOrEqual(6);
    expect(below).toBeLessThanOrEqual(30);
    // with the bob on top of the sink: it never touches the banner, and the mast stays in the body
    for (const sink of [sinkAt(0), sinkAt(0.5), full]) {
      for (const bob of BOB) {
        const n = { y: sink.y + bob.y, rz: sink.rz + bob.rz };
        expect(highest(L, [n], L.pivot)).toBeGreaterThanOrEqual(L.banner.bottom + 1);
        const body = bodyAtMast(L, n, L.pivot);
        expect(body.top).toBeLessThan(L.mast.bottom - 1);
        expect(body.bottom).toBeGreaterThan(L.mast.bottom + 1);
      }
    }
  });

  it.each(WIDTHS)('shakes harder each of the last three seconds, still clear of the banner, at %i px', (width) => {
    const L = widgetLayout(width);
    for (const list of [SHAKE.rocket, SHAKE.text]) {
      for (let i = 1; i < list.length; i++) expect(list[i]).toBeGreaterThan(list[i - 1]);
    }
    expect(SHAKE.rocket[3]).toBeGreaterThanOrEqual(4);
    expect(SHAKE.text[3]).toBeLessThanOrEqual(2.5); // the text stays readable
    // the shake's furthest pose (globals.css .rw-shake: up to 1 px and 0.22° per unit), about the rocket's middle
    const amp = SHAKE.rocket[3];
    const middle = { x: (L.g.xe + L.g.tip) / 2, y: L.g.cy };
    for (const rz of [-0.22 * amp, 0.22 * amp]) {
      expect(highest(L, [{ x: amp, y: -0.7 * amp, rz }], middle)).toBeGreaterThanOrEqual(L.banner.bottom);
    }
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
    // the drawing follows: a thicker body, and a nose that grows with it so it keeps its point
    const thin = shipGeometry(330);
    const thick = shipGeometry(330, t[2]);
    expect(thick.H - thin.H).toBeCloseTo(t[2] - SHIP.T, 5);
    expect((thick.tip - thick.xs) / thick.T).toBeGreaterThanOrEqual(1.75);
    expect(hullHalfAt(thick, thick.tip - (thick.tip - thick.xs) / 4)).toBeLessThan(thick.T / 4);
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

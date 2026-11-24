import { describe, expect, it } from 'vitest';
import { ROCKET, noseHalfAt, overlaps, rocketGeometry } from './rocketShape';

// The widget's width on phones of 320, 360 and 390 px (4 px left, 6 px right) and a tablet's cap.
const WIDTHS = [310, 350, 380, 576];

describe('the rocket widget', () => {
  it.each(WIDTHS)('keeps every part of the rocket clear of the content at %i px', (width) => {
    const g = rocketGeometry(width);
    // the gap all round the content box
    const grown = (gap: number) => ({ ...g.content, left: g.content.left - gap, right: g.content.right + gap });
    for (const [name, part] of Object.entries(g.parts)) {
      expect({ name, overlaps: overlaps(grown(ROCKET.TEXT_GAP - 1), part) }).toEqual({ name, overlaps: false });
    }
    // the content stays inside the body, between its top and bottom lines
    expect(g.content.left).toBeGreaterThan(g.x0);
    expect(g.content.right).toBeLessThan(g.x1);
    expect(g.content.top).toBeGreaterThanOrEqual(ROCKET.F + ROCKET.STROKE / 2);
    expect(g.content.bottom).toBeLessThanOrEqual(ROCKET.F + ROCKET.T - ROCKET.STROKE / 2);
  });

  it.each(WIDTHS)('leaves room for the name and the time at %i px', (width) => {
    const g = rocketGeometry(width);
    // "Calentamiento" at 16 px (113 px) + the time ("0:45", 44 px) + the gap between them;
    // "Descanso" at 17 px (81 px) + "Saltar" (68 px) + the gap
    expect(g.content.right - g.content.left).toBeGreaterThanOrEqual(168);
  });

  it.each(WIDTHS)('fits the porthole inside the nose, clear of its outline, at %i px', (width) => {
    const g = rocketGeometry(width);
    const { cx, r } = g.porthole;
    expect(cx - r - g.x1).toBeGreaterThanOrEqual(5);
    for (let x = cx - r; x <= cx + r; x += 1) {
      const halfChord = Math.sqrt(Math.max(0, r * r - (x - cx) ** 2));
      expect(noseHalfAt(g, x) - halfChord).toBeGreaterThanOrEqual(4);
    }
    // a 44 px target centred on it stays within the rocket's height
    expect(g.cy - 22).toBeGreaterThanOrEqual(0);
    expect(g.cy + 22).toBeLessThanOrEqual(g.H);
  });

  it('spans the width it is given, with the nose tip at the edge', () => {
    const g = rocketGeometry(380);
    expect(g.W).toBe(380);
    expect(g.tip).toBe(380 - ROCKET.STROKE / 2);
    expect(g.H).toBe(ROCKET.T + 2 * ROCKET.F);
  });
});

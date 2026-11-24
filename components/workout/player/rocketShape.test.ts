import { describe, expect, it } from 'vitest';
import { SINK, SPUTTER_KEYFRAMES, podPopKeyframes, sinkAt } from '@/components/workout/rocketFlight';
import { POD, ROCKET, hullHalfAt, overlaps, rocketGeometry } from './rocketShape';

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
    // the content stays inside the body, between its top and bottom lines, before the nose section
    expect(g.content.left).toBeGreaterThan(g.x0);
    expect(g.content.right).toBeLessThan(g.xs);
    expect(g.content.top).toBeGreaterThanOrEqual(ROCKET.F + ROCKET.STROKE / 2);
    expect(g.content.bottom).toBeLessThanOrEqual(ROCKET.F + ROCKET.T - ROCKET.STROKE / 2);
  });

  it.each(WIDTHS)('leaves room for the name at %i px', (width) => {
    const g = rocketGeometry(width);
    // "Calentamiento" at 18 px (122 px) and the list's chevron (14 px and its gap); 20 px (136 px) from 360 px phones
    expect(g.content.right - g.content.left).toBeGreaterThanOrEqual(width < 340 ? 142 : 156);
    // "Descanso" at 22 px (101 px) with room to spare
    expect(g.content.right - g.content.left).toBeGreaterThanOrEqual(120);
  });

  it.each(WIDTHS)('fits the time inside the nose section, clear of its outline, at %i px', (width) => {
    const g = rocketGeometry(width);
    const { time } = g;
    // "0:45" in bold: 27 px (58 px wide) on a 320 px phone, 30 px (64 px) from 360
    expect(time.right - time.left).toBeGreaterThanOrEqual(width < 340 ? 62 : 68);
    expect(time.left).toBeGreaterThanOrEqual(g.xs + ROCKET.STROKE / 2 + 5);
    for (let x = time.left; x <= time.right; x += 1) {
      const inside = hullHalfAt(g, x) - ROCKET.STROKE / 2;
      expect(inside - ROCKET.TIME_H / 2).toBeGreaterThanOrEqual(ROCKET.TIME_GAP - 0.5);
    }
  });

  it.each(WIDTHS)('has a short, blunt nose at %i px', (width) => {
    const g = rocketGeometry(width);
    const nose = g.tip - g.xs;
    expect(nose / ROCKET.T).toBeLessThanOrEqual(1.4);
    // blunt: a quarter of the body's thickness back from the tip, it is still more than half as thick
    expect(hullHalfAt(g, g.tip - ROCKET.T / 4)).toBeGreaterThan(ROCKET.T / 4);
    expect(nose / g.W).toBeLessThan(0.3);
  });

  it('spans the width it is given, with the nose tip at the edge', () => {
    const g = rocketGeometry(380);
    expect(g.W).toBe(380);
    expect(g.tip).toBe(380 - ROCKET.STROKE / 2);
    expect(g.H).toBe(ROCKET.T + 2 * ROCKET.F);
    expect(g.box).toBe(g.pod.bottom + ROCKET.STROKE / 2);
  });
});

describe('the control pod', () => {
  it.each(WIDTHS)('holds three 44 px buttons and spans 30 to 50 %% of the rocket at %i px', (width) => {
    const g = rocketGeometry(width);
    const { controls, skip } = g.pod;
    const w = controls.right - controls.left;
    expect(w).toBeGreaterThanOrEqual(3 * POD.BTN + 2 * 4 + 2 * 4);
    expect(controls.bottom - controls.top - 2 * ROCKET.STROKE).toBeGreaterThanOrEqual(POD.BTN);
    const ratio = w / (g.tip - g.xe);
    expect(ratio).toBeGreaterThanOrEqual(width >= 500 ? 0.27 : 0.4);
    expect(ratio).toBeLessThanOrEqual(0.55);
    // "Saltar" (17 px, 48 px) and its icon in a 44 px button
    expect(skip.right - skip.left).toBeGreaterThanOrEqual(110);
  });

  it.each(WIDTHS)('hangs under the belly, clear of the bottom fin, inside the widget, at %i px', (width) => {
    const g = rocketGeometry(width);
    for (const box of [g.pod.controls, g.pod.skip]) {
      expect(box.left).toBeGreaterThanOrEqual(g.finReach + 6);
      expect(box.right).toBeLessThanOrEqual(g.tip);
      expect(box.top).toBe(ROCKET.F + ROCKET.T + POD.GAP);
      expect(box.bottom).toBeLessThanOrEqual(g.box);
      expect(overlaps(box, g.parts.finBottom)).toBe(false);
    }
  });

  it.each(WIDTHS)('goes out of sight behind the body, neck and all, at %i px', (width) => {
    const g = rocketGeometry(width);
    const { hidden } = g.pod;
    // the pod's bottom ends up above the belly's line...
    expect(g.pod.bottom - hidden).toBeLessThanOrEqual(ROCKET.F + ROCKET.T);
    // ...and the neck's top below the body's top line
    expect(ROCKET.F + ROCKET.T - POD.NECK_HIDDEN - hidden).toBeGreaterThanOrEqual(ROCKET.F + ROCKET.STROKE);
    expect(podPopKeyframes(hidden)[0].transform).toContain(`translateY(${-hidden}px)`);
  });

  it('keeps its neck attached when the rocket hops in the warm-up', () => {
    const hop = Math.max(...SPUTTER_KEYFRAMES.map((k) => -Number(/translate\([^,]+, (-?[\d.]+)px\)/.exec(k.transform)?.[1] ?? 0)));
    expect(hop).toBeGreaterThan(0);
    expect(hop).toBeLessThan(POD.NECK_HIDDEN);
  });

  it.each(WIDTHS)('stays clear of the belly while the rocket sinks in a rest, at %i px', (width) => {
    const g = rocketGeometry(width);
    const s = sinkAt(1);
    expect(s.y).toBe(SINK.maxPx);
    const rad = (s.rz * Math.PI) / 180;
    // the belly's outer line over the pod, after the sink's rotation (about the pivot) and drop
    for (const box of [g.pod.controls, g.pod.skip]) {
      for (let x = box.left; x <= box.right; x += 2) {
        const belly = g.pod.pivot.y + ROCKET.STROKE / 2 + (x - g.pod.pivot.x) * Math.sin(rad) + s.y;
        expect(box.top - ROCKET.STROKE / 2 - belly).toBeGreaterThanOrEqual(3);
      }
    }
    // and the tail's fin (it goes down) stays inside the widget
    const finTip = ROCKET.F + ROCKET.T + ROCKET.F + (g.parts.finBottom.left - g.pod.pivot.x) * Math.sin(rad) + s.y;
    expect(finTip).toBeLessThanOrEqual(g.box);
  });
});

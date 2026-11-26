import { describe, expect, it } from 'vitest';
import { SUGGESTIONS } from '@/lib/intent/suggestions';
import { NOSE, PAD_BAR, estimateTextWidth, fitLabel, padBarLayout, padRocketGeometry } from './padRocketShape';

describe('the new rocket', () => {
  it('lays its parts out from the nozzle to the antenna, inside its box', () => {
    for (const [length, body] of [
      [256, 34],
      [326, 42],
      [400, 46],
    ]) {
      const g = padRocketGeometry({ length, body });
      expect(g.W).toBe(length);
      expect(g.body.x0).toBeGreaterThan(0);
      expect(g.band.x).toBeGreaterThan(g.body.x0);
      expect(g.checker.x).toBeGreaterThan(g.band.x + g.band.w - 0.01);
      // the label starts right after the checker strip and ends before the hatch
      expect(g.label.x0).toBeGreaterThan(g.checker.x + g.checker.w);
      expect(g.hatch).not.toBeNull();
      expect(g.label.x1).toBeLessThan(g.hatch!.x);
      expect(g.hatch!.x + g.hatch!.w).toBeLessThan(g.seam.x);
      expect(g.seam.x).toBeLessThan(g.body.x1);
      // the approved nose: about 1.3 times the hull's thickness, then the antenna and its light
      expect(g.nose.len).toBeCloseTo(NOSE.len * body, 0);
      expect(g.nose.x0 + g.nose.len).toBeCloseTo(g.nose.tip, 5);
      expect(g.antenna.x1 + 2 * g.antenna.light).toBeCloseTo(g.W, 0);
      // the window sits at the base of the nose
      expect(g.window.cx - g.window.r).toBeGreaterThan(g.nose.x0);
      expect(g.window.cx).toBeLessThan(g.nose.x0 + g.nose.len / 2);
      expect(g.H).toBeGreaterThan(g.T);
    }
  });

  it('keeps the fins and the tail of the bar as its hull grows with the lines', () => {
    const one = padRocketGeometry({ length: 380, body: 44, finRef: 44, hatch: false });
    const three = padRocketGeometry({ length: 380, body: 82, finRef: 44, hatch: false });
    expect(three.fin.h).toBe(one.fin.h);
    expect(three.label.x0).toBe(one.label.x0);
    expect(three.hatch).toBeNull();
    expect(three.H - one.H).toBeCloseTo(38, 5);
  });
});

describe('labels that always fit', () => {
  const measure = estimateTextWidth;

  it('uses the biggest size that fits, shrinking only as needed', () => {
    expect(fitLabel('Core, 35 min', 300, { max: 20, min: 11 }, measure).px).toBe(20);
    const fit = fitLabel('Glúteos y piernas, 30 min', 180, { max: 20, min: 11 }, measure);
    expect(fit.px).toBeLessThan(20);
    expect(fit.px).toBeGreaterThanOrEqual(11);
    expect(fit.cut).toBe(false);
    expect(measure(fit.text, fit.px)).toBeLessThanOrEqual(180);
    // a quarter px bigger would not fit
    expect(measure(fit.text, fit.px + 0.25)).toBeGreaterThan(180);
  });

  it('lengthens the rocket when allowed, and cuts with an ellipsis past that', () => {
    const long = 'Full body, foco espalda, 35 min';
    const grown = fitLabel(long, 140, { max: 18, min: 11, maxExtra: 200 }, measure);
    expect(grown.px).toBe(11);
    expect(grown.extra).toBeGreaterThan(0);
    expect(grown.text).toBe(long);
    const cut = fitLabel(long, 100, { max: 18, min: 11 }, measure);
    expect(cut.cut).toBe(true);
    expect(cut.text.endsWith('…')).toBe(true);
    expect(cut.text).not.toMatch(/[\s,]…$/);
    expect(measure(cut.text, cut.px)).toBeLessThanOrEqual(100);
  });

  it('never lets a suggestion overflow its hull, at any width from a 320 px phone', () => {
    for (let length = 230; length <= 420; length += 7) {
      const g = padRocketGeometry({ length, body: Math.round(Math.min(42, Math.max(30, length * 0.13))) });
      const room = g.label.x1 - g.label.x0;
      for (const s of SUGGESTIONS) {
        const fit = fitLabel(s, room, { max: Math.round(g.T * 0.52), min: 11 }, measure);
        expect(measure(fit.text, fit.px)).toBeLessThanOrEqual(room + fit.extra + 0.001);
        expect(fit.extra).toBe(0);
        expect(fit.px).toBeGreaterThanOrEqual(11);
      }
    }
  });
});

describe('the text bar', () => {
  it('puts the field after the checker strip, then the microphone, then "send", never overlapping', () => {
    for (let width = 296; width <= 560; width += 13) {
      for (const lines of [1, 2, 3]) {
        for (const speech of [true, false]) {
          const bar = padBarLayout(width, lines, speech);
          const right = bar.textLeft + bar.textWidth;
          if (speech) {
            expect(bar.micLeft).not.toBeNull();
            expect(right).toBeLessThanOrEqual(bar.micLeft!);
            expect(bar.micLeft! + PAD_BAR.MIC_W).toBeLessThanOrEqual(bar.sendLeft + 0.01);
          } else {
            expect(right).toBeLessThanOrEqual(bar.sendLeft);
          }
          // "send" sits in the hull, before the nose
          expect(bar.sendLeft + PAD_BAR.SEND_W - 4).toBeLessThanOrEqual(bar.g.body.x1 - bar.hangLeft);
          expect(bar.textLeft + bar.hangLeft).toBeGreaterThan(bar.g.checker.x + bar.g.checker.w);
          // the field is centred in the hull and holds its lines
          expect(bar.fieldHeight).toBe(lines * PAD_BAR.LINE + 2 * PAD_BAR.PAD);
          expect(bar.g.T).toBeGreaterThanOrEqual(lines * PAD_BAR.LINE);
        }
      }
    }
  });

  it('fits its placeholder next to the microphone at every phone width', () => {
    for (let width = 296; width <= 560; width += 4) {
      const bar = padBarLayout(width, 1, true);
      const fit = fitLabel('¿Qué entrenamos hoy?', bar.textWidth - 2, { max: PAD_BAR.TEXT_PX, min: PAD_BAR.PLACEHOLDER_MIN }, estimateTextWidth);
      expect(estimateTextWidth(fit.text, fit.px)).toBeLessThanOrEqual(bar.textWidth);
      expect(fit.cut).toBe(false);
    }
  });
});

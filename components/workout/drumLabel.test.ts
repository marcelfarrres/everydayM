import { describe, expect, it } from 'vitest';
import { SUGGESTIONS } from '@/lib/intent/suggestions';
import { estimateTextWidth } from './padRocketShape';
import { fitDrumLabel } from './drumLabel';

const measure = estimateTextWidth;
const opts = { max: 17, min: 11 };

describe('drum labels', () => {
  it('stays whole and as big as fits when there is room', () => {
    const fit = fitDrumLabel('Core, 35 min', 200, opts, measure);
    expect(fit).toMatchObject({ text: 'Core, 35 min', px: 17, cut: false });
  });

  it('keeps the minutes when it has to shorten, cutting the muscles in the middle', () => {
    const fit = fitDrumLabel('Piernas y glúteos, 40 min', 115, opts, measure);
    expect(fit.cut).toBe(true);
    expect(fit.px).toBe(11);
    expect(fit.text.endsWith('…, 40 min')).toBe(true);
    expect(fit.text.startsWith('Piernas')).toBe(true);
    expect(fit.text).not.toMatch(/[\s,]…/);
    expect(measure(fit.text, fit.px)).toBeLessThanOrEqual(115);
  });

  it('keeps the minutes of every suggestion at a 320 px phone, and never overflows', () => {
    for (const room of [110, 120, 130, 150, 190]) {
      for (const s of SUGGESTIONS) {
        const fit = fitDrumLabel(s, room, opts, measure);
        expect(measure(fit.text, fit.px)).toBeLessThanOrEqual(room + 0.001);
        expect(fit.text).toMatch(/\d+ min$/);
        expect(fit.text.endsWith(s.slice(s.lastIndexOf(',')))).toBe(true);
      }
    }
  });

  it('falls back to a plain cut when even the minutes do not fit, or there are none', () => {
    const tiny = fitDrumLabel('Piernas y glúteos, 40 min', 40, opts, measure);
    expect(measure(tiny.text, tiny.px)).toBeLessThanOrEqual(40);
    const noMinutes = fitDrumLabel('Un texto largo sin duración ninguna', 80, opts, measure);
    expect(noMinutes.text.endsWith('…')).toBe(true);
    expect(measure(noMinutes.text, noMinutes.px)).toBeLessThanOrEqual(80);
  });
});

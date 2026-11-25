import { describe, expect, it } from 'vitest';
import { LIST, fitList, labelWidth, layList, listRoom, type ListGroupSpec } from './endLayout';

const groupsOf = (warmups: number, blocks: number, per: number): ListGroupSpec[] => [
  ...(warmups ? [{ label: 'Calentamiento', count: warmups }] : []),
  ...Array.from({ length: blocks }, (_, i) => ({ label: `Bloque ${i + 1}`, count: per })),
];

// iPhone 12–15 (notch: 47 / 34 px of safe area) and the iPhone SE of 2016 (none)
const BIG = listRoom(390, 844, { top: 47, bottom: 34 });
const SMALL = listRoom(320, 568);

describe('listRoom', () => {
  it('leaves the list most of a big phone, and still a good part of a small one', () => {
    expect(BIG.width).toBe(358);
    expect(BIG.height).toBeGreaterThan(450);
    expect(SMALL.width).toBe(288);
    expect(SMALL.height).toBeGreaterThan(270);
  });
});

describe('layList', () => {
  it('puts groups on one line while they fit, like flex-wrap', () => {
    // 3 + 3 photos of 40 px with their gaps (128 each) and the gap between groups fit in 288
    const lay = layList(288, [{ label: 'Bloque 1', count: 3 }, { label: 'Bloque 2', count: 3 }], 40, 'over');
    expect(lay.lines).toEqual([[0, 1]]);
    expect(lay.height).toBe(LIST.LABEL_H + 40);
    // a group never narrower than its label
    expect(layList(288, [{ label: 'Calentamiento', count: 1 }], 40, 'over').widths[0]).toBe(labelWidth('Calentamiento'));
  });

  it('wraps a group longer than a line inside itself', () => {
    const lay = layList(200, [{ label: 'Bloque 1', count: 9 }], 40, 'over');
    // 4 a line (4 × 44 − 4 = 172 ≤ 200): 3 rows
    expect(lay.lines).toEqual([[0]]);
    expect(lay.height).toBe(LIST.LABEL_H + 3 * 40 + 2 * LIST.GAP);
  });
});

describe('fitList', () => {
  it.each([
    ['big phone, short routine (1 block of 3)', BIG, groupsOf(0, 1, 3)],
    ['big phone, typical routine (3 warm-up, 3 blocks of 4)', BIG, groupsOf(3, 3, 4)],
    ['big phone, long routine (4 warm-up, 5 blocks of 6)', BIG, groupsOf(4, 5, 6)],
    ['small phone, short routine (1 block of 3)', SMALL, groupsOf(0, 1, 3)],
    ['small phone, typical routine (3 warm-up, 3 blocks of 4)', SMALL, groupsOf(3, 3, 4)],
    ['small phone, 2 warm-up and 4 blocks of 3', SMALL, groupsOf(2, 4, 3)],
  ])('%s: everything fits on one screen, the photos as big as they can be', (_, room, groups) => {
    const fit = fitList(room.width, room.height, groups);
    expect(fit.fits).toBe(true);
    expect(fit.height).toBeLessThanOrEqual(room.height);
    expect(fit.tile).toBeLessThanOrEqual(LIST.MAX_TILE);
    expect(fit.tile).toBeGreaterThanOrEqual(LIST.MIN_OVER);
    for (const w of fit.widths) expect(w).toBeLessThanOrEqual(room.width);
    // one pixel more would not fit (or it is already as big as allowed)
    if (fit.tile < LIST.MAX_TILE && fit.names === 'below') expect(layList(room.width, groups, fit.tile + 1, 'below').height).toBeGreaterThan(room.height);
  });

  it('keeps the names under the photos on a big phone for a typical routine, at 56 px or more', () => {
    const fit = fitList(BIG.width, BIG.height, groupsOf(3, 3, 4));
    expect(fit.names).toBe('below');
    expect(fit.tile).toBeGreaterThanOrEqual(LIST.MIN_BELOW);
  });

  it('puts the names over the photos when that is the only way to fit (a long routine on a big phone)', () => {
    const fit = fitList(BIG.width, BIG.height, groupsOf(4, 5, 6));
    expect(fit.names).toBe('over');
    expect(fit.tile).toBeGreaterThanOrEqual(48);
  });

  it('scrolls, at the smallest legible size, a routine too long for a small phone', () => {
    const fit = fitList(SMALL.width, SMALL.height, groupsOf(4, 5, 6));
    expect(fit.fits).toBe(false);
    expect(fit.tile).toBe(LIST.MIN_OVER);
    expect(fit.names).toBe('over');
    expect(fit.height).toBeGreaterThan(SMALL.height);
  });

  it('has room on a small phone for up to 4 lines of groups', () => {
    // 4 groups of 6 (a warm-up of 6 and 3 blocks of 6): one a line
    expect(fitList(SMALL.width, SMALL.height, [{ label: 'Calentamiento', count: 6 }, ...groupsOf(0, 3, 6)]).fits).toBe(true);
    // 5 groups of 6: no
    expect(fitList(SMALL.width, SMALL.height, [{ label: 'Calentamiento', count: 6 }, ...groupsOf(0, 4, 6)]).fits).toBe(false);
  });
});

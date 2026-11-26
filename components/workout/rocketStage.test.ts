import { describe, expect, it } from 'vitest';
import { estimateTextWidth } from './padRocketShape';
import { SEPARATION as S } from './rocketFlight';
import { STAGE_TEXT, SHIP, hullHalfAt, lookTransform, stackGeometry, stageLabels, stageLayout, widgetLayout, type LookPair } from './rocketShape';
import { FINS_OUT_MS, finPop, finsAt, finsPending } from './separation';

/*
 * The new rocket's stages (26-11-2026): each one's block name as big as fits over the bars of its
 * series, end to end; and the fins that spring out of the new tail.
 */

// the bar's rocket on phones of 320, 360, 390 and 430 px, and a tablet's cap
const FRAMES = [296, 299, 325, 359, 460];
const INK_UP = STAGE_TEXT.INK_EM - STAGE_TEXT.DESC_EM;

describe('a stage: its name over its bars', () => {
  const g = stackGeometry({ width: 325, blocks: 3 });
  const L = stageLayout(g);

  it('puts the name above the bars and the bars above the belly, all inside the hull', () => {
    expect(L.name.top).toBeGreaterThanOrEqual(g.F + SHIP.STROKE);
    expect(L.name.bottom).toBeLessThan(L.bars.mid - STAGE_TEXT.BAR / 2);
    // the done and pending bars clear of the belly's shading; the one in progress may dip into it
    expect(L.bars.mid + STAGE_TEXT.BAR / 2).toBeLessThanOrEqual(g.belly.light);
    expect(L.bars.bottom).toBeLessThan(g.F + g.T - SHIP.STROKE);
    // the bars as thick as the old hilo's, the one in progress thicker still
    expect(STAGE_TEXT.BAR).toBeGreaterThanOrEqual(7);
    expect(STAGE_TEXT.BAR_NOW).toBeGreaterThan(STAGE_TEXT.BAR);
    // the name as big as the hull allows: over 14 px in a 30 px hull
    expect(L.maxPx).toBeGreaterThanOrEqual(14);
  });

  it('spans the bars from one end of the stage to the other (just clear of its ring or livery)', () => {
    for (const seg of g.segments) {
      const len = seg.end - seg.start;
      const tail = seg === g.segments[0] ? g.livery.end - seg.start : 0;
      expect(seg.content.right - seg.content.left).toBeGreaterThanOrEqual(len - tail - SHIP.JOINT - 2 * SHIP.CONTENT_GAP - SHIP.STROKE);
    }
  });
});

describe('every stage still on has the same room (the bar: its stages stretched over the body)', () => {
  const cases = [280, 325, 380].flatMap((width) => [2, 3, 4].flatMap((blocks) => Array.from({ length: blocks }, (_, i) => ({ width, blocks, first: i + 1 }))));

  it.each(cases)('the same width for every name and every row of bars, end to end (%o)', ({ width, blocks, first }) => {
    const g = stackGeometry({ width, blocks, first, stretch: true });
    const rooms = g.segments.map((s) => s.content.right - s.content.left);
    for (const r of rooms) expect(Math.abs(r - rooms[0])).toBeLessThanOrEqual(0.15);
    // contiguous, from the tail to the nose's base, a ring at every inner end
    expect(g.segments[0].start).toBe(g.x0);
    expect(g.segments.at(-1)!.end).toBe(g.xs);
    for (const [i, s] of g.segments.entries()) if (i > 0) expect(s.start).toBe(g.segments[i - 1].end);
    expect(g.joints.map((j) => j.x)).toEqual(g.segments.slice(0, -1).map((s) => s.end));
    // each name in the middle of its room
    for (const [i, l] of stageLabels(g).entries()) expect(l.x).toBeCloseTo((g.segments[i].content.left + g.segments[i].content.right) / 2, 1);
  });

  it('leaves the one-stage rockets exactly as they were', () => {
    for (const [w, xs, right] of [
      [150, 100.7, 97.1],
      [325, 275.7, 272.1],
      [460, 410.7, 407.1],
    ]) {
      const g = stackGeometry({ width: w });
      expect([g.xe, g.x0, g.xs, g.livery.end]).toEqual([18, 29, xs, 48.3]);
      expect(g.segments).toEqual([{ block: 1, start: 29, end: xs, content: { left: 50.3, right, top: g.F + SHIP.STROKE, bottom: g.F + g.T - SHIP.STROKE } }]);
    }
  });
});

describe('the block names', () => {
  const cases = FRAMES.flatMap((frame) =>
    [1, 2, 3, 4, 6].flatMap((blocks) =>
      Array.from({ length: blocks }, (_, i) => i + 1).flatMap((first) =>
        [false, true].map((stretch) => ({ frame, blocks, first, stretch, boosters: first === 1 && blocks > 1 && stretch })),
      ),
    ),
  );

  it.each(cases)('never leave their stage, all at one size, inside the room over the bars (%o)', ({ frame, blocks, first, stretch, boosters }) => {
    const g = stackGeometry({ width: frame, blocks, first, stretch, boosters });
    const room = stageLayout(g);
    const labels = stageLabels(g);
    expect(labels).toHaveLength(g.segments.length);
    const px = labels[0].px;
    for (const [i, l] of labels.entries()) {
      const seg = g.segments[i];
      expect(l.px).toBe(px);
      expect(l.px).toBeLessThanOrEqual(room.maxPx);
      const w = estimateTextWidth(l.text, l.px);
      expect(l.x - w / 2).toBeGreaterThanOrEqual(seg.content.left);
      expect(l.x + w / 2).toBeLessThanOrEqual(seg.content.right);
      // its ink, ascender to descender, in the room over the bars
      expect(l.y - INK_UP * l.px).toBeGreaterThanOrEqual(room.name.top - 0.05);
      expect(l.y + STAGE_TEXT.DESC_EM * l.px).toBeLessThanOrEqual(room.name.bottom + 0.05);
    }
  });

  it('say "Bloque N" as big as fits, and just "N" only when that would be too small', () => {
    // the phone's bar at 390 px: three stages, all on
    const three = stageLabels(stackGeometry({ width: 325, blocks: 3 }));
    expect(three.map((l) => l.text)).toEqual(['Bloque 1', 'Bloque 2', 'Bloque 3']);
    expect(three[0].px).toBeGreaterThanOrEqual(12);
    // the last stage, stretched over the whole bar: the biggest the hull holds
    const last = stageLabels(stackGeometry({ width: 325, blocks: 3, first: 3, stretch: true }));
    expect(last[0].px).toBe(stageLayout(stackGeometry({ width: 325 })).maxPx);
    // six short stages on a 320 px phone: the numbers, big
    const six = stageLabels(stackGeometry({ width: 296, blocks: 6 }));
    expect(six.map((l) => l.text)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(six[0].px).toBeGreaterThanOrEqual(STAGE_TEXT.MIN_PX);
    for (const l of [...three, ...last]) expect(l.px).toBeGreaterThanOrEqual(STAGE_TEXT.MIN_PX);
  });

  it('use a real measurement when there is one (and step down until it fits)', () => {
    // a font a fifth wider than the estimate: still inside
    const wide = (text: string, px: number) => estimateTextWidth(text, px) * 1.2 + 1;
    const g = stackGeometry({ width: 296, blocks: 3 });
    for (const [i, l] of stageLabels(g, wide).entries()) expect(wide(l.text, l.px)).toBeLessThanOrEqual(g.segments[i].content.right - g.segments[i].content.left);
  });
});

describe('the stretch keeps the names crisp', () => {
  const L = widgetLayout(378, { blocks: 4, first: 3, boosters: false });
  const pair: LookPair = {
    real: stackGeometry({ width: L.frame, blocks: 4, first: 3 }),
    full: stackGeometry({ width: L.frame, blocks: 4, first: 3, stretch: true }),
    shift: L.ship.shift,
  };
  const parse = (t: string) => ({
    x: Number(/translateX\(([-\d.]+)px\)/.exec(t)?.[1]),
    k: Number(/ scale\(([-\d.]+)\)/.exec(t)?.[1]),
  });

  it('moves each name with its stage’s middle, never stretched, only smaller while its stage is shorter', () => {
    for (const block of [3, 4]) {
      expect(lookTransform(pair, 1, 1, { kind: 'mid', block })).toBe('translateX(0px) scale(1)');
      const a = pair.real.segments.find((s) => s.block === block)!;
      const b = pair.full.segments.find((s) => s.block === block)!;
      // drawn stretched, seen at the real length: at the real stage's middle, smaller by its share
      const t = parse(lookTransform(pair, 1, 0, { kind: 'mid', block }));
      expect((b.start + b.end) / 2 + t.x).toBeCloseTo((a.start + a.end) / 2, 1);
      expect(t.k).toBeCloseTo((a.end - a.start) / (b.end - b.start), 3);
      // drawn at the real length, seen stretched: at the long stage's middle, its own size
      const back = parse(lookTransform(pair, 0, 1, { kind: 'mid', block }));
      expect((a.start + a.end) / 2 + back.x).toBeCloseTo((b.start + b.end) / 2, 1);
      expect(back.k).toBe(1);
    }
  });
});

describe('the outline', () => {
  it('runs on from the hull into the nose without a step, down to nothing past its rounded end', () => {
    const g = stackGeometry({ width: 325, blocks: 2 });
    expect(hullHalfAt(g, g.xs - 1)).toBe(g.T / 2);
    let last = g.T / 2;
    for (let x = g.xs; x <= g.nose.end + 2; x += 0.5) {
      const h = hullHalfAt(g, x);
      expect(h).toBeLessThanOrEqual(last + 0.05);
      expect(last - h).toBeLessThan(2);
      last = h;
    }
    expect(hullHalfAt(g, g.nose.end + 3)).toBe(0);
  });
});

describe('the fins of the new tail', () => {
  it('spring out: quickly past their size, a little back, settled at 1', () => {
    expect(finPop(0)).toBe(0);
    expect(finPop(1)).toBe(1);
    const peak = Math.max(...Array.from({ length: 101 }, (_, i) => finPop(i / 100)));
    expect(peak).toBeGreaterThan(1.08);
    expect(peak).toBeLessThan(1.25);
    expect(finPop(0.75)).toBeLessThan(1);
    for (let i = 0; i < 10; i++) expect(finPop((i + 1) / 20)).toBeGreaterThanOrEqual(finPop(i / 20));
  });

  it('are in the hull from the release until their moment, after the part has gone, then spring out', () => {
    expect(finsAt(S.releaseMs - 1)).toBe(1);
    expect(finsAt(S.releaseMs)).toBe(0);
    expect(finsAt(S.releaseMs + S.fallMs - 1)).toBe(0);
    expect(finsAt(S.finsMs)).toBe(0);
    expect(finsAt(S.finsMs + S.finsSpringMs / 2)).toBeGreaterThan(1);
    expect(finsAt(FINS_OUT_MS)).toBe(1);
    expect(FINS_OUT_MS).toBeLessThanOrEqual(S.sputtersMs[0]);
    expect(finsPending(S.releaseMs - 1)).toBe(false);
    expect(finsPending(S.releaseMs)).toBe(true);
    expect(finsPending(FINS_OUT_MS)).toBe(false);
    expect(finsPending(null)).toBe(false);
    // reduced motion: no clouds to watch them in: they are simply out
    expect(finsAt(S.finsMs + 100, true)).toBe(1);
    expect(finsPending(S.finsMs, true)).toBe(false);
  });
});

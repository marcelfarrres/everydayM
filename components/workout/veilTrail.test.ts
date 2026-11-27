import { describe, expect, it } from 'vitest';
import { VEIL_WORDS, arrivalCoveredAt, arrivalFront, arrivalPuffs, maskAlpha, trailProgressAt, trailPuffs, trailShape, veilHandOffMs } from '@/components/workout/veilTrail';

describe('the white screen: the hold', () => {
  it('holds the words 2 s from the moment they are fully uncovered', () => {
    for (const uncovered of [0, 420, 760]) {
      const leavesAt = veilHandOffMs(uncovered) + VEIL_WORDS.leaveDelayMs;
      expect(leavesAt - uncovered).toBe(2000);
    }
  });
});

describe('the white screen: it arrives as the smoke spreading up, uncovering what is on it', () => {
  const W = 390;
  const H = 844;
  const steps = Array.from({ length: 101 }, (_, i) => i / 100);
  const grid: [number, number][] = [];
  for (let x = 0; x <= W; x += 15) for (let y = 0; y <= H; y += 15) grid.push([x, y]);

  it('the front only rises; nothing shows at 0, all is white at 1', () => {
    for (let i = 1; i < steps.length; i++) expect(arrivalFront(steps[i])).toBeLessThanOrEqual(arrivalFront(steps[i - 1]));
    const none = arrivalPuffs(0, W, H);
    const all = arrivalPuffs(1, W, H);
    for (const [x, y] of grid) {
      expect(maskAlpha(none, x, y)).toBe(0);
      expect(maskAlpha(all, x, y)).toBe(1);
    }
  });

  it('what is covered stays covered (from the pad, off the middle, too)', () => {
    // (a coarser grid and step: it is a lot of points)
    const coarse = grid.filter((_, k) => k % 3 === 0);
    for (const origin of [W / 2, W * 0.62]) {
      let prev = coarse.map(() => 0);
      for (const p of steps.filter((_, k) => k % 2 === 0)) {
        const shape = arrivalPuffs(p, W, H, origin);
        const now = coarse.map(([x, y]) => maskAlpha(shape, x, y));
        now.forEach((a, k) => expect(a).toBeGreaterThanOrEqual(prev[k] - 0.02));
        prev = now;
      }
    }
  });

  it('below the front it is all white (no holes in it)', () => {
    for (const p of [0.25, 0.5, 0.75]) {
      const shape = arrivalPuffs(p, W, H);
      const E = arrivalFront(p) * H;
      for (const [x, y] of grid) if (y >= E + 0.6 * (W / 6) * 1.15 + 0.45 * 0.6 * 0.85 * (W / 6)) expect(maskAlpha(shape, x, y)).toBe(1);
    }
  });

  it('the words are fully uncovered exactly when the white covers their box, the lower lines first', () => {
    const line1 = { left: 60, top: 300, right: 330, bottom: 350 };
    const line3 = { left: 60, top: 420, right: 330, bottom: 470 };
    const p1 = arrivalCoveredAt(line1, W, H);
    const p3 = arrivalCoveredAt(line3, W, H);
    expect(p3).toBeLessThan(p1);
    // (at that moment every point of the box is white; a moment before, some is not)
    const at = arrivalPuffs(p1, W, H);
    const before = arrivalPuffs(p1 - 0.01, W, H);
    const pts: [number, number][] = [];
    for (let x = line1.left; x <= line1.right; x += 45) for (let y = line1.top; y <= line1.bottom; y += 25) pts.push([x, y]);
    expect(pts.every(([x, y]) => maskAlpha(at, x, y) >= 0.999)).toBe(true);
    expect(pts.some(([x, y]) => maskAlpha(before, x, y) < 0.999)).toBe(true);
  });
});

describe('the white screen: the smoke leaves like a trail fading from the pad up', () => {
  const steps = Array.from({ length: 101 }, (_, i) => i / 100);

  it('the cleared edge only moves up; the trail only narrows', () => {
    let prev = trailShape(0);
    for (const p of steps.slice(1)) {
      const s = trailShape(p);
      expect(s.edge).toBeLessThanOrEqual(prev.edge);
      expect(s.width).toBeLessThanOrEqual(prev.width + 1e-12);
      expect(s.top).toBeLessThanOrEqual(prev.top + 1e-12);
      expect(s.top).toBeLessThanOrEqual(s.width + 1e-12);
      expect(s.opacity).toBeLessThanOrEqual(prev.opacity);
      prev = s;
    }
  });

  it('starts all white, below the screen, and ends all clear', () => {
    expect(trailShape(0)).toMatchObject({ width: 1, top: 1, opacity: 1 });
    expect(trailShape(0).edge).toBeGreaterThanOrEqual(1);
    const end = trailShape(1);
    expect(end.edge).toBeLessThanOrEqual(0);
    expect(end.width).toBe(0);
    expect(end.top).toBe(0);
    expect(end.opacity).toBe(0);
    const { puffs, core } = trailPuffs(1, 390, 844);
    expect(puffs.every((p) => p.r === 0)).toBe(true);
    expect(core.w).toBe(0);
  });

  it('at 0 the puffs and the middle cover the whole screen', () => {
    const W = 390;
    const H = 844;
    const { puffs, core } = trailPuffs(0, W, H);
    // (a point is white when inside the middle band or within 60 % of a puff's radius)
    for (let x = 0; x <= W; x += 13) {
      for (let y = 0; y <= H; y += 13) {
        const inCore = x >= core.x && x <= core.x + core.w && y >= core.y && y <= core.y + core.h;
        const inPuff = puffs.some((p) => Math.hypot(p.x - x, p.y - y) <= 0.6 * p.r);
        expect(inCore || inPuff).toBe(true);
      }
    }
  });

  it('halfway it has cleared the bottom half or so, and nothing is left below the edge', () => {
    const H = 844;
    const s = trailShape(0.5);
    expect(s.edge).toBeGreaterThan(0.4);
    expect(s.edge).toBeLessThan(0.7);
    const { puffs } = trailPuffs(0.5, 390, H);
    // (the puffs' solid cores end at the cleared edge)
    for (const p of puffs) expect(p.y + 0.6 * p.r).toBeLessThanOrEqual(s.edge * H + 0.15 * p.r + 1e-6);
  });

  it('finds when the edge reaches a height', () => {
    for (const e of [0.9, 0.6, 0.3]) expect(trailShape(trailProgressAt(e)).edge).toBeCloseTo(e, 6);
  });
});

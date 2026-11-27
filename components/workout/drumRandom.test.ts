import { describe, expect, it } from 'vitest';
import { SUGGESTIONS } from '@/lib/intent/suggestions';
import { seeded } from '@/lib/routine/fixtures.test-helpers';
import { randomLanding, stepsTo } from './drumRandom';
import { WHEEL, centreIndex, rouletteSwapAt, wrapOffset } from './launchDrum';

const drum: string[] = SUGGESTIONS.slice(0, 9);

describe('Random', () => {
  it('lands on any sentence of the bank, never on the one centred now', () => {
    const rng = seeded(7);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const centre = i % 9;
      const pick = randomLanding({ bank: SUGGESTIONS, drum, centre, random: rng });
      expect(pick).not.toBeNull();
      expect(pick!.text).not.toBe(drum[centre]);
      expect(pick!.index).not.toBe(centre);
      expect(pick!.index).toBeGreaterThanOrEqual(0);
      expect(pick!.index).toBeLessThan(9);
      // a sentence already on the drum is landed on where it is
      if (drum.includes(pick!.text)) expect(drum[pick!.index]).toBe(pick!.text);
      seen.add(pick!.text);
    }
    // the whole bank comes up, not only the nine on the drum
    expect(seen.size).toBe(SUGGESTIONS.length);
  });

  it('does not repeat a sentence until the bank has run out', () => {
    const rng = seeded(3);
    let recent: string[] = [];
    let centre = 0;
    const order: string[] = [];
    for (let i = 0; i < SUGGESTIONS.length - 1; i++) {
      const pick = randomLanding({ bank: SUGGESTIONS, drum, centre, recent, random: rng })!;
      order.push(pick.text);
      recent = pick.recent;
      centre = pick.index;
    }
    expect(new Set(order).size).toBe(order.length);
    // then it starts over (still never the centred one)
    const next = randomLanding({ bank: SUGGESTIONS, drum, centre, recent: [...SUGGESTIONS], random: rng });
    expect(next).not.toBeNull();
    expect(next!.text).not.toBe(drum[centre]);
    expect(next!.recent).toEqual([next!.text]);
  });

  it('gives nothing to land on when there is nothing else', () => {
    expect(randomLanding({ bank: ['A'], drum: ['A', 'B'], centre: 0 })).toBeNull();
    expect(randomLanding({ bank: SUGGESTIONS, drum: ['A'], centre: 0 })).toBeNull();
  });

  it('turns more than a full turn and stops on the chosen rocket', () => {
    for (let centre = 0; centre < 9; centre++) {
      for (let index = 0; index < 9; index++) {
        if (index === centre) continue;
        const steps = stepsTo(centre, index, 9);
        expect(steps).toBeGreaterThan(9);
        expect(centreIndex(centre + steps, 9)).toBe(index);
      }
    }
  });

  it('changes the sentence only while that rocket is out of sight', () => {
    for (let centre = 0; centre < 9; centre++) {
      for (let index = 0; index < 9; index++) {
        if (index === centre) continue;
        const steps = stepsTo(centre, index, 9);
        const p = rouletteSwapAt(centre, steps, 9, index);
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(0.6);
        // at that moment it is out of sight
        const ease = 1 - (1 - p) ** 3.2;
        expect(Math.abs(wrapOffset(index, centre + steps * ease, 9))).toBeGreaterThanOrEqual(WHEEL.unseenAt);
      }
    }
  });
});

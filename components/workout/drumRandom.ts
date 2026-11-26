/*
 * The red "Random" button of the rocket base (phone) can land on any sentence of the bank, not
 * only on the nine rockets on the drum: it picks one, and if it is not on the drum yet it is put on
 * the rocket where the roulette will stop (while that rocket is out of sight). Pure.
 */

export interface RandomLanding {
  /** the drum slot the roulette stops on (never the one centred now) */
  index: number;
  /** the sentence it lands on */
  text: string;
  /** the sentences already picked, to avoid repeats until the bank runs out */
  recent: string[];
}

/**
 * Where Random lands: a sentence of `bank` (never the one centred now, nor one picked recently
 * while others are left), on the slot that already holds it or else on another slot at random.
 * Null when there is nothing else to land on.
 */
export function randomLanding({
  bank,
  drum,
  centre,
  recent = [],
  random = Math.random,
}: {
  bank: readonly string[];
  drum: readonly string[];
  centre: number;
  recent?: readonly string[];
  random?: () => number;
}): RandomLanding | null {
  const n = drum.length;
  if (n < 2) return null;
  const centred = drum[centre];
  const others = Array.from(new Set(bank)).filter((s) => s !== centred);
  if (others.length === 0) return null;
  const fresh = others.filter((s) => !recent.includes(s));
  const pool = fresh.length > 0 ? fresh : others;
  const text = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  const already = drum.indexOf(text);
  const index = already >= 0 && already !== centre ? already : (centre + 1 + Math.min(n - 2, Math.floor(random() * (n - 1)))) % n;
  const kept = fresh.length > 0 ? recent : [];
  return { index, text, recent: [...kept, text] };
}

/** How many steps the roulette turns to stop on `index` from `centre`: more than a full turn. */
export function stepsTo(centre: number, index: number, n: number): number {
  return n + ((((index - centre) % n) + n) % n);
}

/*
 * How the full routine's music bed is laid out: which tracks, in which order, so their
 * crossfaded sum covers the video. Pure (no 'server-only') so it is covered by tests.
 */

export const CROSSFADE_SECONDS = 3;
const MAX_MUSIC_INPUTS = 80;

/**
 * Which tracks to play, in order, to cover `seconds`: the given order, repeated as needed.
 * Each new track overlaps the previous one by `crossfade` seconds. Pure, for tests.
 */
export function planMusicBed(durations: readonly number[], seconds: number, crossfade = CROSSFADE_SECONDS): { order: number[]; crossfade: number } {
  const usable = durations.map((d, i) => ({ d, i })).filter(({ d }) => d >= 2);
  if (usable.length === 0 || seconds <= 0) return { order: [], crossfade: 0 };
  const fade = Math.max(0, Math.min(crossfade, Math.min(...usable.map((u) => u.d)) / 3));
  const order: number[] = [];
  let covered = 0;
  for (let k = 0; covered < seconds + 0.5 && order.length < MAX_MUSIC_INPUTS; k++) {
    const { d, i } = usable[k % usable.length];
    covered += order.length === 0 ? d : d - fade;
    order.push(i);
  }
  return { order, crossfade: fade };
}

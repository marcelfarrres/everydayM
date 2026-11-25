/*
 * Soft hyphens (U+00AD) at the syllable breaks of Spanish words, so a long name can break across
 * two lines at a syllable, with a hyphen, wherever the browser has no dictionary of its own
 * (`hyphens: manual` shows them only where a line breaks; `hyphens: none` ignores them). Pure.
 *
 * The usual rules, simplified: one consonant between two vowels goes with the second (ca-ra);
 * two are split between them (can-to), unless they are an inseparable pair (ha-bla, co-che,
 * ca-lle); of three or more, the last one goes with the vowel, or the last two if they are a pair
 * (hom-bro, ins-tan-te). Vowels together are never split. No break leaves fewer than two letters
 * on either side, and short words are left alone.
 */

export const SHY = '­';

const VOWELS = new Set('aeiouáéíóúü');
const PAIRS = new Set(['pr', 'pl', 'br', 'bl', 'fr', 'fl', 'tr', 'tl', 'dr', 'cr', 'cl', 'gr', 'gl', 'kr', 'kl', 'ch', 'll', 'rr']);

/** The syllable breaks of `word` (indexes a break goes before). */
export function syllableBreaks(word: string): number[] {
  const w = word.toLowerCase();
  const vowel = (i: number) => VOWELS.has(w[i]);
  const breaks: number[] = [];
  let a = 0;
  while (a < w.length) {
    if (!vowel(a)) {
      a++;
      continue;
    }
    let b = a + 1;
    while (b < w.length && !vowel(b)) b++;
    if (b >= w.length) break;
    const k = b - a - 1;
    if (k === 1) breaks.push(a + 1);
    else if (k >= 2) breaks.push(PAIRS.has(w.slice(b - 2, b)) ? b - 2 : b - 1);
    a = b;
  }
  return breaks.filter((at) => at >= 2 && w.length - at >= 2);
}

/** `word` with soft hyphens at its syllable breaks (words shorter than `min` letters as they are). */
export function hyphenateWord(word: string, min = 6): string {
  if (word.length < min) return word;
  let out = '';
  let from = 0;
  for (const at of syllableBreaks(word)) {
    out += word.slice(from, at) + SHY;
    from = at;
  }
  return out + word.slice(from);
}

/** Every word of `text` with its soft hyphens. */
export const hyphenateEs = (text: string): string => text.replace(/\p{L}+/gu, (word) => hyphenateWord(word));

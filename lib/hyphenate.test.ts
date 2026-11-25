import { describe, expect, it } from 'vitest';
import { SHY, hyphenateEs, hyphenateWord } from './hyphenate';

const shown = (s: string) => s.split(SHY).join('-');

describe('hyphenateWord', () => {
  it.each([
    ['Calentamiento', 'Ca-len-ta-mien-to'],
    ['Sentadilla', 'Sen-ta-di-lla'],
    ['mancuerna', 'man-cuer-na'],
    ['hombro', 'hom-bro'],
    ['Plancha', 'Plan-cha'],
    ['búlgara', 'búl-ga-ra'],
    ['Abdominales', 'Ab-do-mi-na-les'],
  ])('%s → %s', (word, expected) => {
    expect(shown(hyphenateWord(word))).toBe(expected);
  });

  it('leaves short words alone and never leaves a single letter on either side', () => {
    expect(hyphenateWord('Remo')).toBe('Remo');
    expect(hyphenateWord('ayudas')).not.toMatch(new RegExp(`^.${SHY}`));
  });
});

describe('hyphenateEs', () => {
  it('hyphenates each word and keeps everything else', () => {
    expect(shown(hyphenateEs('Remo con mancuerna (2)'))).toBe('Remo con man-cuer-na (2)');
    expect(hyphenateEs('Remo con mancuerna').split(SHY).join('')).toBe('Remo con mancuerna');
  });
});

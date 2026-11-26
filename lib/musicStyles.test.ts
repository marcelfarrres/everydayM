import { describe, expect, it } from 'vitest';
import { MUSIC_STYLES, MUSIC_STYLE_LABELS, isMusicStyle, toMusicStyle } from './musicStyles';

describe('music styles', () => {
  it('lists the four styles in order, each with its Spanish label', () => {
    expect(MUSIC_STYLES).toEqual(['techno-house', 'anos-80', 'regueton', 'comercial']);
    expect(MUSIC_STYLES.map((s) => MUSIC_STYLE_LABELS[s])).toEqual(['Techno / house', 'Años 80', 'Reguetón', 'Comercial']);
  });

  it('accepts only the stored values', () => {
    expect(isMusicStyle('regueton')).toBe(true);
    expect(isMusicStyle('Reguetón')).toBe(false);
    expect(isMusicStyle('toString')).toBe(false);
    expect(toMusicStyle('comercial')).toBe('comercial');
    expect(toMusicStyle(undefined)).toBeNull();
    expect(toMusicStyle(42)).toBeNull();
  });
});

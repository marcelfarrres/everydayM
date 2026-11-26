import type { MusicStyle } from '@/types/catalog';

/*
 * The music styles: the one list, with the Spanish label of each. The Studio (tag a track) and
 * the player (choose what plays) both read it. Pure: no browser, no server.
 */

/** Spanish label of each style. Its key order is the order everywhere (Studio and player). */
export const MUSIC_STYLE_LABELS: Record<MusicStyle, string> = {
  'techno-house': 'Techno / house',
  'anos-80': 'Años 80',
  regueton: 'Reguetón',
  comercial: 'Comercial',
};

export const MUSIC_STYLES = Object.keys(MUSIC_STYLE_LABELS) as MusicStyle[];

export function isMusicStyle(value: unknown): value is MusicStyle {
  return typeof value === 'string' && (MUSIC_STYLES as string[]).includes(value);
}

/** A stored value as a style: anything unknown (or missing) is "no style". */
export function toMusicStyle(value: unknown): MusicStyle | null {
  return isMusicStyle(value) ? value : null;
}

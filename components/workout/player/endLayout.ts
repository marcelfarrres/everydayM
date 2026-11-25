/*
 * The phone's end screen, sized (pure): what stands around the list (`endChrome`) and the list
 * itself (`fitList`), which has to fit on one screen without scrolling.
 *
 * The list is every exercise of the routine as a square photo with its name, grouped by part
 * («Calentamiento», «Bloque 1»…), each group a label over its row of photos. Groups flow like
 * words: one after another on a line while they fit (a short warm-up and a short block share
 * one), wrapping when they don't; a group longer than a line wraps inside itself. The photos are
 * as big as can be (at most MAX_TILE) with the name under them (2 lines, 11 px); if even at
 * MIN_BELOW that doesn't fit, the name goes over the bottom of the photo (10 px) and the photos
 * shrink down to MIN_OVER. Below that the list no longer fits: it stays at MIN_OVER and scrolls,
 * once the sequence is over.
 */

export const LIST = {
  MAX_TILE: 84,
  /** the smallest photo with its name under it, and with its name over it */
  MIN_BELOW: 56,
  MIN_OVER: 40,
  /** between two photos of a group, between two groups on a line, between two lines */
  GAP: 4,
  GROUP_GAP: 12,
  LINE_GAP: 8,
  /** a group's label (11 px, its tick beside it) */
  LABEL_H: 17,
  LABEL_CHAR_PX: 6.3,
  LABEL_PAD: 18,
  /** the name under a photo: two lines of 11/13 px and its margin */
  NAME_BELOW: 29,
} as const;

export type NamePlace = 'below' | 'over';

export interface ListGroupSpec {
  label: string;
  count: number;
}

export interface ListFit {
  /** a photo's side (px) and where its name goes */
  tile: number;
  names: NamePlace;
  /** a photo and its name, top to bottom */
  tileH: number;
  /** each group's width (its photos, or its label if that is wider) */
  widths: number[];
  /** the groups on each line */
  lines: number[][];
  height: number;
  /** false: even at the smallest it is taller than the room: it scrolls (after the sequence) */
  fits: boolean;
}

/** A label's width: its characters at 11 px semibold, and the tick beside it. */
export const labelWidth = (label: string) => Math.ceil(label.length * LIST.LABEL_CHAR_PX + LIST.LABEL_PAD);

/** The list laid out with photos `tile` px wide, names `names`, in `width` px. */
export function layList(width: number, groups: ListGroupSpec[], tile: number, names: NamePlace): Omit<ListFit, 'fits'> {
  const W = Math.max(1, Math.floor(width));
  const perLine = Math.max(1, Math.floor((W + LIST.GAP) / (tile + LIST.GAP)));
  const tileH = tile + (names === 'below' ? LIST.NAME_BELOW : 0);
  const widths = groups.map((g) => {
    const across = Math.min(Math.max(1, g.count), perLine);
    return Math.min(W, Math.max(across * (tile + LIST.GAP) - LIST.GAP, labelWidth(g.label)));
  });
  const heightOf = (i: number) => {
    const rows = Math.ceil(Math.max(1, groups[i].count) / perLine);
    return LIST.LABEL_H + rows * tileH + (rows - 1) * LIST.GAP;
  };
  // (as flex-wrap does it: a group goes on the line while it fits after the others and its gap)
  const lines: number[][] = [];
  let x = 0;
  widths.forEach((w, i) => {
    const line = lines.at(-1);
    if (line && x + LIST.GROUP_GAP + w <= W) {
      line.push(i);
      x += LIST.GROUP_GAP + w;
    } else {
      lines.push([i]);
      x = w;
    }
  });
  const height = lines.reduce((sum, line) => sum + Math.max(...line.map(heightOf)), 0) + Math.max(0, lines.length - 1) * LIST.LINE_GAP;
  return { tile, names, tileH, widths, lines, height };
}

/** The biggest list that fits in `width` × `height` px (or the smallest, scrolling). */
export function fitList(width: number, height: number, groups: ListGroupSpec[]): ListFit {
  const room = Math.floor(height);
  for (const [names, min] of [
    ['below', LIST.MIN_BELOW],
    ['over', LIST.MIN_OVER],
  ] as const) {
    // (the largest photos that fit with the names under them; failing that, with the names over them)
    const top = names === 'below' ? LIST.MAX_TILE : LIST.MIN_BELOW + 12;
    for (let tile = top; tile >= min; tile--) {
      const lay = layList(width, groups, tile, names);
      if (lay.height <= room) return { ...lay, fits: true };
    }
  }
  return { ...layList(width, groups, LIST.MIN_OVER, 'over'), fits: false };
}

/*
 * What stands around the list (px), top to bottom; `compact` on short screens (under 700 px tall).
 * The end screen uses these same numbers, so the room left for the list is the one measured there.
 */
export const CHROME = {
  /** the side margins */
  SIDE: 16,
  /** the top: the safe area (12 px at least), the "···" menu's 44 px, 8 px */
  TOP_MIN: 12,
  MENU: 52,
  /** the rocket's parking place (the rocket is 56 px tall) */
  ROCKET: 62,
  /** «¡Hecho!», the facts and the praise */
  TITLE: { normal: 92, compact: 74 },
  /** above and below the list */
  LIST_GAP: { normal: 12, compact: 8 },
  /** the two buttons */
  BUTTONS: { normal: 56, compact: 48 },
  /** the bottom: the safe area, 24 px at least */
  BOTTOM_MIN: 24,
  COMPACT_BELOW: 700,
} as const;

export const isCompact = (vh: number) => vh < CHROME.COMPACT_BELOW;

/** The room the list has on a `vw` × `vh` screen with these safe areas. */
export function listRoom(vw: number, vh: number, safe: { top: number; bottom: number } = { top: 0, bottom: 0 }): { width: number; height: number } {
  const size = isCompact(vh) ? 'compact' : 'normal';
  const top = Math.max(CHROME.TOP_MIN, safe.top) + CHROME.MENU;
  const bottom = Math.max(CHROME.BOTTOM_MIN, safe.bottom);
  const around = top + CHROME.ROCKET + CHROME.TITLE[size] + 2 * CHROME.LIST_GAP[size] + CHROME.BUTTONS[size] + bottom;
  return { width: vw - 2 * CHROME.SIDE, height: Math.max(0, vh - around) };
}

/*
 * The first screen (phone) while the keyboard is up, like a chat: the nose you write in rests just
 * above the keyboard (the crane lowers it on a longer cable, its arm stays), and the keyboard covers
 * the rocket base (it fades out). Where the keyboard's top edge is comes from the visual viewport:
 * on iOS (and Chrome on Android) the page keeps its height and only the visual viewport shrinks; on
 * the browsers that shrink the page instead, the page's height is held in px while typing
 * (--pad-dvh), so both come down to the same numbers here.
 */

/** How the keyboard is told from the browser's own bars, and the nose's gap above it. */
export const NOSE_DOCK = {
  /** the keyboard is up when it covers more than this share of the page (the bars never do) */
  openShare: 0.18,
  /** the nose's bottom this far above the keyboard, px */
  margin: 8,
  /** the move, following the keyboard, ms */
  moveMs: 280,
} as const;

export interface NoseDockInput {
  /** the page's height (its held height while typing, where it is held), px */
  pageH: number;
  /** the visual viewport: its height, and its top in the page (scrollY + offsetTop), px */
  vvHeight: number;
  vvPageTop: number;
  /** the nose's bottom where it hangs when nothing is open, in the page, px */
  noseBottom: number;
  /** the porthole's height, px (it gives way if the nose must go up) */
  portholeH: number;
}

export interface NoseDock {
  open: boolean;
  /** the keyboard's top edge, in the page, px */
  keyboardTop: number;
  /** the crane lowers the nose this far (a longer cable)… */
  lower: number;
  /** …or, with too little room under it, lifts it (and its arm) this far */
  rise: number;
  /** the porthole's scale then (from its top), 1: as it is */
  portholeScale: number;
}

/** Where the nose goes while typing (and whether the base is covered). */
export function noseDock({ pageH, vvHeight, vvPageTop, noseBottom, portholeH }: NoseDockInput): NoseDock {
  const keyboardTop = vvPageTop + vvHeight;
  const open = pageH > 0 && pageH - keyboardTop > NOSE_DOCK.openShare * pageH;
  if (!open) return { open: false, keyboardTop, lower: 0, rise: 0, portholeScale: 1 };
  const move = keyboardTop - NOSE_DOCK.margin - noseBottom;
  const lower = Math.max(0, Math.round(move));
  const rise = Math.max(0, Math.round(-move));
  const portholeScale = portholeH > 0 ? Math.min(1, Math.max(0, (portholeH - rise) / portholeH)) : 1;
  return { open, keyboardTop, lower, rise, portholeScale };
}

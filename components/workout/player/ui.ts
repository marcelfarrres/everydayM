import type { MouseEvent } from 'react';

export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

/** Solid translucent fill of the widget over the video (no backdrop blur: it costs every frame). */
export const BAR_FILL = 'bg-[rgb(14_14_14/0.78)]';

/** Stops a button's tap from also opening or closing the list (the whole bar is a toggle). */
export const own = (fn: () => void) => (e: MouseEvent) => {
  e.stopPropagation();
  fn();
};

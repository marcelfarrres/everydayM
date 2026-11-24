import type { MouseEvent } from 'react';

export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

/**
 * Every control of the player: a pointer cursor and a quick colour change on hover. Tailwind's
 * `hover:` only applies where the device can really hover, so phones get no sticky hover.
 */
export const PRESSABLE = 'cursor-pointer transition-colors duration-150 disabled:cursor-default';

/** A light control on the dark widget: hover lights it up a little. */
export const HOVER_ON_DARK = 'hover:bg-white/15 disabled:hover:bg-transparent';

/** Solid translucent fill of the widget over the video (no backdrop blur: it costs every frame). */
export const BAR_FILL = 'bg-[rgb(14_14_14/0.78)]';
/** The same fill, a step lighter, while the pointer is on the bar where a click opens the list. */
export const BAR_HOVER = 'bar-hover:bg-[rgb(44_44_44/0.86)]';

/** Stops a button's tap from also opening or closing the list (the whole bar is a toggle). */
export const own = (fn: () => void) => (e: MouseEvent) => {
  e.stopPropagation();
  fn();
};

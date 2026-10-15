import type { SyntheticEvent } from 'react';

const stop = (event: SyntheticEvent) => event.stopPropagation();

/**
 * Spread onto controls inside a draggable card or column header, so pressing, clicking or typing in them
 * does not start a drag (or open the card).
 */
export const isolate = {
  onMouseDown: stop,
  onTouchStart: stop,
  onKeyDown: stop,
  onClick: stop,
};

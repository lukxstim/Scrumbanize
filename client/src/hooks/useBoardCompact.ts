import { useIsMobile } from './useMediaQuery';
import { useStoredState } from './useStoredState';

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

/**
 * The board's compact view, remembered in this browser. Phones (US-25) keep their own setting and start compact, so
 * a card fits next to its neighbours in the one column on screen; switching there leaves the setting for wide screens
 * as it was. The board and the command palette share it.
 */
export function useBoardCompact() {
  const mobile = useIsMobile();
  const wide = useStoredState('scrumbanize.boardCompact', false, isBoolean);
  const phone = useStoredState('scrumbanize.boardCompact.mobile', true, isBoolean);
  return mobile ? phone : wide;
}

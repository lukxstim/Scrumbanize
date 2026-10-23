import { useCallback, useSyncExternalStore } from 'react';

/** Whether a CSS media query matches, updated when it changes (rotating a phone, resizing a window). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches);
}

/**
 * Below Tailwind's `md` (48rem, 768 px): the phone layout of US-25 with the bottom navigation. Keep in sync with the
 * `max-md:` classes, which switch the same layout in CSS.
 */
export const MOBILE_QUERY = '(width < 48rem)';

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}

import { useCallback, useEffect } from 'react';
import {
  APPEARANCE_KEY,
  applyAppearance,
  CUSTOM_BACKGROUND_KEY,
  DEFAULT_APPEARANCE,
  isAppearance,
  type Appearance,
} from '../utils/appearance';
import { useStoredState } from './useStoredState';

const isImageUrl = (value: unknown): value is string | null => value === null || (typeof value === 'string' && value.startsWith('data:image/'));

/**
 * Color theme and background (US-30), per browser. Every component using it stays in sync, and the choice is put on
 * <html> right away (index.html does so before the first paint of a page).
 */
export function useAppearance() {
  const [appearance, setAppearance] = useStoredState<Appearance>(APPEARANCE_KEY, DEFAULT_APPEARANCE, isAppearance);
  const [customImage, storeCustomImage] = useStoredState<string | null>(CUSTOM_BACKGROUND_KEY, null, isImageUrl);

  useEffect(() => applyAppearance(appearance, customImage), [appearance, customImage]);

  /** Keeps an own background and shows it; fails if the browser's storage is full or unavailable. */
  const setCustomImage = useCallback(
    (url: string) => {
      // A test write first: useStoredState ignores failures, but here the user must hear of them.
      localStorage.setItem(CUSTOM_BACKGROUND_KEY, JSON.stringify(url));
      storeCustomImage(url);
      setAppearance({ ...appearance, background: { kind: 'custom' } });
    },
    [appearance, setAppearance, storeCustomImage],
  );

  const removeCustomImage = useCallback(() => {
    storeCustomImage(null);
    if (appearance.background.kind === 'custom') setAppearance({ ...appearance, background: { kind: 'none' } });
  }, [appearance, setAppearance, storeCustomImage]);

  return { appearance, setAppearance, customImage, setCustomImage, removeCustomImage };
}

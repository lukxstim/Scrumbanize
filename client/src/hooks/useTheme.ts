import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useStoredState } from './useStoredState';

export type ThemeSetting = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

/** Keep in sync with the inline script in client/index.html, which applies the theme before the first paint. */
export const THEME_KEY = 'scrumbanize.theme';

const isThemeSetting = (value: unknown): value is ThemeSetting =>
  value === 'light' || value === 'dark' || value === 'system';

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function subscribeToSystem(onChange: () => void) {
  const query = darkQuery();
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

export function resolveTheme(setting: ThemeSetting, systemPrefersDark: boolean): Theme {
  return setting === 'system' ? (systemPrefersDark ? 'dark' : 'light') : setting;
}

/** Sets the theme on <html>, cross-fading via the View Transitions API where available. */
function applyTheme(theme: Theme, animate: boolean) {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  const update = () => {
    root.dataset.theme = theme;
  };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (animate && !reducedMotion && 'startViewTransition' in document) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

/** The theme setting (light, dark or follow the system), remembered per browser; "system" on first visit. */
export function useTheme() {
  const [setting, setSetting] = useStoredState<ThemeSetting>(THEME_KEY, 'system', isThemeSetting);
  const systemPrefersDark = useSyncExternalStore(subscribeToSystem, () => darkQuery().matches);
  const theme = resolveTheme(setting, systemPrefersDark);

  // System changes apply directly; switches made by the user cross-fade (see setTheme).
  useEffect(() => {
    applyTheme(theme, false);
  }, [theme]);

  const setTheme = useCallback(
    (next: ThemeSetting) => {
      applyTheme(resolveTheme(next, darkQuery().matches), true);
      setSetting(next);
    },
    [setSetting],
  );

  return { setting, theme, setTheme };
}

import { useCallback, useEffect, useState } from 'react';

const CHANGE_EVENT = 'scrumbanize:stored-state';

function read<T>(key: string, initial: T, isValid: (value: unknown) => value is T): T {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    return isValid(stored) ? stored : initial;
  } catch {
    return initial;
  }
}

/**
 * State that is remembered in this browser's localStorage (as JSON). Storage can be unavailable or hold
 * something unexpected, so reading falls back to `initial` and writing failures are ignored.
 * All components using the same key stay in sync, e.g. the board and the command palette.
 */
export function useStoredState<T>(key: string, initial: T, isValid: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => read(key, initial, isValid));

  useEffect(() => {
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) setValue(read(key, initial, isValid));
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CHANGE_EVENT, onChange);
    // `initial` and `isValid` are treated as constants for a key.
  }, [key]);

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Not remembering it is fine.
      }
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
    },
    [key],
  );

  return [value, update] as const;
}

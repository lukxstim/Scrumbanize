import { useCallback, useState } from 'react';

/**
 * State that is remembered in this browser's localStorage (as JSON). Storage can be unavailable or hold
 * something unexpected, so reading falls back to `initial` and writing failures are ignored.
 */
export function useStoredState<T>(key: string, initial: T, isValid: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
      return isValid(stored) ? stored : initial;
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Not remembering it is fine.
      }
    },
    [key],
  );

  return [value, update] as const;
}

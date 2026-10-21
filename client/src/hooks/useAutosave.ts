import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

/**
 * Debounced saving: `schedule(value)` saves `value` once no newer value arrives for `delay` ms.
 * Saves run one after another, so an older save never overwrites a newer one.
 * Pending changes are saved immediately on unmount and when the tab is hidden.
 */
export function useAutosave<T>(save: (value: T) => Promise<void>, delay = 1000) {
  const [status, setStatus] = useState<SaveStatus>('saved');
  const saveRef = useRef(save);
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    saveRef.current = save;
  });

  const flush = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    const next = pending.current;
    if (!next) return queue.current;

    pending.current = null;
    setStatus('saving');
    queue.current = queue.current
      .then(() => saveRef.current(next.value))
      .then(
        () => {
          if (!pending.current) setStatus('saved');
        },
        () => {
          // Keep the failed value so a retry (or the next edit) saves it.
          pending.current ??= next;
          setStatus('error');
        },
      );
    return queue.current;
  }, []);

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value };
      setStatus('pending');
      clearTimeout(timer.current);
      timer.current = setTimeout(flush, delay);
    },
    [flush, delay],
  );

  /** Drops changes that have not been sent yet, e.g. before deleting or when taking over a version from elsewhere. */
  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    pending.current = null;
    setStatus((current) => (current === 'saving' ? current : 'saved'));
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void flush();
    };
  }, [flush]);

  useEffect(() => {
    if (status === 'saved') return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [status]);

  return { status, schedule, flush, cancel };
}

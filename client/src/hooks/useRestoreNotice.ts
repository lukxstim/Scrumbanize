import { useEffect, useRef } from 'react';
import { metaApi } from '../utils/api';
import { useRealtimeSignal } from './useRealtime';
import { useToast } from './useToast';

const CHECK_INTERVAL_MS = 60_000;

/**
 * After a backup was restored (in this or another window), the data this window shows is outdated: it asks to
 * reload. The live connection tells right away (US-24); checked also when the window regains focus and once a
 * minute. The window doing the restore reloads anyway.
 */
export function useRestoreNotice(): void {
  const toast = useToast();
  const checkRef = useRef<() => Promise<void>>(undefined);
  useRealtimeSignal((signal) => {
    if (signal.type === 'restored') void checkRef.current?.();
  });

  useEffect(() => {
    let known: string | null | undefined;
    let notified = false;

    async function check() {
      if (notified) return;
      try {
        const { restoredAt } = await metaApi.get();
        if (known === undefined) known = restoredAt;
        else if (restoredAt !== known) {
          notified = true;
          toast({
            message: 'Daten wurden wiederhergestellt, bitte neu laden.',
            tone: 'info',
            duration: 24 * 60 * 60 * 1000,
            action: { label: 'Neu laden', onClick: () => window.location.reload() },
          });
        }
      } catch {
        // Offline for a moment: the next check will tell.
      }
    }

    checkRef.current = check;
    void check();
    const timer = setInterval(() => void check(), CHECK_INTERVAL_MS);
    const onFocus = () => void check();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [toast]);
}

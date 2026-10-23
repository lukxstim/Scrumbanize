import { useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { flushPendingSaves } from '../hooks/useAutosave';
import { useToast } from '../hooks/useToast';
import { currentServiceWorkerEnvironment, shouldRegisterServiceWorker, UPDATE_CHECK_INTERVAL_MS } from '../utils/serviceWorker';

/** Registered once per page, also when StrictMode runs the effect twice. */
let registered = false;

/**
 * Registers the service worker of the installable web app (US-25) and offers a new version in a toast. It takes
 * over only on request, after every open editor has saved, so nothing typed gets lost in the reload.
 */
export default function UpdatePrompt() {
  const toast = useToast();

  useEffect(() => {
    const env = currentServiceWorkerEnvironment();
    if (env.desktop && env.supported) {
      // The desktop app updates with itself; a worker left over from elsewhere would serve an old page.
      void navigator.serviceWorker.getRegistrations().then((all) => all.forEach((registration) => void registration.unregister()));
    }
    if (registered || !shouldRegisterServiceWorker(env)) return;
    registered = true;

    const offerUpdate = () =>
      toast({
        message: 'Eine neue Version von Scrumbanize ist da.',
        tone: 'info',
        duration: Infinity,
        action: {
          label: 'Neu laden',
          onClick: async () => {
            if (!(await flushPendingSaves())) {
              toast({ message: 'Nicht alle Änderungen konnten gespeichert werden. Neu laden erst danach.', tone: 'error' });
              offerUpdate();
              return;
            }
            await updateServiceWorker(true);
          },
        },
      });

    const updateServiceWorker = registerSW({
      onNeedRefresh: offerUpdate,
      onRegisteredSW(_url, registration) {
        if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS);
      },
    });
  }, [toast]);

  return null;
}

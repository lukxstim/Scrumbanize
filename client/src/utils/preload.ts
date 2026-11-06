/**
 * Parts of the app loaded on demand, fetched in the background once the app is idle after starting (US-29), so the
 * first note, the statistics or the graph open without a pause. Pass the most used first; with "save data" switched
 * on, nothing is fetched ahead. Together with lazyWithPreload, a preloaded part also renders without the 300 ms React
 * waits before revealing a lazy component the first time.
 */
let started = false;

// Older Safari has no requestIdleCallback: a short delay instead.
const idle = (run: () => void) => {
  if (typeof globalThis.requestIdleCallback === 'function') globalThis.requestIdleCallback(run, { timeout: 3000 });
  else setTimeout(run, 1500);
};

export function preloadInBackground(loads: (() => Promise<unknown>)[]): void {
  if (started) return;
  started = true;
  const connection = (globalThis.navigator as (Navigator & { connection?: { saveData?: boolean } }) | undefined)?.connection;
  if (connection?.saveData) return;
  // One after another, each when the page has nothing else to do, so it never competes with what the user does.
  const next = (index: number) => {
    const load = loads[index];
    if (!load) return;
    idle(() => {
      load()
        .catch(() => undefined)
        .finally(() => next(index + 1));
    });
  };
  next(0);
}

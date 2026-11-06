/**
 * The last page shown before the settings (path and query), so the settings can lead back there: their back button,
 * Escape and a second click on the gear. Kept for this tab only; after a reload the settings lead to the notes.
 */
let last: string | null = null;

export const rememberPage = (path: string): void => {
  last = path;
};

/** Where to go when leaving the settings of `projectId`: the page before, or else its notes. */
export const pageBeforeSettings = (fallback: string): string => last ?? fallback;

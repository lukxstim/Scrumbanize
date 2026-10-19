/**
 * The two areas of the app (US-22): projects (notes, board, calendar, statistics) and Wissen (notebooks). The header
 * switches between them and comes back to where the user was in the other area.
 */
export type Area = 'projects' | 'knowledge';

const key = (area: Area) => `scrumbanize.lastPath.${area}`;

/** Remembers the page last shown in an area; storage can be unavailable (private mode), then nothing is kept. */
export function rememberAreaPath(area: Area, path: string): void {
  try {
    localStorage.setItem(key(area), path);
  } catch {
    // The switch then opens the area's start.
  }
}

/** The page last shown in an area in this browser, if any. */
export function lastAreaPath(area: Area): string | null {
  try {
    const path = localStorage.getItem(key(area));
    return path?.startsWith('/') ? path : null;
  } catch {
    return null;
  }
}

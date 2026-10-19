import type { Project } from '../types/project';
import { KNOWLEDGE_PATH } from './paths';

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

const PROJECT_PAGE = /^\/p\/(\d+)(?:[/?]|$)/;
const KNOWLEDGE_PAGE = new RegExp(`^${KNOWLEDGE_PATH}(?:[/?]|$)`);

/**
 * Where the area switch leads: the area's last page if it still belongs to the area – the project or notebook may
 * have been deleted since – else the area's start ("/" opens the last project, Wissen its "Alle Notizen").
 */
export function areaTarget(area: Area, last: string | null, projects: Pick<Project, 'id' | 'kind'>[]): string {
  const start = area === 'projects' ? '/' : KNOWLEDGE_PATH;
  if (!last) return start;
  const id = PROJECT_PAGE.exec(last)?.[1];
  if (id === undefined) return area === 'knowledge' && KNOWLEDGE_PAGE.test(last) ? last : start;
  const kind = area === 'projects' ? 'project' : 'notebook';
  return projects.some((p) => p.id === Number(id) && p.kind === kind) ? last : start;
}

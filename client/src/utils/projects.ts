import type { Project, ProjectColor, ProjectKind } from '../types/project';

/** The preset colors in picker order, with German labels and Tailwind classes for the color dot. */
export const PROJECT_COLORS: { value: ProjectColor; label: string; dot: string }[] = [
  { value: 'slate', label: 'Grau', dot: 'bg-slate-500' },
  { value: 'red', label: 'Rot', dot: 'bg-red-500' },
  { value: 'amber', label: 'Gelb', dot: 'bg-amber-500' },
  { value: 'emerald', label: 'Grün', dot: 'bg-emerald-500' },
  { value: 'sky', label: 'Hellblau', dot: 'bg-sky-500' },
  { value: 'indigo', label: 'Indigo', dot: 'bg-indigo-500' },
  { value: 'violet', label: 'Violett', dot: 'bg-violet-500' },
  { value: 'pink', label: 'Pink', dot: 'bg-pink-500' },
];

export function colorDot(color: ProjectColor): string {
  return PROJECT_COLORS.find((c) => c.value === color)?.dot ?? 'bg-slate-500';
}

/** Alphabetical like the server: case-insensitive, umlauts sorted as in German. */
export function sortProjects(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }) || a.id - b.id);
}

/** Projects or notebooks (US-22) only, in the given order. */
export function ofKind(projects: Project[], kind: ProjectKind): Project[] {
  return projects.filter((p) => p.kind === kind);
}

/** Since US-26 everything is a notebook; a project is one with its board switched on (board, calendar, statistics). */
export function hasBoard(project: Pick<Project, 'kind'>): boolean {
  return project.kind === 'project';
}

/** "1 Notiz", "3 Notizen" */
export function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

const LAST_PROJECT_KEY = 'scrumbanize.lastProjectId';

/** The project opened last in this browser; storage can be unavailable (private mode), so errors are ignored. */
export function getLastProjectId(): number | null {
  try {
    const value = Number(localStorage.getItem(LAST_PROJECT_KEY));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function setLastProjectId(id: number): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, String(id));
  } catch {
    // Not remembering the project is fine.
  }
}

/**
 * The notebook to open when the URL names none: the last one used in this browser, else the sample project of the
 * first start (if it still exists), else the first with a board. `needsBoard`: for the board and the calendar, only
 * notebooks with a board (US-26).
 */
export function defaultProject(all: Project[], sampleProjectId: number | null = null, needsBoard = false): Project | undefined {
  const boards = all.filter(hasBoard);
  const candidates = needsBoard ? boards : all;
  const lastId = getLastProjectId();
  return candidates.find((p) => p.id === lastId) ?? candidates.find((p) => p.id === sampleProjectId) ?? boards[0] ?? candidates[0];
}

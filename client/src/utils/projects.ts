import type { Project, ProjectColor } from '../types/project';

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
 * The project to open when the URL names none: the last one used in this browser, else the sample project
 * of the first start (if it still exists), else the first.
 */
export function defaultProject(projects: Project[], sampleProjectId: number | null = null): Project | undefined {
  const lastId = getLastProjectId();
  return projects.find((p) => p.id === lastId) ?? projects.find((p) => p.id === sampleProjectId) ?? projects[0];
}

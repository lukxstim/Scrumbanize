import type { Folder, Note } from '../types/note';
import { PROJECT_COLORS } from './projects';

/**
 * The notebook view like OneNote (US-34): a notebook's folders are its sections, the notes in a section its pages.
 * Notes without folder form the section "Ohne Abschnitt", shown only while there are some. A section is `number`
 * (the folder's id) or null (without folder).
 */
export type SectionId = number | null;

/** Search parameter of the chosen section while no page is open: a folder id or `ohne`. */
export const SECTION_PARAM = 'abschnitt';
const WITHOUT_SECTION = 'ohne';

export const sectionParam = (section: SectionId) => (section === null ? WITHOUT_SECTION : String(section));

export type PageSort = 'manual' | 'updated' | 'created' | 'title';
export const PAGE_SORTS: { value: PageSort; label: string }[] = [
  { value: 'manual', label: 'Eigene Reihenfolge' },
  { value: 'updated', label: 'Zuletzt geändert' },
  { value: 'created', label: 'Zuletzt erstellt' },
  { value: 'title', label: 'Nach Titel' },
];
/** Like OneNote, pages keep the order they are dragged into; new ones join at the end. */
export const PAGE_SORT_KEY = 'scrumbanize.pageSort';
export const DEFAULT_PAGE_SORT: PageSort = 'manual';
export const isPageSort = (value: unknown): value is PageSort => PAGE_SORTS.some((s) => s.value === value);

// Grey is the color of "Ohne Abschnitt"; the sections take the others in turn.
const SECTION_COLORS = PROJECT_COLORS.filter((c) => c.value !== 'slate');

/** The color bar of a section, the same on every visit. */
export const sectionColor = (section: SectionId) =>
  section === null ? 'bg-slate-400' : (SECTION_COLORS[section % SECTION_COLORS.length]?.dot ?? 'bg-slate-400');

/** The pages of a section, sorted. */
export function pagesOf(notes: Note[], section: SectionId, sort: PageSort): Note[] {
  const pages = notes.filter((n) => n.folderId === section);
  const byTitle = (a: Note, b: Note) => (a.title || '￿').localeCompare(b.title || '￿', 'de', { sensitivity: 'base' });
  if (sort === 'title') return pages.sort(byTitle);
  // Pages put in order first; the others follow, oldest first, so a new page joins at the end.
  if (sort === 'manual')
    return pages.sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || a.createdAt.localeCompare(b.createdAt) || a.id - b.id);
  const key = sort === 'created' ? 'createdAt' : 'updatedAt';
  return pages.sort((a, b) => b[key].localeCompare(a[key]) || byTitle(a, b));
}

/** The order after moving page `id` to `index` among the others (US-34). */
export function movePage(ids: number[], id: number, index: number): number[] {
  const rest = ids.filter((other) => other !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}

/** Where a page dragged to height `y` goes: after every other page whose middle is above it. */
export const slotIndex = (y: number, otherMiddles: number[]) => otherMiddles.filter((middle) => middle < y).length;

/**
 * The section shown: the open page's; else the one in the address (if it still exists); else the first section, or
 * "Ohne Abschnitt" while there are pages without one or no sections at all.
 */
export function currentSection(param: string | null, openNote: Note | undefined, folders: Folder[], notes: Note[]): SectionId {
  if (openNote) return openNote.folderId;
  if (param === WITHOUT_SECTION) return null;
  const id = Number(param);
  if (param !== null && folders.some((f) => f.id === id)) return id;
  if (notes.some((n) => n.folderId === null)) return null;
  const first = [...folders].filter((f) => f.parentId === null).sort((a, b) => a.position - b.position)[0];
  return first?.id ?? null;
}

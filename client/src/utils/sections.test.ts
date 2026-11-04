import { describe, expect, it } from 'vitest';
import type { Folder, Note } from '../types/note';
import { currentSection, movePage, pagesOf, sectionColor, sectionParam, slotIndex } from './sections';

const note = (id: number, folderId: number | null, title: string, createdAt: string, updatedAt = createdAt, position: number | null = null): Note => ({
  id,
  projectId: 1,
  folderId,
  position,
  color: null,
  title,
  content: '',
  tags: [],
  tasks: [],
  attachments: [],
  createdAt,
  updatedAt,
});
const folder = (id: number, position: number, parentId: number | null = null): Folder => ({ id, projectId: 1, parentId, name: `F${id}`, position });

const notes = [
  note(1, 10, 'Banane', '2026-11-01', '2026-11-03'),
  note(2, 10, 'Apfel', '2026-11-02', '2026-11-02'),
  note(3, 10, '', '2026-11-03', '2026-11-01'),
  note(4, 20, 'Woanders', '2026-11-01'),
];

describe('pagesOf', () => {
  it('lists only the section’s own pages, sorted as chosen, untitled last by title', () => {
    expect(pagesOf(notes, 10, 'updated').map((n) => n.id)).toEqual([1, 2, 3]);
    expect(pagesOf(notes, 10, 'created').map((n) => n.id)).toEqual([3, 2, 1]);
    expect(pagesOf(notes, 10, 'title').map((n) => n.id)).toEqual([2, 1, 3]);
    expect(pagesOf(notes, null, 'title')).toEqual([]);
  });

  it('puts pages in their own order first, the others after them, oldest first', () => {
    const ordered = [note(1, 10, 'A', '2026-11-01', '2026-11-01', 1), note(2, 10, 'B', '2026-11-02', '2026-11-02', 0), note(3, 10, 'C', '2026-11-04'), note(4, 10, 'D', '2026-11-03')];
    expect(pagesOf(ordered, 10, 'manual').map((n) => n.id)).toEqual([2, 1, 4, 3]);
  });
});

describe('moving a page by dragging', () => {
  it('finds the slot under the pointer and moves the page there', () => {
    expect(slotIndex(5, [10, 30, 50])).toBe(0);
    expect(slotIndex(40, [10, 30, 50])).toBe(2);
    expect(slotIndex(99, [10, 30, 50])).toBe(3);
    expect(movePage([1, 2, 3, 4], 1, 2)).toEqual([2, 3, 1, 4]);
    expect(movePage([1, 2, 3, 4], 4, 0)).toEqual([4, 1, 2, 3]);
    expect(movePage([1, 2, 3], 2, 9)).toEqual([1, 3, 2]);
  });
});

describe('currentSection', () => {
  const folders = [folder(20, 1), folder(10, 0), folder(30, 0, 10)];

  it('follows the open page', () => {
    expect(currentSection('20', notes[0], folders, notes)).toBe(10);
  });

  it('takes the address, if the section still exists', () => {
    expect(currentSection('20', undefined, folders, notes)).toBe(20);
    expect(currentSection(sectionParam(null), undefined, folders, notes)).toBeNull();
    expect(currentSection('99', undefined, folders, notes)).toBe(10);
  });

  it('starts with the pages without section, else the first section', () => {
    expect(currentSection(null, undefined, folders, [...notes, note(5, null, 'Lose', '2026-11-01')])).toBeNull();
    expect(currentSection(null, undefined, folders, notes)).toBe(10);
    expect(currentSection(null, undefined, [], [])).toBeNull();
  });
});

describe('sectionColor', () => {
  it('is stable per section and grey without one', () => {
    expect(sectionColor(7)).toBe(sectionColor(7));
    expect(sectionColor(null)).toBe('bg-slate-400');
  });
});

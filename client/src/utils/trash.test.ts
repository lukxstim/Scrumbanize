import { describe, expect, it } from 'vitest';
import type { TrashItem } from '../types/trash';
import { filterTrash, restoredMessage, trashSummary, trashTitle } from './trash';

const item = (type: TrashItem['type'], id: number, title = `Item ${id}`): TrashItem => ({
  type,
  id,
  projectId: 1,
  projectName: 'Allgemein',
  projectColor: 'slate',
  role: 'owner',
  title,
  deletedAt: '2026-10-15T10:00:00.000Z',
});

describe('trash helpers', () => {
  const items = [item('note', 1), item('note', 2, '  '), item('task', 3), item('project', 4)];

  it('filters by type', () => {
    expect(filterTrash(items, 'all')).toHaveLength(4);
    expect(filterTrash(items, 'note').map((i) => i.id)).toEqual([1, 2]);
    expect(filterTrash(items, 'project').map((i) => i.id)).toEqual([4]);
  });

  it('names untitled notes', () => {
    expect(trashTitle(items[1]!)).toBe('Unbenannte Notiz');
    expect(trashTitle(items[2]!)).toBe('Item 3');
  });

  it('summarizes in German', () => {
    expect(trashSummary(items)).toBe('2 Notizen, 1 Task und 1 Projekt');
    expect(trashSummary([item('task', 1), item('task', 2)])).toBe('2 Tasks');
    expect(trashSummary([item('note', 1), item('project', 2), item('project', 3)])).toBe('1 Notiz und 2 Projekte');
    expect(trashSummary([])).toBe('');
  });

  it('says what was restored and where it is', () => {
    const project = { id: 5, name: 'Studium (2)', color: 'sky' as const, role: 'owner' as const, noteCount: 0, taskCount: 0, createdAt: '', updatedAt: '' };
    expect(restoredMessage({ type: 'project', item: project, renamedFrom: 'Studium' })).toEqual({
      message: 'Projekt „Studium“ als „Studium (2)“ wiederhergestellt – der Name war inzwischen vergeben.',
      link: '/p/5/notes',
    });
    expect(restoredMessage({ type: 'project', item: { ...project, name: 'Studium' } }).message).toBe('Projekt „Studium“ wiederhergestellt.');
  });
});

import { describe, expect, it } from 'vitest';
import type { ChangeEvent, RealtimeActor, RealtimeEvent, Viewer } from '../types/realtime';
import { goneMessage, namesOf, othersIn, planBoard, planNotes, remoteLabel, viewersOf } from './realtime';

const lukas: RealtimeActor = { id: 2, name: 'Lukas', avatarColor: 'indigo', avatarUrl: null };

const change = (event: ChangeEvent, actor: RealtimeActor | null = lukas): RealtimeEvent => ({
  ...event,
  projectId: 1,
  actor,
  originId: 'other-tab',
  at: '2026-10-20T10:00:00.000Z',
});

describe('remoteLabel', () => {
  it('names who did it, or nothing without login', () => {
    expect(remoteLabel('task.moved', lukas)).toBe('von Lukas verschoben');
    expect(remoteLabel('task.created', lukas)).toBe('von Lukas angelegt');
    expect(remoteLabel('task.moved', null)).toBeNull();
  });
});

describe('planBoard', () => {
  it('loads changed tasks once each and marks them with the latest change', () => {
    const plan = planBoard([
      change({ type: 'task.updated', taskId: 5 }),
      change({ type: 'task.moved', taskId: 5 }),
      change({ type: 'task.linked', taskIds: [5, 6] }),
      change({ type: 'attachment.changed', owner: 'note', ownerId: 9 }),
    ]);
    expect(plan.reload).toBe(false);
    expect(plan.refetch.sort()).toEqual([5, 6]);
    expect(plan.remove).toEqual([]);
    expect(plan.marks).toEqual(new Map([[5, 'von Lukas verknüpft'], [6, 'von Lukas verknüpft']]));
  });

  it('removes a deleted task instead of loading it, unless it came back', () => {
    expect(planBoard([change({ type: 'task.moved', taskId: 5 }), change({ type: 'task.deleted', taskId: 5 })])).toMatchObject({
      refetch: [],
      remove: [5],
    });
    expect(planBoard([change({ type: 'task.deleted', taskId: 5 }), change({ type: 'task.restored', taskId: 5 })])).toMatchObject({
      refetch: [5],
      remove: [],
    });
  });

  it('reloads the whole board for columns, lanes, labels and after a reconnect', () => {
    expect(planBoard([change({ type: 'board.changed', what: 'lanes' })]).reload).toBe(true);
    expect(planBoard([{ type: 'resync' }]).reload).toBe(true);
    expect(planBoard([change({ type: 'note.updated', noteId: 1 })])).toMatchObject({ reload: false, refetch: [], remove: [] });
  });
});

describe('planNotes', () => {
  it('loads changed notes and remembers who changed their text', () => {
    const plan = planNotes(
      [change({ type: 'note.updated', noteId: 3 }), change({ type: 'note.tasks', noteId: 4 }), change({ type: 'attachment.changed', owner: 'note', ownerId: 5 })],
      false,
    );
    expect(plan.refetch.sort()).toEqual([3, 4, 5]);
    expect(plan.edited).toEqual(new Map([[3, lukas]]));
    expect(plan.reload).toBe(false);
  });

  it('loads new notes in a project, but the whole list in "Alle Notizen"', () => {
    expect(planNotes([change({ type: 'note.created', noteId: 7 })], false)).toMatchObject({ reload: false, refetch: [7] });
    expect(planNotes([change({ type: 'note.created', noteId: 7 })], true).reload).toBe(true);
  });

  it('drops deleted notes and their pending text changes', () => {
    const plan = planNotes([change({ type: 'note.updated', noteId: 3 }), change({ type: 'note.deleted', noteId: 3 })], false);
    expect(plan).toMatchObject({ refetch: [], remove: [3] });
    expect(plan.edited.size).toBe(0);
  });

  it('reloads folders when they change, and everything after a reconnect or an import', () => {
    expect(planNotes([change({ type: 'folder.changed' })], false)).toMatchObject({ reload: false, folders: true });
    expect(planNotes([{ type: 'resync' }], false)).toMatchObject({ reload: true, folders: true });
    expect(planNotes([change({ type: 'notes.imported' })], true)).toMatchObject({ reload: true, folders: true });
  });
});

describe('presence (US-24)', () => {
  const anna: RealtimeActor = { id: 3, name: 'Anna', avatarColor: 'pink', avatarUrl: null };
  const me: RealtimeActor = { id: 1, name: 'Ich', avatarColor: 'sky', avatarUrl: null };
  const viewers: Viewer[] = [
    { user: anna, items: [{ type: 'task', id: 5 }] },
    { user: me, items: [{ type: 'task', id: 5 }] },
    { user: lukas, items: [{ type: 'note', id: 5 }] },
  ];

  it('leaves out the user, also in their other tabs', () => {
    expect(othersIn(viewers, me.id)).toEqual([anna, lukas]);
    expect(othersIn(undefined, me.id)).toEqual([]);
  });

  it('tells notes and tasks with the same id apart', () => {
    expect(viewersOf(viewers, { type: 'task', id: 5 }, me.id)).toEqual([anna]);
    expect(viewersOf(viewers, { type: 'note', id: 5 }, me.id)).toEqual([lukas]);
  });

  it('names a few people and counts the rest', () => {
    expect(namesOf([anna])).toBe('Anna');
    expect(namesOf([anna, lukas])).toBe('Anna und Lukas');
    expect(namesOf([anna, lukas, me, { ...me, id: 9 }], 2)).toBe('Anna, Lukas und 2 weitere');
    expect(namesOf([anna, lukas, me], 2)).toBe('Anna, Lukas und 1 weitere Person');
  });
});

describe('goneMessage', () => {
  it('names who deleted the open task or note', () => {
    expect(goneMessage([change({ type: 'task.deleted', taskId: 4 })], { type: 'task', id: 4 })).toBe('Dieser Task wurde von Lukas gelöscht.');
    expect(goneMessage([change({ type: 'note.purged', noteId: 4 }, null)], { type: 'note', id: 4 })).toBe(
      'Diese Notiz wurde in einem anderen Fenster gelöscht.',
    );
  });

  it('ignores other items and other changes', () => {
    expect(goneMessage([change({ type: 'task.deleted', taskId: 4 })], { type: 'note', id: 4 })).toBeNull();
    expect(goneMessage([change({ type: 'task.updated', taskId: 4 }), { type: 'resync' }], { type: 'task', id: 4 })).toBeNull();
  });
});

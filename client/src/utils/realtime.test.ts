import { describe, expect, it } from 'vitest';
import type { ChangeEvent, RealtimeActor, RealtimeEvent } from '../types/realtime';
import { planBoard, planNotes, remoteLabel } from './realtime';

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

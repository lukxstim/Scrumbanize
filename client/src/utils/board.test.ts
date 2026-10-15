import { describe, expect, it } from 'vitest';
import type { Task, TaskStatus } from '../types/task';
import { applyMove, groupByStatus, removeTask, replaceTask, wipState } from './board';

function task(id: number, status: TaskStatus, position: number): Task {
  return { id, title: `T${id}`, description: '', status, position, sourceNote: null, createdAt: '', updatedAt: '' };
}

const ids = (tasks: Task[]) => tasks.map((t) => t.id);

describe('groupByStatus', () => {
  it('groups by status and sorts by position', () => {
    const columns = groupByStatus([task(1, 'todo', 2), task(2, 'todo', 1), task(3, 'done', 5)]);
    expect(ids(columns.todo)).toEqual([2, 1]);
    expect(ids(columns.done)).toEqual([3]);
    expect(columns.backlog).toEqual([]);
  });
});

describe('applyMove', () => {
  const columns = groupByStatus([task(1, 'backlog', 1), task(2, 'backlog', 2), task(3, 'backlog', 3), task(4, 'todo', 1)]);

  it('reorders within a column', () => {
    expect(ids(applyMove(columns, 1, 'backlog', 2).backlog)).toEqual([2, 3, 1]);
    expect(ids(applyMove(columns, 3, 'backlog', 0).backlog)).toEqual([3, 1, 2]);
  });

  it('moves to another column and updates the status', () => {
    const next = applyMove(columns, 2, 'todo', 0);
    expect(ids(next.backlog)).toEqual([1, 3]);
    expect(ids(next.todo)).toEqual([2, 4]);
    expect(next.todo[0]!.status).toBe('todo');
  });

  it('clamps the index and does not mutate the input', () => {
    expect(ids(applyMove(columns, 1, 'todo', 99).todo)).toEqual([4, 1]);
    expect(ids(columns.backlog)).toEqual([1, 2, 3]);
  });

  it('ignores unknown tasks', () => {
    expect(applyMove(columns, 99, 'todo', 0)).toBe(columns);
  });
});

describe('replaceTask and removeTask', () => {
  const columns = groupByStatus([task(1, 'backlog', 1), task(2, 'backlog', 2)]);

  it('replaces a task in place', () => {
    const next = replaceTask(columns, { ...task(1, 'backlog', 1), title: 'new' });
    expect(next.backlog.map((t) => t.title)).toEqual(['new', 'T2']);
  });

  it('removes a task', () => {
    expect(ids(removeTask(columns, 1).backlog)).toEqual([2]);
  });
});

describe('wipState', () => {
  it('compares the count with the limit', () => {
    expect(wipState(5, null)).toBe('none');
    expect(wipState(2, 3)).toBe('ok');
    expect(wipState(3, 3)).toBe('at-limit');
    expect(wipState(4, 3)).toBe('over-limit');
  });
});

import { describe, expect, it } from 'vitest';
import type { BoardColumn, Task } from '../types/task';
import {
  addTask,
  applyMove,
  cellTasks,
  columnCount,
  groupByCell,
  laneCount,
  neighbours,
  placementOf,
  removeTask,
  reorder,
  replaceTask,
  wipState,
} from './board';

// Columns 10 and 20, lanes 1 and 2.
function task(id: number, columnId: number, laneId: number, position: number): Task {
  return {
    id,
    projectId: 1,
    columnId,
    laneId,
    title: `T${id}`,
    description: '',
    position,
    sourceNote: null,
    createdAt: '',
    updatedAt: '',
  };
}

const ids = (tasks: Task[]) => tasks.map((t) => t.id);

const cells = groupByCell([
  task(1, 10, 1, 2),
  task(2, 10, 1, 1),
  task(3, 10, 2, 1),
  task(4, 20, 1, 1),
]);

describe('groupByCell', () => {
  it('groups by column and lane and sorts by position', () => {
    expect(ids(cellTasks(cells, 10, 1))).toEqual([2, 1]);
    expect(ids(cellTasks(cells, 10, 2))).toEqual([3]);
    expect(cellTasks(cells, 20, 2)).toEqual([]);
  });
});

describe('applyMove', () => {
  it('reorders within a cell', () => {
    expect(ids(cellTasks(applyMove(cells, 2, 10, 1, 1), 10, 1))).toEqual([1, 2]);
  });

  it('moves to another column and lane, updating the task', () => {
    const next = applyMove(cells, 1, 20, 2, 0);
    expect(ids(cellTasks(next, 10, 1))).toEqual([2]);
    expect(cellTasks(next, 20, 2)).toEqual([expect.objectContaining({ id: 1, columnId: 20, laneId: 2 })]);
    expect(placementOf(next, 1)).toEqual({ columnId: 20, laneId: 2, index: 0 });
  });

  it('clamps the index, leaves the input alone and ignores unknown tasks', () => {
    expect(ids(cellTasks(applyMove(cells, 3, 10, 1, 99), 10, 1))).toEqual([2, 1, 3]);
    expect(ids(cellTasks(cells, 10, 1))).toEqual([2, 1]);
    expect(applyMove(cells, 99, 10, 1, 0)).toBe(cells);
  });
});

describe('replaceTask, removeTask and addTask', () => {
  it('replaces in place, removes and appends', () => {
    expect(cellTasks(replaceTask(cells, { ...task(1, 10, 1, 2), title: 'new' }), 10, 1).map((t) => t.title)).toEqual([
      'T2',
      'new',
    ]);
    expect(ids(cellTasks(removeTask(cells, 2), 10, 1))).toEqual([1]);
    expect(ids(cellTasks(addTask(cells, task(5, 20, 2, 1)), 20, 2))).toEqual([5]);
  });
});

describe('counts', () => {
  it('counts a column across lanes and a lane across columns', () => {
    expect(columnCount(cells, 10)).toBe(3);
    expect(columnCount(cells, 20)).toBe(1);
    expect(laneCount(cells, 1)).toBe(3);
    expect(laneCount(cells, 2)).toBe(1);
  });

  it('does not mix up ids that share digits', () => {
    const tricky = groupByCell([task(1, 1, 11, 1), task(2, 11, 1, 1)]);
    expect(columnCount(tricky, 1)).toBe(1);
    expect(laneCount(tricky, 1)).toBe(1);
  });
});

describe('reorder and neighbours', () => {
  const columns: BoardColumn[] = [10, 20, 30].map((id, i) => ({ id, name: `C${id}`, position: i + 1, wipLimit: null }));

  it('moves an item to an index among the others', () => {
    expect(reorder(columns, 30, 0).map((c) => c.id)).toEqual([30, 10, 20]);
    expect(reorder(columns, 10, 5).map((c) => c.id)).toEqual([20, 30, 10]);
  });

  it('finds the columns left and right', () => {
    expect(neighbours(columns, 10)).toEqual({ previous: undefined, next: columns[1] });
    expect(neighbours(columns, 30)).toEqual({ previous: columns[1], next: undefined });
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

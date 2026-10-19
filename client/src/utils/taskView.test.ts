import { describe, expect, it } from 'vitest';
import type { Task } from '../types/task';
import { groupByCell } from './board';
import { priorityRank } from './priority';
import { applyView, DEFAULT_VIEW, dropIndexInCell, isTaskView, matchesView, sortTasks } from './taskView';

let nextId = 1;
const task = (fields: Partial<Task>): Task => ({
  id: nextId++,
  projectId: 1,
  columnId: 1,
  laneId: 1,
  title: 'T',
  description: '',
  position: nextId,
  sourceNote: null,
  linkedNotes: [],
  priority: null,
  links: [],
  attachments: [],
  labels: [],
  startDate: null,
  dueDate: null,
  createdAt: '',
  updatedAt: '',
  ...fields,
});

const today = '2026-10-15'; // Thursday

describe('priority', () => {
  it('ranks urgent first and no priority last', () => {
    expect(['low', null, 'urgent', 'medium', 'high'].map((p) => priorityRank(p as Task['priority']))).toEqual([3, 4, 0, 2, 1]);
  });
});

describe('task view', () => {
  it('sorts by priority, then due date, then manual order', () => {
    const a = task({ title: 'a', priority: 'low' });
    const b = task({ title: 'b', priority: 'urgent', dueDate: '2026-10-20' });
    const c = task({ title: 'c', priority: 'urgent', dueDate: '2026-10-16' });
    const d = task({ title: 'd' });
    const e = task({ title: 'e', priority: 'urgent', dueDate: '2026-10-16' });
    expect(sortTasks([a, b, c, d, e], 'priority').map((t) => t.title)).toEqual(['c', 'e', 'b', 'a', 'd']);
  });

  it('sorts by due date with unscheduled tasks last', () => {
    const a = task({ title: 'a' });
    const b = task({ title: 'b', dueDate: '2026-11-01' });
    const c = task({ title: 'c', dueDate: '2026-10-16', priority: 'low' });
    const d = task({ title: 'd', dueDate: '2026-10-16', priority: 'high' });
    expect(sortTasks([a, b, c, d], 'due').map((t) => t.title)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('filters by priority, including "no priority"', () => {
    const view = { ...DEFAULT_VIEW, priorities: ['urgent' as const, 'none' as const] };
    expect(matchesView(task({ priority: 'urgent' }), view, today, false)).toBe(true);
    expect(matchesView(task({}), view, today, false)).toBe(true);
    expect(matchesView(task({ priority: 'low' }), view, today, false)).toBe(false);
  });

  it('filters by due date; done tasks are never overdue', () => {
    const due = (dueDate: string | null, filter: (typeof DEFAULT_VIEW)['due'], done = false) =>
      matchesView(task({ dueDate }), { ...DEFAULT_VIEW, due: filter }, today, done);
    expect(due('2026-10-14', 'overdue')).toBe(true);
    expect(due('2026-10-14', 'overdue', true)).toBe(false);
    expect(due('2026-10-15', 'overdue')).toBe(false);
    expect(due('2026-10-15', 'today')).toBe(true);
    expect(due('2026-10-12', 'week')).toBe(true);
    expect(due('2026-10-18', 'week')).toBe(true);
    expect(due('2026-10-19', 'week')).toBe(false);
    expect(due(null, 'none')).toBe(true);
    expect(due(null, 'scheduled')).toBe(false);
  });

  it('applies the view per cell and leaves cells untouched without one', () => {
    const cells = groupByCell([
      task({ title: 'late', columnId: 1, dueDate: '2026-10-01' }),
      task({ title: 'done-late', columnId: 2, dueDate: '2026-10-01' }),
      task({ title: 'later', columnId: 1, dueDate: '2026-12-01' }),
    ]);
    expect(applyView(cells, DEFAULT_VIEW, today, 2)).toBe(cells);
    const shown = applyView(cells, { ...DEFAULT_VIEW, due: 'overdue' }, today, 2);
    expect(Object.values(shown).flat().map((t) => t.title)).toEqual(['late']);
  });

  it('validates stored views', () => {
    expect(isTaskView(DEFAULT_VIEW)).toBe(true);
    expect(isTaskView({ sort: 'priority', priorities: ['high', 'none'], due: 'week' })).toBe(true);
    expect(isTaskView({ sort: 'random', priorities: [], due: 'all' })).toBe(false);
    expect(isTaskView({ sort: 'manual', priorities: ['p1'], due: 'all' })).toBe(false);
    expect(isTaskView(null)).toBe(false);
  });
});

describe('dropIndexInCell', () => {
  const a = task({ title: 'a', columnId: 1, priority: 'low' });
  const b = task({ title: 'b', columnId: 1, priority: 'urgent' });
  const c = task({ title: 'c', columnId: 1, priority: 'low' });
  const d = task({ title: 'd', columnId: 2 });
  const cells = groupByCell([a, b, c, d]);

  it('maps a position among filtered tasks to one among all tasks', () => {
    const view = { ...DEFAULT_VIEW, priorities: ['low' as const] };
    const shown = applyView(cells, view, today, 2); // column 1 shows a, c
    // Dropping d before c (index 1 of the shown a, c) puts it at index 2 of a, b, c.
    expect(dropIndexInCell(cells, shown, view, d.id, { columnId: 1, laneId: 1, index: 1 })).toBe(2);
    expect(dropIndexInCell(cells, shown, view, d.id, { columnId: 1, laneId: 1, index: 2 })).toBe(3);
    expect(dropIndexInCell(cells, shown, view, d.id, { columnId: 1, laneId: 1, index: 0 })).toBe(0);
  });

  it('only changes cells while sorted', () => {
    const view = { ...DEFAULT_VIEW, sort: 'priority' as const };
    const shown = applyView(cells, view, today, 2);
    expect(dropIndexInCell(cells, shown, view, a.id, { columnId: 1, laneId: 1, index: 2 })).toBeUndefined();
    expect(dropIndexInCell(cells, shown, view, a.id, { columnId: 2, laneId: 1, index: 0 })).toBe(1);
  });
});

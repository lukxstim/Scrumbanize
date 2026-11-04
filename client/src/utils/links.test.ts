import { describe, expect, it } from 'vitest';
import type { BoardColumn, Task, TaskLink } from '../types/task';
import { groupByCell } from './board';
import { dropLinksTo, groupLinks, linkCandidates, linkSummary, noteLinkSummary, openBlockers, refreshLinkedTask } from './links';

const task = (id: number, fields: Partial<Task> = {}): Task => ({
  id,
  projectId: 1,
  columnId: 1,
  laneId: 1,
  title: `T${id}`,
  description: '',
  position: id,
  parentId: null,
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
const link = (id: number, kind: TaskLink['kind'], other: number, done = false): TaskLink => ({
  id,
  kind,
  task: { id: other, title: `T${other}`, columnId: done ? 3 : 1, columnName: done ? 'Done' : 'Backlog', done },
});
const columns: BoardColumn[] = [
  { id: 1, name: 'Backlog', position: 1, wipLimit: null, width: null },
  { id: 2, name: 'Review', position: 2, wipLimit: null, width: null },
  { id: 3, name: 'Done', position: 3, wipLimit: null, width: null },
];

describe('task links', () => {
  it('groups links, blockers first', () => {
    const groups = groupLinks([link(1, 'relates', 5), link(2, 'blocks', 6), link(3, 'blocked_by', 7), link(4, 'relates', 8)]);
    expect(groups.map((g) => [g.kind, g.links.map((l) => l.task.id)])).toEqual([
      ['blocked_by', [7]],
      ['blocks', [6]],
      ['relates', [5, 8]],
    ]);
  });

  it('counts only blockers that are not done', () => {
    const t = task(1, { links: [link(1, 'blocked_by', 2), link(2, 'blocked_by', 3, true), link(3, 'blocks', 4)] });
    expect(openBlockers(t).map((l) => l.task.id)).toEqual([2]);
    expect(linkSummary(t)).toBe('Wird blockiert von #2 T2\nWird blockiert von #3 T3 (erledigt)\nBlockiert #4 T4');
  });

  it('updates the other side after a task moved or was renamed, and drops links to trashed tasks', () => {
    const a = task(1, { links: [link(1, 'blocked_by', 2)] });
    const b = task(2, { links: [link(1, 'blocks', 1)] });
    const cells = groupByCell([a, b]);

    const moved = refreshLinkedTask(cells, { ...b, title: 'Neu', columnId: 3 }, columns);
    expect(Object.values(moved).flat().find((t) => t.id === 1)!.links[0]!.task).toEqual({
      id: 2,
      title: 'Neu',
      columnId: 3,
      columnName: 'Done',
      done: true,
    });
    expect(refreshLinkedTask(cells, task(9), columns)).toBe(cells);

    const dropped = dropLinksTo(cells, 2);
    expect(Object.values(dropped).flat().find((t) => t.id === 1)!.links).toEqual([]);
  });

  it('offers the other tasks that are not linked yet, newest first', () => {
    const a = task(1, { links: [link(1, 'relates', 2)] });
    expect(linkCandidates(a, [a, task(2), task(3), task(4)]).map((t) => t.id)).toEqual([4, 3]);
  });
});

describe('noteLinkSummary', () => {
  it('lists the linked notes, naming the notebook or project of those from elsewhere', () => {
    const t = task(1, {
      linkedNotes: [
        { id: 4, title: 'Carbonara', projectId: 3, projectName: 'Rezepte', projectKind: 'notebook' },
        { id: 5, title: '', projectId: 1, projectName: 'Allgemein', projectKind: 'project' },
        { id: 6, title: 'Plan', projectId: 2, projectName: 'Privat', projectKind: 'project' },
      ],
    });
    expect(noteLinkSummary(t, 'Unbenannt').split('\n')).toEqual(['Carbonara (Notizbuch „Rezepte“)', 'Unbenannt', 'Plan (Projekt „Privat“)']);
  });
});

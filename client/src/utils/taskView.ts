import { TASK_PRIORITIES, type Task, type TaskPriority } from '../types/task';
import { daysBetween, startOfWeek, addDays } from './dates';
import { priorityRank } from './priority';
import { cellTasks, findTask, type Cells } from './board';

export type TaskSort = 'manual' | 'priority' | 'due';
export type DueFilter = 'all' | 'overdue' | 'today' | 'week' | 'scheduled' | 'none';
export type PriorityFilter = TaskPriority | 'none';
/** A label id, or tasks without any label. */
export type LabelFilter = number | 'none';

/** How the board shows its tasks. Display only: it never changes the stored order. */
export interface TaskView {
  sort: TaskSort;
  /** Empty means all priorities. */
  priorities: PriorityFilter[];
  due: DueFilter;
  /** Tasks with at least one of these; empty means all. Optional: views stored before labels existed lack it. */
  labels?: LabelFilter[];
  /** US-28: leaves out the tasks of the last (done) column. Optional, like the next one, for views stored before. */
  hideDone?: boolean;
  /** US-28: subtasks among the other tasks, or in a row of their own below each lane. */
  subtasks?: SubtaskLayout;
}

export type SubtaskLayout = 'inline' | 'row';

export const DEFAULT_VIEW: TaskView = { sort: 'manual', priorities: [], due: 'all', labels: [], hideDone: false, subtasks: 'inline' };

export const SUBTASK_LAYOUT_LABELS: Record<SubtaskLayout, string> = { inline: 'Bei den Tasks', row: 'Eigene Zeile' };

export const SORT_LABELS: Record<TaskSort, string> = { manual: 'Manuell', priority: 'Priorität', due: 'Fälligkeit' };

export const DUE_FILTER_LABELS: Record<DueFilter, string> = {
  all: 'Alle Termine',
  overdue: 'Überfällig',
  today: 'Heute fällig',
  week: 'Diese Woche fällig',
  scheduled: 'Mit Fälligkeit',
  none: 'Ohne Fälligkeit',
};

export function isTaskView(value: unknown): value is TaskView {
  if (typeof value !== 'object' || value === null) return false;
  const view = value as Record<string, unknown>;
  return (
    typeof view.sort === 'string' &&
    view.sort in SORT_LABELS &&
    typeof view.due === 'string' &&
    view.due in DUE_FILTER_LABELS &&
    Array.isArray(view.priorities) &&
    view.priorities.every((p) => p === 'none' || (TASK_PRIORITIES as readonly unknown[]).includes(p)) &&
    (view.labels === undefined || (Array.isArray(view.labels) && view.labels.every((l) => l === 'none' || Number.isInteger(l)))) &&
    (view.hideDone === undefined || typeof view.hideDone === 'boolean') &&
    (view.subtasks === undefined || (typeof view.subtasks === 'string' && view.subtasks in SUBTASK_LAYOUT_LABELS))
  );
}

export const isFiltered = (view: TaskView) =>
  view.priorities.length > 0 || view.due !== 'all' || (view.labels?.length ?? 0) > 0 || view.hideDone === true;

/** Every task on the board, by id. */
export const boardTaskIds = (cells: Cells): Set<number> => new Set(Object.values(cells).flatMap((tasks) => tasks.map((t) => t.id)));

/** A subtask whose parent is on the board (US-28); one whose parent is in the trash counts as an ordinary task. */
export const isSubtaskOn = (task: Task, ids: Set<number>): boolean => task.parentId !== null && ids.has(task.parentId);

/** Whether a task passes the view's filters. `done` tasks are never overdue. */
export function matchesView(task: Task, view: TaskView, today: string, done: boolean): boolean {
  if (view.priorities.length > 0 && !view.priorities.includes(task.priority ?? 'none')) return false;
  const labels = view.labels ?? [];
  if (labels.length > 0) {
    const own = task.labels.length === 0 ? ['none' as const] : task.labels.map((l) => l.id);
    if (!own.some((l) => labels.includes(l))) return false;
  }
  const due = task.dueDate;
  switch (view.due) {
    case 'all':
      return true;
    case 'none':
      return due === null;
    case 'scheduled':
      return due !== null;
    case 'overdue':
      return due !== null && !done && due < today;
    case 'today':
      return due === today;
    case 'week': {
      const monday = startOfWeek(today);
      return due !== null && due >= monday && due <= addDays(monday, 6);
    }
  }
}

function compareDue(a: Task, b: Task): number {
  if (a.dueDate === b.dueDate) return 0;
  if (a.dueDate === null) return 1;
  if (b.dueDate === null) return -1;
  return daysBetween(b.dueDate, a.dueDate);
}

const compareManual = (a: Task, b: Task) => a.position - b.position || a.id - b.id;
const comparePriority = (a: Task, b: Task) => priorityRank(a.priority) - priorityRank(b.priority);

/** Sorted copy; ties fall back to the next criterion and finally to the manual order. */
export function sortTasks(tasks: Task[], sort: TaskSort): Task[] {
  if (sort === 'manual') return tasks;
  const compare =
    sort === 'priority'
      ? (a: Task, b: Task) => comparePriority(a, b) || compareDue(a, b) || compareManual(a, b)
      : (a: Task, b: Task) => compareDue(a, b) || comparePriority(a, b) || compareManual(a, b);
  return [...tasks].sort(compare);
}

/**
 * The cells as the view shows them: filtered and sorted. `doneColumnId` is the rightmost column. With subtasks in a row
 * of their own (US-28), each cell lists its ordinary tasks first and its subtasks after them, so a drop position in the
 * subtask row maps to the same cell.
 */
export function applyView(cells: Cells, view: TaskView, today: string, doneColumnId: number | undefined): Cells {
  const rows = view.subtasks === 'row';
  if (view.sort === 'manual' && !isFiltered(view) && !rows) return cells;
  const ids = rows ? boardTaskIds(cells) : new Set<number>();
  const done = (task: Task) => task.columnId === doneColumnId;
  const shown: Cells = {};
  for (const [key, tasks] of Object.entries(cells)) {
    const filtered = tasks.filter((task) => !(view.hideDone && done(task)) && matchesView(task, view, today, done(task)));
    const sorted = sortTasks(filtered, view.sort);
    shown[key] = rows ? [...sorted.filter((t) => !isSubtaskOn(t, ids)), ...sorted.filter((t) => isSubtaskOn(t, ids))] : sorted;
  }
  return shown;
}

/** How far a task with subtasks is (US-28), and which task a subtask belongs to, for the cards. */
export interface TaskFamily {
  parent?: { id: number; title: string };
  /** Subtasks on the board, and how many of them are done (in the last column). */
  subtasks?: { total: number; done: number };
}

export function taskFamilies(cells: Cells, doneColumnId: number | undefined): Map<number, TaskFamily> {
  const all = Object.values(cells).flat();
  const byId = new Map(all.map((t) => [t.id, t]));
  const families = new Map<number, TaskFamily>();
  for (const task of all) {
    const parent = task.parentId === null ? undefined : byId.get(task.parentId);
    if (!parent) continue;
    families.set(task.id, { ...families.get(task.id), parent: { id: parent.id, title: parent.title } });
    const own = families.get(parent.id) ?? {};
    const counts = own.subtasks ?? { total: 0, done: 0 };
    families.set(parent.id, {
      ...own,
      subtasks: { total: counts.total + 1, done: counts.done + (task.columnId === doneColumnId ? 1 : 0) },
    });
  }
  return families;
}

/**
 * Turns a drop position on the shown board into an index for the move API (which counts all other tasks of
 * the cell). With a filter, the task lands before the shown task it was dropped on. While a sort is active,
 * the order within a cell is the sort's, so a drop into the own cell changes nothing (undefined) and other
 * cells get the task at their end.
 */
export function dropIndexInCell(
  cells: Cells,
  shown: Cells,
  view: TaskView,
  id: number,
  target: { columnId: number; laneId: number; index: number },
): number | undefined {
  const others = cellTasks(cells, target.columnId, target.laneId).filter((t) => t.id !== id);
  if (view.sort !== 'manual') {
    const task = findTask(cells, id);
    return task && task.columnId === target.columnId && task.laneId === target.laneId ? undefined : others.length;
  }
  const visible = cellTasks(shown, target.columnId, target.laneId).filter((t) => t.id !== id);
  const before = visible[target.index];
  if (before) return others.findIndex((t) => t.id === before.id);
  const last = visible.at(-1);
  return last ? others.findIndex((t) => t.id === last.id) + 1 : others.length;
}

import type { Task, TaskStatus } from '../types/task';
import { TASK_STATUSES } from './taskStatus';

/** Tasks per column, each in board order. */
export type Columns = Record<TaskStatus, Task[]>;

export function emptyColumns(): Columns {
  return Object.fromEntries(TASK_STATUSES.map((status) => [status, []])) as unknown as Columns;
}

export function groupByStatus(tasks: Task[]): Columns {
  const columns = emptyColumns();
  for (const task of tasks) columns[task.status].push(task);
  for (const status of TASK_STATUSES) columns[status].sort((a, b) => a.position - b.position || a.id - b.id);
  return columns;
}

export function findTask(columns: Columns, id: number): Task | undefined {
  for (const status of TASK_STATUSES) {
    const task = columns[status].find((t) => t.id === id);
    if (task) return task;
  }
  return undefined;
}

/**
 * Moves a task to `index` in column `status`, where `index` counts the other tasks of that column
 * (the same convention as the move API). Returns new columns; unknown ids leave them unchanged.
 */
export function applyMove(columns: Columns, id: number, status: TaskStatus, index: number): Columns {
  const task = findTask(columns, id);
  if (!task) return columns;

  const next = { ...columns, [task.status]: columns[task.status].filter((t) => t.id !== id) };
  const target = [...next[status]];
  target.splice(Math.min(index, target.length), 0, task.status === status ? task : { ...task, status });
  next[status] = target;
  return next;
}

/** Swaps in a newer version of a task (e.g. a server response), keeping the board order. */
export function replaceTask(columns: Columns, task: Task): Columns {
  const next = { ...columns };
  for (const status of TASK_STATUSES) {
    if (next[status].some((t) => t.id === task.id)) {
      next[status] = next[status].map((t) => (t.id === task.id ? task : t));
    }
  }
  return next;
}

export function removeTask(columns: Columns, id: number): Columns {
  const task = findTask(columns, id);
  return task ? { ...columns, [task.status]: columns[task.status].filter((t) => t.id !== id) } : columns;
}

export type WipState = 'none' | 'ok' | 'at-limit' | 'over-limit';

export function wipState(count: number, limit: number | null): WipState {
  if (limit === null) return 'none';
  if (count > limit) return 'over-limit';
  return count === limit ? 'at-limit' : 'ok';
}

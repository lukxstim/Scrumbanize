import type { BoardColumn, Task } from '../types/task';

/** Tasks per cell (column × lane), each in board order. Keyed by `cellKey`. */
export type Cells = Record<string, Task[]>;

export const cellKey = (columnId: number, laneId: number) => `${columnId}:${laneId}`;

export function groupByCell(tasks: Task[]): Cells {
  const cells: Cells = {};
  for (const task of tasks) (cells[cellKey(task.columnId, task.laneId)] ??= []).push(task);
  for (const list of Object.values(cells)) list.sort((a, b) => a.position - b.position || a.id - b.id);
  return cells;
}

export function cellTasks(cells: Cells, columnId: number, laneId: number): Task[] {
  return cells[cellKey(columnId, laneId)] ?? [];
}

export function findTask(cells: Cells, id: number): Task | undefined {
  for (const list of Object.values(cells)) {
    const task = list.find((t) => t.id === id);
    if (task) return task;
  }
  return undefined;
}

/** Where a task sits: its cell and its index there. */
export function placementOf(cells: Cells, id: number): { columnId: number; laneId: number; index: number } | undefined {
  const task = findTask(cells, id);
  if (!task) return undefined;
  const index = cellTasks(cells, task.columnId, task.laneId).findIndex((t) => t.id === id);
  return { columnId: task.columnId, laneId: task.laneId, index };
}

/**
 * Moves a task to `index` in the cell (columnId, laneId), where `index` counts the other tasks of that cell
 * (the same convention as the move API). Returns new cells; unknown ids leave them unchanged.
 */
export function applyMove(cells: Cells, id: number, columnId: number, laneId: number, index: number): Cells {
  const task = findTask(cells, id);
  if (!task) return cells;

  const from = cellKey(task.columnId, task.laneId);
  const to = cellKey(columnId, laneId);
  const next = { ...cells, [from]: cells[from]!.filter((t) => t.id !== id) };
  const target = [...(next[to] ?? [])];
  target.splice(Math.min(index, target.length), 0, from === to ? task : { ...task, columnId, laneId });
  next[to] = target;
  return next;
}

/** Swaps in a newer version of a task (e.g. a server response), keeping the board order. */
export function replaceTask(cells: Cells, task: Task): Cells {
  const next = { ...cells };
  for (const [key, list] of Object.entries(next)) {
    if (list.some((t) => t.id === task.id)) next[key] = list.map((t) => (t.id === task.id ? task : t));
  }
  return next;
}

export function removeTask(cells: Cells, id: number): Cells {
  const task = findTask(cells, id);
  if (!task) return cells;
  const key = cellKey(task.columnId, task.laneId);
  return { ...cells, [key]: cells[key]!.filter((t) => t.id !== id) };
}

export function addTask(cells: Cells, task: Task): Cells {
  const key = cellKey(task.columnId, task.laneId);
  return { ...cells, [key]: [...(cells[key] ?? []), task] };
}

/** Puts the server's version of a task where it now belongs, by its position in the cell (changes from elsewhere, US-24). */
export function placeTask(cells: Cells, task: Task): Cells {
  const next = removeTask(cells, task.id);
  const key = cellKey(task.columnId, task.laneId);
  const list = [...(next[key] ?? []), task].sort((a, b) => a.position - b.position || a.id - b.id);
  return { ...next, [key]: list };
}

/** Tasks in a column across all lanes; WIP limits count these. */
export function columnCount(cells: Cells, columnId: number): number {
  return Object.entries(cells).reduce((sum, [key, list]) => (key.startsWith(`${columnId}:`) ? sum + list.length : sum), 0);
}

/** Tasks in a lane across all columns. */
export function laneCount(cells: Cells, laneId: number): number {
  return Object.entries(cells).reduce((sum, [key, list]) => (key.endsWith(`:${laneId}`) ? sum + list.length : sum), 0);
}

/** Moves the item with `id` to `index` among the other items (for reordering columns and lanes). */
export function reorder<T extends { id: number }>(items: T[], id: number, index: number): T[] {
  const item = items.find((i) => i.id === id);
  if (!item) return items;
  const rest = items.filter((i) => i.id !== id);
  rest.splice(Math.min(index, rest.length), 0, item);
  return rest;
}

/** The columns left and right of a column, for the quick move buttons. */
export function neighbours(columns: BoardColumn[], columnId: number): { previous?: BoardColumn; next?: BoardColumn } {
  const index = columns.findIndex((c) => c.id === columnId);
  return { previous: columns[index - 1], next: index === -1 ? undefined : columns[index + 1] };
}

export type WipState = 'none' | 'ok' | 'at-limit' | 'over-limit';

export function wipState(count: number, limit: number | null): WipState {
  if (limit === null) return 'none';
  if (count > limit) return 'over-limit';
  return count === limit ? 'at-limit' : 'ok';
}

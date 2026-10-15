import type { TaskPriority } from '../types/task';

export interface Schedule {
  priority: TaskPriority | null;
  startDate: string | null;
  dueDate: string | null;
}

/**
 * The next schedule after one date changed, keeping the rules of the API: a start needs a due date, and
 * start ≤ due. Moving one date past the other drags the other along; removing the due date removes the start.
 */
export function adjustSchedule(current: Schedule, change: { startDate?: string | null; dueDate?: string | null }): Schedule {
  let { startDate, dueDate } = current;
  if (change.dueDate !== undefined) {
    dueDate = change.dueDate;
    if (!dueDate) startDate = null;
    else if (startDate && startDate > dueDate) startDate = dueDate;
  }
  if (change.startDate !== undefined) {
    startDate = change.startDate;
    if (startDate && (!dueDate || dueDate < startDate)) dueDate = startDate;
  }
  return { ...current, startDate, dueDate };
}

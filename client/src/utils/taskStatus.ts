import type { TaskStatus } from '../types/task';

/** Board columns in display order. */
export const TASK_STATUSES: TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'done'];

/** The "active" columns that can have a WIP limit; Backlog and Done are always unlimited. */
export const WIP_LIMITED_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'review'];

/** Standard Scrum/Kanban terms, deliberately not translated. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

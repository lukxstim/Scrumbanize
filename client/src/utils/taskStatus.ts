import type { TaskStatus } from '../types/task';

/** Standard Scrum/Kanban terms, deliberately not translated. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'To Do',
  in_progress: 'In Progress',
  review: 'Review',
  done: 'Done',
};

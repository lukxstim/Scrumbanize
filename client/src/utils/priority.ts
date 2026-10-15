import { TASK_PRIORITIES, type TaskPriority } from '../types/task';

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Niedrig',
  medium: 'Mittel',
  high: 'Hoch',
  urgent: 'Dringend',
};

/** Most urgent first, as pickers and sorting show them. */
export const PRIORITIES_DESC: TaskPriority[] = [...TASK_PRIORITIES].reverse();

/** 0 = urgent … 3 = low, 4 = no priority; lower sorts first. */
export function priorityRank(priority: TaskPriority | null): number {
  return priority === null ? TASK_PRIORITIES.length : TASK_PRIORITIES.length - 1 - TASK_PRIORITIES.indexOf(priority);
}

/**
 * Colors per priority: `stripe` for the card's left edge and calendar bars, `badge` for labels,
 * `dot` for small markers. Kept as full class names so Tailwind finds them.
 */
export const PRIORITY_STYLES: Record<TaskPriority, { stripe: string; badge: string; dot: string }> = {
  low: {
    stripe: 'bg-sky-400 dark:bg-sky-500',
    badge: 'bg-sky-50 text-sky-800 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30',
    dot: 'bg-sky-400 dark:bg-sky-500',
  },
  medium: {
    stripe: 'bg-amber-400',
    badge: 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30',
    dot: 'bg-amber-400',
  },
  high: {
    stripe: 'bg-orange-500',
    badge: 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30',
    dot: 'bg-orange-500',
  },
  urgent: {
    stripe: 'bg-red-600 dark:bg-red-500',
    badge: 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/30',
    dot: 'bg-red-600 dark:bg-red-500',
  },
};

import type { Activity } from '../types/activity';
import { paths } from './paths';

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

/** "Heute", "Gestern", or e.g. "Montag, 12. Oktober" (with the year if it is not the current one). */
export function dayLabel(date: Date, now: Date): string {
  const days = Math.round((startOfDay(now).getTime() - startOfDay(date).getTime()) / 86_400_000);
  if (days === 0) return 'Heute';
  if (days === 1) return 'Gestern';
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

/**
 * Consecutive items grouped by the calendar day of `dateOf` (an ISO time), newest first (the order the API
 * returns). Used for the activity log (created) and the trash (deleted).
 */
export function groupByDay<T>(items: T[], now: Date, dateOf: (item: T) => string): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const item of items) {
    const label = dayLabel(new Date(dateOf(item)), now);
    const last = groups.at(-1);
    if (last?.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}

/** "gerade eben", "vor 5 Min." within the last hour, otherwise the time of day ("14:05"). */
export function timeLabel(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 1) return 'gerade eben';
  if (minutes < 60) return `vor ${minutes} Min.`;
  return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Where an entry leads: the note, the task on the board, or the board for column and lane changes.
 * Notes and tasks in the trash lead to the trash; undefined for purged ones and for project entries.
 */
export function activityLink(activity: Activity): string | undefined {
  const { entityType, entityId, projectId, exists, trashed } = activity;
  if (entityType === 'board') return paths.board(projectId);
  if (trashed) return paths.trash(projectId);
  if (!exists || entityId === null) return undefined;
  if (entityType === 'note') return paths.notes(projectId, entityId);
  if (entityType === 'task') return paths.task(projectId, entityId);
  return undefined;
}

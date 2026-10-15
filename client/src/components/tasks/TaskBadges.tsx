import type { TaskPriority } from '../../types/task';
import { dueState, formatDateLong, formatDue, type DueState } from '../../utils/dates';
import { PRIORITY_LABELS, PRIORITY_STYLES } from '../../utils/priority';
import { CalendarIcon } from '../icons';

const badgeBase = 'inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium ring-1 ring-inset';

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`${badgeBase} ${PRIORITY_STYLES[priority].badge}`} title={`Priorität: ${PRIORITY_LABELS[priority]}`}>
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

const DUE_STYLES: Record<DueState, string> = {
  overdue: 'bg-danger-muted text-danger-text ring-danger-line',
  today: 'bg-warning-muted text-warning-text ring-transparent',
  soon: 'bg-surface-muted text-fg-muted ring-line',
  later: 'bg-surface-muted text-fg-subtle ring-line',
  done: 'bg-surface-muted text-fg-subtle ring-line line-through decoration-fg-faint',
};

const DUE_HINTS: Record<DueState, string> = {
  overdue: 'Überfällig',
  today: 'Heute fällig',
  soon: 'Bald fällig',
  later: 'Fällig',
  done: 'Erledigt, war fällig',
};

/** The due date as "Heute", "Morgen" or "17.10.", colored by urgency; `done` tasks are never overdue. */
export function DueBadge({ startDate, dueDate, today, done }: { startDate: string | null; dueDate: string; today: string; done: boolean }) {
  const state = dueState(dueDate, today, done);
  const range = startDate ? `${formatDateLong(startDate)} – ${formatDateLong(dueDate)}` : formatDateLong(dueDate);
  return (
    <span className={`${badgeBase} ${DUE_STYLES[state]}`} title={`${DUE_HINTS[state]}: ${range}`}>
      <CalendarIcon className="size-3" />
      {startDate && `${formatDue(startDate, today)} – `}
      {formatDue(dueDate, today)}
      <span className="sr-only">{state === 'overdue' ? ' (überfällig)' : ''}</span>
    </span>
  );
}

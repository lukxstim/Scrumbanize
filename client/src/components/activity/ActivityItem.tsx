import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Activity, ActivityAction, ActivityEntity } from '../../types/activity';
import { activityLink, timeLabel } from '../../utils/activity';
import { formatDate } from '../../utils/format';
import { BoardIcon, FolderIcon, NoteIcon, TaskIcon } from '../icons';

const ENTITY_ICONS: Record<ActivityEntity, ReactNode> = {
  note: <NoteIcon />,
  task: <TaskIcon />,
  board: <BoardIcon />,
  project: <FolderIcon />,
};

const ACTION_STYLES: Record<ActivityAction, { dot: string; label: string }> = {
  create: { dot: 'bg-emerald-500', label: 'Erstellt' },
  update: { dot: 'bg-sky-500', label: 'Bearbeitet' },
  move: { dot: 'bg-violet-500', label: 'Verschoben' },
  delete: { dot: 'bg-red-500', label: 'Gelöscht' },
};

/** One log entry; links to its note or task while that still exists. */
export default function ActivityItem({ activity, now }: { activity: Activity; now: Date }) {
  const link = activityLink(activity);
  const action = ACTION_STYLES[activity.actionType];
  const createdAt = new Date(activity.createdAt);
  const gone = !activity.exists && (activity.entityType === 'note' || activity.entityType === 'task');

  const content = (
    <>
      <span className="relative mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted text-fg-subtle ring-1 ring-line [&_svg]:size-4">
        {ENTITY_ICONS[activity.entityType]}
        <span
          title={action.label}
          className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-surface ${action.dot}`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-sm ${link ? 'text-fg group-hover:text-accent-text' : 'text-fg-muted'}`}>
          {activity.description}
        </span>
        {gone && activity.actionType !== 'delete' && (
          <span className="mt-0.5 block text-xs text-fg-subtle">
            {activity.entityType === 'note' ? 'Notiz' : 'Task'} wurde inzwischen gelöscht
          </span>
        )}
      </span>
      <time dateTime={activity.createdAt} title={formatDate(activity.createdAt)} className="shrink-0 pt-0.5 text-xs text-fg-subtle tabular-nums">
        {timeLabel(createdAt, now)}
      </time>
    </>
  );

  const className = 'group flex items-start gap-3 rounded-lg px-3 py-2.5';
  return (
    <li>
      {link ? (
        <Link
          to={link}
          className={`${className} transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent`}
        >
          {content}
        </Link>
      ) : (
        <div className={className}>{content}</div>
      )}
    </li>
  );
}

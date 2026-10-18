import { LabelChips, LabelDots } from '../tasks/LabelChip';
import { useDraggable } from '@dnd-kit/core';
import type { KeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import type { BoardColumn, Task } from '../../types/task';
import { todayIso } from '../../utils/dates';
import { paths } from '../../utils/paths';
import { checklistProgress } from '../../utils/checklist';
import { linkSummary, openBlockers } from '../../utils/links';
import { PRIORITY_LABELS, PRIORITY_STYLES } from '../../utils/priority';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, LinkIcon, NoteIcon, PaperclipIcon } from '../icons';
import { DueBadge, PriorityBadge } from '../tasks/TaskBadges';
import { isolate } from './isolate';

interface TaskCardProps {
  task: Task;
  /** The columns left and right, for the quick move buttons. */
  previous?: BoardColumn;
  next?: BoardColumn;
  compact: boolean;
  /** The task is in the rightmost (done) column, so it is never overdue. */
  done?: boolean;
  /** Briefly highlighted after it was moved. */
  flash?: boolean;
  onOpen: (id: number) => void;
  /** Moves the task to the end of another column, staying in its lane. */
  onMoveTo: (id: number, columnId: number) => void;
  /** Viewers (US-21): the card opens, but cannot be dragged or moved. */
  readOnly?: boolean;
}

/** A draggable card: Space picks it up with the keyboard, Enter or a click opens the details. */
export function DraggableTaskCard({ task, previous, next, compact, done = false, flash = false, onOpen, onMoveTo, readOnly = false }: TaskCardProps) {
  // The card stays in place as a placeholder; the DragOverlay follows the pointer.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { type: 'task' }, disabled: readOnly });

  return (
    <div
      ref={setNodeRef}
      data-task-id={task.id}
      {...attributes}
      {...listeners}
      aria-roledescription={readOnly ? undefined : 'verschiebbarer Task'}
      onClick={() => onOpen(task.id)}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === 'Enter') onOpen(task.id);
        else listeners?.onKeyDown?.(event);
      }}
      className="group touch-manipulation select-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <TaskCardBody task={task} compact={compact} done={done} placeholder={isDragging} flash={flash}>
        <div className="flex gap-0.5">
          {previous && !readOnly && (
            <QuickMoveButton label={previous.name} onClick={() => onMoveTo(task.id, previous.id)}>
              <ChevronLeftIcon />
            </QuickMoveButton>
          )}
          {next && !readOnly && (
            <QuickMoveButton label={next.name} onClick={() => onMoveTo(task.id, next.id)}>
              <ChevronRightIcon />
            </QuickMoveButton>
          )}
        </div>
      </TaskCardBody>
    </div>
  );
}

function QuickMoveButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      {...isolate}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={`Nach „${label}“ verschieben`}
      title={`Nach „${label}“`}
      className="grid size-6 place-items-center rounded-md text-fg-subtle hover:bg-surface-hover hover:text-fg-muted focus-visible:bg-surface-hover focus-visible:text-fg-muted focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

interface TaskCardBodyProps {
  task: Task;
  compact?: boolean;
  done?: boolean;
  /** Controls that take the place of the task number while the card is hovered or focused. */
  children?: ReactNode;
  /** The card follows the pointer while dragging. */
  lifted?: boolean;
  /** The card's original slot while it is being dragged. */
  placeholder?: boolean;
  /** Briefly highlights the card, e.g. right after it was moved. */
  flash?: boolean;
}

/** Small grey counters on the card (links, checklist, attachments). */
const metaBadge =
  'inline-flex items-center gap-0.5 rounded bg-surface-muted px-1.5 py-px text-[11px] font-medium text-fg-subtle ring-1 ring-line ring-inset';

/** The card's visible content, shared by the board and the drag preview. */
export function TaskCardBody({
  task,
  compact = false,
  done = false,
  children,
  lifted = false,
  placeholder = false,
  flash = false,
}: TaskCardBodyProps) {
  const look = lifted
    ? 'cursor-grabbing border-accent-line shadow-popover ring-1 ring-accent-line rotate-[1.5deg] scale-[1.02]'
    : placeholder
      ? 'border-dashed border-accent-line bg-accent-muted [&>*]:invisible'
      : 'cursor-grab border-line shadow-card hover:-translate-y-px hover:border-line-strong hover:shadow-card-hover';
  const tags = task.sourceNote?.tags ?? [];
  const blockers = openBlockers(task);
  const checklist = checklistProgress(task.description);
  const hasBadges =
    task.dueDate ||
    (task.priority && !compact) ||
    task.links.length > 0 ||
    task.attachments.length > 0 ||
    checklist.total > 0 ||
    task.labels.length > 0;

  return (
    <article
      className={`relative overflow-hidden rounded-lg border bg-surface text-left transition-[transform,box-shadow,border-color] duration-150 ${
        compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'
      } ${look} ${flash ? 'animate-flash' : ''}`}
    >
      {task.priority && (
        <span
          aria-hidden="true"
          title={PRIORITY_LABELS[task.priority]}
          className={`absolute inset-y-0 left-0 w-1 ${PRIORITY_STYLES[task.priority].stripe}`}
        />
      )}
      <div className="flex items-start gap-2">
        <h3
          className={`min-w-0 flex-1 break-words py-0.5 leading-snug font-medium text-fg ${compact ? 'text-xs' : 'text-sm'}`}
        >
          {task.title}
        </h3>
        <div className="relative flex h-6 w-12 shrink-0 items-center justify-end">
          <span
            className={`font-mono text-[11px] text-fg-subtle ${
              children ? 'group-hover:invisible group-focus-within:invisible group-focus-visible:invisible [@media(hover:none)]:invisible' : ''
            }`}
          >
            #{task.id}
          </span>
          {children && (
            <div className="absolute -right-1.5 top-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
              {children}
            </div>
          )}
        </div>
      </div>
      {hasBadges && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {compact ? <LabelDots labels={task.labels} className="mr-0.5" /> : <LabelChips labels={task.labels} />}
          {blockers.length > 0 && (
            <span
              className="inline-flex items-center rounded bg-danger-muted px-1.5 py-px text-[11px] font-medium text-danger-text ring-1 ring-danger-line ring-inset"
              title={blockers.map((l) => `Wird blockiert von #${l.task.id} ${l.task.title}`).join('\n')}
            >
              Blockiert
            </span>
          )}
          {task.priority && !compact && <PriorityBadge priority={task.priority} />}
          {task.dueDate && <DueBadge startDate={task.startDate} dueDate={task.dueDate} today={todayIso()} done={done} />}
          {task.links.length > 0 && (
            <span
              className="inline-flex items-center gap-0.5 rounded bg-surface-muted px-1.5 py-px text-[11px] font-medium text-fg-subtle ring-1 ring-line ring-inset"
              title={linkSummary(task)}
            >
              <LinkIcon className="size-3" />
              {task.links.length}
              <span className="sr-only">{task.links.length === 1 ? ' Verknüpfung' : ' Verknüpfungen'}</span>
            </span>
          )}
          {checklist.total > 0 && (
            <span
              className={`${metaBadge} ${checklist.done === checklist.total ? 'text-success-text' : ''}`}
              title={`Checkliste: ${checklist.done} von ${checklist.total} erledigt`}
            >
              <CheckIcon className="size-3" />
              {checklist.done}/{checklist.total}
              <span className="sr-only"> Checkliste erledigt</span>
            </span>
          )}
          {task.attachments.length > 0 && (
            <span className={metaBadge} title={task.attachments.map((a) => a.fileName).join('\n')}>
              <PaperclipIcon className="size-3" />
              {task.attachments.length}
              <span className="sr-only">{task.attachments.length === 1 ? ' Anhang' : ' Anhänge'}</span>
            </span>
          )}
        </div>
      )}
      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1" title="Tags der verknüpften Notiz">
          {tags.slice(0, 3).map((tag) => (
            <span key={tag} className="rounded bg-accent-muted px-1.5 py-px text-[11px] font-medium text-accent-text">
              {tag}
            </span>
          ))}
          {tags.length > 3 && (
            <span className="rounded bg-surface-muted px-1.5 py-px text-[11px] text-fg-subtle">+{tags.length - 3}</span>
          )}
        </div>
      )}
      {task.sourceNote && !compact && (
        <Link
          to={paths.notes(task.projectId, task.sourceNote.id)}
          {...isolate}
          title="Zur Notiz"
          className="mt-1.5 flex w-fit max-w-full items-center gap-1 text-xs text-fg-subtle hover:text-accent-text"
        >
          <NoteIcon className="size-3.5 shrink-0" />
          <span className="truncate hover:underline">{task.sourceNote.title || UNTITLED_NOTE}</span>
        </Link>
      )}
    </article>
  );
}

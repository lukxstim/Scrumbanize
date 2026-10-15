import { useDraggable } from '@dnd-kit/core';
import type { KeyboardEvent, ReactNode, SyntheticEvent } from 'react';
import { Link } from 'react-router';
import type { Task, TaskStatus } from '../../types/task';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../../utils/taskStatus';
import { ChevronLeftIcon, ChevronRightIcon, NoteIcon } from '../icons';

interface TaskCardProps {
  task: Task;
  onOpen: (id: number) => void;
  onMoveTo: (id: number, status: TaskStatus) => void;
}

/** Keeps clicks and key presses on controls inside the card from starting a drag or opening the task. */
const isolate = {
  onMouseDown: (event: SyntheticEvent) => event.stopPropagation(),
  onTouchStart: (event: SyntheticEvent) => event.stopPropagation(),
  onKeyDown: (event: SyntheticEvent) => event.stopPropagation(),
  onClick: (event: SyntheticEvent) => event.stopPropagation(),
};

/** A draggable card: Space picks it up with the keyboard, Enter or a click opens the details. */
export function DraggableTaskCard({ task, onOpen, onMoveTo }: TaskCardProps) {
  // The card stays in place as a placeholder; the DragOverlay follows the pointer.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });

  const index = TASK_STATUSES.indexOf(task.status);
  const previous = TASK_STATUSES[index - 1];
  const next = TASK_STATUSES[index + 1];

  return (
    <div
      ref={setNodeRef}
      data-task-id={task.id}
      {...attributes}
      {...listeners}
      aria-roledescription="verschiebbarer Task"
      onClick={() => onOpen(task.id)}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === 'Enter') onOpen(task.id);
        else listeners?.onKeyDown?.(event);
      }}
      className="group touch-manipulation select-none rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
    >
      <TaskCardBody task={task} placeholder={isDragging}>
        <div className="flex gap-0.5">
          {previous && (
            <QuickMoveButton label={TASK_STATUS_LABELS[previous]} onClick={() => onMoveTo(task.id, previous)}>
              <ChevronLeftIcon />
            </QuickMoveButton>
          )}
          {next && (
            <QuickMoveButton label={TASK_STATUS_LABELS[next]} onClick={() => onMoveTo(task.id, next)}>
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
      className="grid size-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:bg-slate-100 focus-visible:text-slate-700 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

interface TaskCardBodyProps {
  task: Task;
  /** Controls that take the place of the task number while the card is hovered or focused. */
  children?: ReactNode;
  /** The card follows the pointer while dragging. */
  lifted?: boolean;
  /** The card's original slot while it is being dragged. */
  placeholder?: boolean;
}

/** The card's visible content, shared by the board and the drag preview. */
export function TaskCardBody({ task, children, lifted = false, placeholder = false }: TaskCardBodyProps) {
  const look = lifted
    ? 'cursor-grabbing border-indigo-300 shadow-xl ring-1 ring-indigo-200 rotate-[1.5deg]'
    : placeholder
      ? 'border-dashed border-indigo-300 bg-indigo-50/60 [&>*]:invisible'
      : 'cursor-grab border-slate-200 shadow-sm hover:border-slate-300 hover:shadow';

  return (
    <article className={`rounded-lg border bg-white px-3 py-2.5 text-left transition-shadow ${look}`}>
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 break-words py-0.5 text-sm leading-snug font-medium text-slate-900">{task.title}</h3>
        <div className="relative flex h-6 w-12 shrink-0 items-center justify-end">
          <span
            className={`font-mono text-[11px] text-slate-400 ${
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
      {task.sourceNote && (
        <Link
          to={`/notes/${task.sourceNote.id}`}
          {...isolate}
          title="Zur Notiz"
          className="mt-1.5 flex w-fit max-w-full items-center gap-1 text-xs text-slate-500 hover:text-indigo-600"
        >
          <NoteIcon className="size-3.5 shrink-0" />
          <span className="truncate hover:underline">{task.sourceNote.title || UNTITLED_NOTE}</span>
        </Link>
      )}
    </article>
  );
}

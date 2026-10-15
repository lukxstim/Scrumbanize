import { useDraggable } from '@dnd-kit/core';
import type { KeyboardEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import type { BoardColumn, Task } from '../../types/task';
import { paths } from '../../utils/paths';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';
import { ChevronLeftIcon, ChevronRightIcon, NoteIcon } from '../icons';
import { isolate } from './isolate';

interface TaskCardProps {
  task: Task;
  /** The columns left and right, for the quick move buttons. */
  previous?: BoardColumn;
  next?: BoardColumn;
  compact: boolean;
  onOpen: (id: number) => void;
  /** Moves the task to the end of another column, staying in its lane. */
  onMoveTo: (id: number, columnId: number) => void;
}

/** A draggable card: Space picks it up with the keyboard, Enter or a click opens the details. */
export function DraggableTaskCard({ task, previous, next, compact, onOpen, onMoveTo }: TaskCardProps) {
  // The card stays in place as a placeholder; the DragOverlay follows the pointer.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { type: 'task' } });

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
      <TaskCardBody task={task} compact={compact} placeholder={isDragging}>
        <div className="flex gap-0.5">
          {previous && (
            <QuickMoveButton label={previous.name} onClick={() => onMoveTo(task.id, previous.id)}>
              <ChevronLeftIcon />
            </QuickMoveButton>
          )}
          {next && (
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
      className="grid size-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:bg-slate-100 focus-visible:text-slate-700 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}

interface TaskCardBodyProps {
  task: Task;
  compact?: boolean;
  /** Controls that take the place of the task number while the card is hovered or focused. */
  children?: ReactNode;
  /** The card follows the pointer while dragging. */
  lifted?: boolean;
  /** The card's original slot while it is being dragged. */
  placeholder?: boolean;
}

/** The card's visible content, shared by the board and the drag preview. */
export function TaskCardBody({ task, compact = false, children, lifted = false, placeholder = false }: TaskCardBodyProps) {
  const look = lifted
    ? 'cursor-grabbing border-indigo-300 shadow-xl ring-1 ring-indigo-200 rotate-[1.5deg]'
    : placeholder
      ? 'border-dashed border-indigo-300 bg-indigo-50/60 [&>*]:invisible'
      : 'cursor-grab border-slate-200 shadow-sm hover:border-slate-300 hover:shadow';

  return (
    <article
      className={`rounded-lg border bg-white text-left transition-shadow ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2.5'} ${look}`}
    >
      <div className="flex items-start gap-2">
        <h3
          className={`min-w-0 flex-1 break-words py-0.5 leading-snug font-medium text-slate-900 ${compact ? 'text-xs' : 'text-sm'}`}
        >
          {task.title}
        </h3>
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
      {task.sourceNote && !compact && (
        <Link
          to={paths.notes(task.projectId, task.sourceNote.id)}
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

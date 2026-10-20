import type { ReactNode } from 'react';
import type { RemoteMark } from '../../hooks/useBoard';
import type { BoardColumn, Task } from '../../types/task';
import { columnWidthVar } from '../../utils/columnWidths';
import { DraggableTaskCard } from './TaskCard';

interface BoardCellProps {
  column: BoardColumn;
  laneId: number;
  tasks: Task[];
  previous?: BoardColumn;
  next?: BoardColumn;
  compact: boolean;
  /** The rightmost column: its tasks are never overdue. */
  done: boolean;
  /** The task to highlight briefly after a move. */
  flashId: number | null;
  /** Tasks changed elsewhere a moment ago (US-24). */
  remoteMarks?: Record<number, RemoteMark>;
  /** The column's width shown now, saved or default. */
  width: number;
  minHeightClass: string;
  /** A dragged card would currently land here. */
  isDropTarget: boolean;
  overLimit: boolean;
  onOpenTask: (id: number) => void;
  onMoveTask: (id: number, columnId: number) => void;
  footer?: ReactNode;
  /** Viewers (US-21): cards cannot be moved. */
  readOnly?: boolean;
}

/** One column within one lane. `data-cell-*` and the cards' `data-task-id` are measured while dragging. */
export default function BoardCell({
  column,
  laneId,
  tasks,
  previous,
  next,
  compact,
  done,
  flashId,
  remoteMarks,
  width,
  minHeightClass,
  isDropTarget,
  overLimit,
  onOpenTask,
  onMoveTask,
  footer,
  readOnly = false,
}: BoardCellProps) {
  return (
    <div
      data-cell-column={column.id}
      data-cell-lane={laneId}
      style={{ width: `var(${columnWidthVar(column.id)}, ${width}px)` }}
      className={`flex shrink-0 flex-col gap-2 rounded-xl border p-2 transition-colors duration-150 ${minHeightClass} ${
        isDropTarget ? 'border-accent-line bg-accent-muted' : 'bg-surface-muted'
      } ${overLimit ? 'border-danger-line' : isDropTarget ? '' : 'border-transparent'}`}
    >
      {tasks.map((task) => (
        <DraggableTaskCard
          key={task.id}
          task={task}
          previous={previous}
          next={next}
          compact={compact}
          done={done}
          flash={task.id === flashId}
          remote={remoteMarks?.[task.id]}
          onOpen={onOpenTask}
          onMoveTo={onMoveTask}
          readOnly={readOnly}
        />
      ))}
      {footer}
    </div>
  );
}

import type { ReactNode } from 'react';
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
  /** The column's width shown now, saved or default. */
  width: number;
  minHeightClass: string;
  /** A dragged card would currently land here. */
  isDropTarget: boolean;
  overLimit: boolean;
  onOpenTask: (id: number) => void;
  onMoveTask: (id: number, columnId: number) => void;
  footer?: ReactNode;
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
  width,
  minHeightClass,
  isDropTarget,
  overLimit,
  onOpenTask,
  onMoveTask,
  footer,
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
          onOpen={onOpenTask}
          onMoveTo={onMoveTask}
        />
      ))}
      {footer}
    </div>
  );
}

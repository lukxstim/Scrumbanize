import type { ReactNode } from 'react';
import type { BoardColumn, Task } from '../../types/task';
import { DraggableTaskCard } from './TaskCard';

interface BoardCellProps {
  column: BoardColumn;
  laneId: number;
  tasks: Task[];
  previous?: BoardColumn;
  next?: BoardColumn;
  compact: boolean;
  widthClass: string;
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
  widthClass,
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
      className={`flex shrink-0 flex-col gap-2 rounded-xl border p-2 transition-colors ${widthClass} ${minHeightClass} ${
        isDropTarget ? 'border-indigo-200 bg-indigo-50' : 'bg-slate-100'
      } ${overLimit ? 'border-red-300' : isDropTarget ? '' : 'border-transparent'}`}
    >
      {tasks.map((task) => (
        <DraggableTaskCard
          key={task.id}
          task={task}
          previous={previous}
          next={next}
          compact={compact}
          onOpen={onOpenTask}
          onMoveTo={onMoveTask}
        />
      ))}
      {footer}
    </div>
  );
}

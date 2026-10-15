import type { ReactNode } from 'react';
import type { Task, TaskStatus } from '../../types/task';
import { wipState } from '../../utils/board';
import { TASK_STATUS_LABELS, WIP_LIMITED_STATUSES } from '../../utils/taskStatus';
import { DraggableTaskCard } from './TaskCard';
import WipLimitControl from './WipLimitControl';

interface BoardColumnProps {
  status: TaskStatus;
  tasks: Task[];
  wipLimit: number | null;
  onWipLimitChange: (limit: number | null) => void;
  onOpenTask: (id: number) => void;
  onMoveTask: (id: number, status: TaskStatus) => void;
  /** A dragged card would currently land in this column. */
  isDropTarget?: boolean;
  footer?: ReactNode;
}

/** `data-board-column` and the cards' `data-task-id` are what BoardPage measures while dragging. */
export default function BoardColumn({
  status,
  tasks,
  wipLimit,
  onWipLimitChange,
  onOpenTask,
  onMoveTask,
  isDropTarget = false,
  footer,
}: BoardColumnProps) {
  const label = TASK_STATUS_LABELS[status];
  const overLimit = wipState(tasks.length, wipLimit) === 'over-limit';

  return (
    <section
      data-board-column={status}
      aria-label={label}
      className={`flex max-h-full w-72 shrink-0 flex-col rounded-xl border transition-colors ${
        isDropTarget ? 'bg-indigo-50' : 'bg-slate-100'
      } ${overLimit ? 'border-red-400 ring-1 ring-red-400' : isDropTarget ? 'border-indigo-200' : 'border-transparent'}`}
    >
      <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h2 className={`text-sm font-semibold ${overLimit ? 'text-red-700' : 'text-slate-700'}`}>{label}</h2>
        {WIP_LIMITED_STATUSES.includes(status) ? (
          <WipLimitControl count={tasks.length} limit={wipLimit} columnLabel={label} onChange={onWipLimitChange} />
        ) : (
          <span className="px-1.5 text-xs tabular-nums text-slate-500">{tasks.length}</span>
        )}
      </header>

      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {tasks.map((task) => (
          <DraggableTaskCard key={task.id} task={task} onOpen={onOpenTask} onMoveTo={onMoveTask} />
        ))}
        {tasks.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
            Keine Tasks
          </p>
        )}
      </div>

      {footer && <div className="px-2 pb-2">{footer}</div>}
    </section>
  );
}

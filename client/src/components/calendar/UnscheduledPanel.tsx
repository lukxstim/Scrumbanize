import { LabelDots } from '../tasks/LabelChip';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { KeyboardEvent } from 'react';
import type { Task } from '../../types/task';
import { PRIORITY_LABELS, PRIORITY_STYLES } from '../../utils/priority';

interface UnscheduledPanelProps {
  /** Open tasks without a due date, in the order to show. */
  tasks: Task[];
  onOpenTask: (id: number) => void;
}

/** Tasks without a due date. Dragging one onto a day schedules it; dropping a bar here removes its dates. */
export default function UnscheduledPanel({ tasks, onOpenTask }: UnscheduledPanelProps) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' });

  return (
    <aside
      ref={setNodeRef}
      aria-labelledby="unscheduled-heading"
      className={`flex w-64 shrink-0 flex-col overflow-hidden rounded-xl border transition-colors max-md:max-h-[40%] max-md:w-full ${
        isOver ? 'border-accent-line bg-accent-muted' : 'border-line bg-surface'
      }`}
    >
      <div className="border-b border-line px-3 py-2">
        <h2 id="unscheduled-heading" className="flex items-center justify-between text-sm font-semibold text-fg">
          Ohne Fälligkeit
          <span className="rounded-full bg-surface-muted px-1.5 text-xs font-medium text-fg-subtle">{tasks.length}</span>
        </h2>
        <p className="mt-0.5 text-xs text-fg-subtle">Auf einen Tag ziehen, um die Fälligkeit zu setzen. Termine hierher ziehen entfernt sie.</p>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-2">
        {tasks.map((task) => (
          <UnscheduledItem key={task.id} task={task} onOpen={onOpenTask} />
        ))}
        {tasks.length === 0 && <li className="px-1 py-4 text-center text-xs text-fg-subtle">Alle offenen Tasks haben einen Termin.</li>}
      </ul>
    </aside>
  );
}

function UnscheduledItem({ task, onOpen }: { task: Task; onOpen: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task:${task.id}`, data: { task } });
  return (
    <li>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        aria-roledescription="verschiebbarer Task"
        aria-label={`#${task.id} ${task.title}${task.priority ? `, Priorität ${PRIORITY_LABELS[task.priority]}` : ''}`}
        onClick={() => onOpen(task.id)}
        onKeyDown={(event: KeyboardEvent) => {
          if (event.key === 'Enter') onOpen(task.id);
          else listeners?.onKeyDown?.(event);
        }}
        className={`relative flex cursor-grab touch-manipulation select-none items-center [-webkit-touch-callout:none] gap-2 overflow-hidden rounded-md border border-line bg-surface py-1.5 pr-2 pl-3 text-xs font-medium text-fg shadow-card transition-[border-color,opacity] hover:border-line-strong focus-visible:outline-2 focus-visible:outline-accent ${
          isDragging ? 'opacity-40' : ''
        }`}
      >
        {task.priority && (
          <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-1 ${PRIORITY_STYLES[task.priority].stripe}`} />
        )}
        <span className="min-w-0 flex-1 truncate">{task.title}</span>
        <LabelDots labels={task.labels} />
        <span className="font-mono text-[10px] text-fg-subtle">#{task.id}</span>
      </div>
    </li>
  );
}

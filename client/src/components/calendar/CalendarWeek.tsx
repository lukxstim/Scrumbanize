import { useDraggable, useDroppable } from '@dnd-kit/core';
import type { KeyboardEvent } from 'react';
import type { Task } from '../../types/task';
import type { CalendarBar } from '../../utils/calendarLayout';
import { dueState, formatDateLong, formatDayMonth, formatWeekday, isoWeek, sameMonth } from '../../utils/dates';
import { PRIORITY_LABELS, PRIORITY_STYLES } from '../../utils/priority';
import { hiddenPerDay } from '../../utils/calendarLayout';
import { PlusIcon } from '../icons';

const BAR_ROW_HEIGHT = '1.625rem';
// The day header sits inside the day cells, which span all rows, so its row needs a fixed height.
const HEADER_HEIGHT = '1.75rem';

interface CalendarWeekProps {
  days: string[];
  bars: CalendarBar[];
  /** Bar slots shown before "+N weitere"; Infinity shows all (week view). */
  maxRows: number;
  /** The month view dims days of other months; undefined in the week view. */
  month?: string;
  today: string;
  doneColumnId: number | undefined;
  /** The week view names each day in its header, the month view has a weekday row above. */
  dayHeaders: 'number' | 'weekday';
  minHeightClass: string;
  onOpenTask: (id: number) => void;
  onAddTask: (day: string) => void;
  /** "+N weitere" opens the week view of that day. */
  onShowWeek: (day: string) => void;
}

/** One week row: droppable days in the background, task bars on top, laid out in a 7-column grid. */
export default function CalendarWeek({
  days,
  bars,
  maxRows,
  month,
  today,
  doneColumnId,
  dayHeaders,
  minHeightClass,
  onOpenTask,
  onAddTask,
  onShowWeek,
}: CalendarWeekProps) {
  const usedRows = bars.reduce((max, bar) => Math.max(max, bar.row + 1), 0);
  const rows = Math.min(usedRows, maxRows);
  const hidden = hiddenPerDay(bars, maxRows, days.length);

  return (
    <div className={`flex border-b border-line last:border-b-0 ${minHeightClass}`}>
      <div
        className="w-9 shrink-0 border-r border-line pt-1.5 text-center font-mono text-[10px] text-fg-subtle"
        title={`Kalenderwoche ${isoWeek(days[0]!)}`}
      >
        KW{isoWeek(days[0]!)}
      </div>
      <div
        className="grid min-w-0 flex-1 grid-cols-7"
        style={{ gridTemplateRows: `${HEADER_HEIGHT} repeat(${rows}, ${BAR_ROW_HEIGHT}) auto 1fr` }}
      >
        {days.map((day, i) => (
          <CalendarDay
            key={day}
            day={day}
            column={i}
            today={today}
            outside={month !== undefined && !sameMonth(day, month)}
            header={dayHeaders}
            onAdd={() => onAddTask(day)}
          />
        ))}
        {bars
          .filter((bar) => bar.row < maxRows)
          .map((bar) => (
            <CalendarBarItem
              key={bar.task.id}
              bar={bar}
              today={today}
              done={bar.task.columnId === doneColumnId}
              onOpen={onOpenTask}
            />
          ))}
        {hidden.map((count, i) =>
          count > 0 ? (
            <button
              key={days[i]}
              type="button"
              onClick={() => onShowWeek(days[i]!)}
              style={{ gridColumn: i + 1, gridRow: rows + 2 }}
              className="relative z-10 mx-1 mt-0.5 justify-self-start rounded px-1 text-left text-[11px] font-medium text-fg-subtle hover:bg-surface-hover hover:text-fg"
            >
              +{count} weitere
            </button>
          ) : null,
        )}
      </div>
    </div>
  );
}

function CalendarDay({
  day,
  column,
  today,
  outside,
  header,
  onAdd,
}: {
  day: string;
  column: number;
  today: string;
  outside: boolean;
  header: 'number' | 'weekday';
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${day}`, data: { day } });
  const isToday = day === today;
  const weekend = column >= 5;
  const dayNumber = Number(day.slice(8, 10));

  return (
    <div
      ref={setNodeRef}
      data-day={day}
      style={{ gridColumn: column + 1, gridRow: '1 / -1' }}
      className={`group/day flex flex-col transition-colors ${column < 6 ? 'border-r border-line' : ''} ${
        isOver ? 'bg-accent-muted' : weekend ? 'bg-surface-muted/60' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-1 px-1.5 pt-1 pb-0.5">
        <span
          className={`flex items-center gap-1 text-xs ${outside ? 'text-fg-subtle' : 'text-fg'}`}
          aria-label={formatDateLong(day)}
        >
          {header === 'weekday' && <span className="font-medium">{formatWeekday(day)}</span>}
          <span
            className={`grid h-5 min-w-5 place-items-center rounded-full px-1 font-medium tabular-nums ${
              isToday ? 'bg-accent text-accent-fg' : ''
            }`}
          >
            {header === 'weekday' || dayNumber === 1 ? formatDayMonth(day) : dayNumber}
          </span>
        </span>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Task fällig am ${formatDateLong(day)} anlegen`}
          title="Task an diesem Tag anlegen"
          className="grid size-5 place-items-center rounded text-fg-subtle opacity-0 transition-opacity hover:bg-surface-hover hover:text-fg focus-visible:opacity-100 group-hover/day:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <PlusIcon className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

const BAR_LOOK = {
  overdue: 'border-danger-line bg-danger-muted text-danger-text',
  done: 'border-line bg-surface-muted text-fg-subtle line-through decoration-fg-faint',
  normal: 'border-line bg-surface text-fg shadow-card hover:border-line-strong',
} as const;

function barLook(task: Task, today: string, done: boolean): keyof typeof BAR_LOOK {
  if (done) return 'done';
  return task.dueDate && dueState(task.dueDate, today) === 'overdue' ? 'overdue' : 'normal';
}

function CalendarBarItem({ bar, today, done, onOpen }: { bar: CalendarBar; today: string; done: boolean; onOpen: (id: number) => void }) {
  const { task } = bar;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task:${task.id}`, data: { task } });
  const look = barLook(task, today, done);
  const range = task.startDate ? `${formatDateLong(task.startDate)} – ${formatDateLong(task.dueDate!)}` : formatDateLong(task.dueDate!);
  const details = [task.priority && `Priorität ${PRIORITY_LABELS[task.priority]}`, look === 'overdue' && 'überfällig', done && 'erledigt']
    .filter(Boolean)
    .join(', ');

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-roledescription="verschiebbarer Termin"
      aria-label={`#${task.id} ${task.title}, ${range}${details ? `, ${details}` : ''}`}
      title={`${task.title}\n${range}`}
      onClick={() => onOpen(task.id)}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === 'Enter') onOpen(task.id);
        else listeners?.onKeyDown?.(event);
      }}
      style={{ gridColumn: `${bar.start + 1} / span ${bar.span}`, gridRow: bar.row + 2 }}
      className={`relative z-10 my-0.5 flex min-w-0 cursor-grab touch-manipulation select-none items-center gap-1.5 overflow-hidden border px-1.5 text-xs font-medium transition-[border-color,box-shadow,opacity] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${
        BAR_LOOK[look]
      } ${bar.continuesBefore ? 'rounded-l-none border-l-0' : 'ml-1 rounded-l-md'} ${
        bar.continuesAfter ? 'rounded-r-none border-r-0' : 'mr-1 rounded-r-md'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {task.priority && <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${PRIORITY_STYLES[task.priority].dot}`} />}
      <span className="truncate">{task.title}</span>
    </div>
  );
}

/** The bar as it follows the pointer while dragging. */
export function CalendarBarGhost({ task }: { task: Task }) {
  return (
    <div className="flex h-6 max-w-64 cursor-grabbing items-center gap-1.5 rounded-md border border-accent-line bg-surface px-2 text-xs font-medium text-fg shadow-popover ring-1 ring-accent-line">
      {task.priority && <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${PRIORITY_STYLES[task.priority].dot}`} />}
      <span className="truncate">{task.title}</span>
    </div>
  );
}

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useBoard } from '../../hooks/useBoard';
import { useGoneNotice } from '../../hooks/useCollaboration';
import { useCan } from '../../hooks/useProjectRole';
import { useStoredState } from '../../hooks/useStoredState';
import { useToast } from '../../hooks/useToast';
import type { Task } from '../../types/task';
import { trashApi } from '../../utils/api';
import { cellTasks } from '../../utils/board';
import { layoutWeek, scheduleOn, shiftTask } from '../../utils/calendarLayout';
import {
  addDays,
  addMonths,
  daysBetween,
  formatDate,
  formatDateLong,
  formatMonth,
  formatWeekday,
  isoWeek,
  monthGrid,
  startOfWeek,
  todayIso,
  weekDays,
} from '../../utils/dates';
import { priorityRank } from '../../utils/priority';
import TaskDetailDialog from '../board/TaskDetailDialog';
import { ChevronLeftIcon, ChevronRightIcon } from '../icons';
import Button from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import Skeleton from '../ui/Skeleton';
import { iconButtonClass } from '../ui/styles';
import CalendarWeek, { CalendarBarGhost } from './CalendarWeek';
import NewDatedTaskDialog from './NewDatedTaskDialog';
import UnscheduledPanel from './UnscheduledPanel';

const NO_SENSORS: ReturnType<typeof useSensors> = [];

type Mode = 'month' | 'week';
const isMode = (value: unknown): value is Mode => value === 'month' || value === 'week';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const MONTH_ROWS = 3;

// The pointer decides the target day; keyboard drags have no pointer and use the closest day instead.
const collisionDetection: CollisionDetection = (args) => (args.pointerCoordinates ? pointerWithin(args) : closestCenter(args));

/** The calendar day under a screen point (day cells carry data-day and lie under the bars). */
function dayAt(x: number, y: number): string | undefined {
  for (const element of document.elementsFromPoint(x, y)) {
    if (element instanceof HTMLElement && element.dataset.day) return element.dataset.day;
  }
  return undefined;
}

/** The project's tasks by due date: month and week view at /p/:projectId/calendar. */
export default function CalendarPage() {
  const projectId = Number(useParams().projectId);
  // Viewers look at the calendar; moving and adding dates needs a member (US-21).
  const canEdit = useCan('edit');
  const board = useBoard(projectId);
  const toast = useToast();
  const today = todayIso();

  const [mode, setMode] = useStoredState<Mode>('scrumbanize.calendarMode', 'month', isMode);
  const [showUnscheduled, setShowUnscheduled] = useStoredState('scrumbanize.calendarUnscheduled', true, isBoolean);
  const [anchor, setAnchor] = useState(today);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [addingOn, setAddingOn] = useState<string | null>(null);
  const [dragged, setDragged] = useState<Task | null>(null);
  // The day the bar was picked up on, so a multi-day bar moves by the distance it was dragged.
  const grabDay = useRef<string | null>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const tasks = useMemo(() => Object.values(board.cells).flat(), [board.cells]);
  const doneColumnId = board.columns.at(-1)?.id;
  const weeks = mode === 'month' ? monthGrid(anchor) : [weekDays(startOfWeek(anchor))];
  const unscheduled = tasks
    .filter((t) => !t.dueDate && t.columnId !== doneColumnId)
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.id - b.id);
  const openTask = tasks.find((t) => t.id === openTaskId);
  useGoneNotice(projectId, 'task', openTaskId);

  const { actionError, dismissError } = board;
  useEffect(() => {
    if (!actionError) return;
    toast({ message: actionError, tone: 'error' });
    dismissError();
  }, [actionError, dismissError, toast]);

  // Keyboard dragging moves by one day left/right and one week up/down.
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates }) => {
    const day = calendarRef.current?.querySelector('[data-day]')?.getBoundingClientRect();
    const width = day?.width ?? 100;
    const height = day?.height ?? 100;
    switch (event.code) {
      case 'ArrowRight':
        return { ...currentCoordinates, x: currentCoordinates.x + width };
      case 'ArrowLeft':
        return { ...currentCoordinates, x: currentCoordinates.x - width };
      case 'ArrowDown':
        return { ...currentCoordinates, y: currentCoordinates.y + height };
      case 'ArrowUp':
        return { ...currentCoordinates, y: currentCoordinates.y - height };
    }
    return undefined;
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  function handleDragStart({ active, activatorEvent }: DragStartEvent) {
    const task = active.data.current?.task as Task | undefined;
    if (!task) return;
    setDragged(task);
    const rect = active.rect.current.initial;
    const point =
      activatorEvent instanceof MouseEvent
        ? { x: activatorEvent.clientX, y: activatorEvent.clientY }
        : typeof TouchEvent !== 'undefined' && activatorEvent instanceof TouchEvent && activatorEvent.touches[0]
          ? { x: activatorEvent.touches[0].clientX, y: activatorEvent.touches[0].clientY }
          : rect && { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    grabDay.current = (point && dayAt(point.x, point.y)) ?? task.dueDate;
  }

  /** The new dates for a drop, or undefined if nothing changes. */
  function datesForDrop(task: Task, overId: string | undefined): { startDate: string | null; dueDate: string | null } | undefined {
    if (overId === 'unscheduled') return task.dueDate ? { startDate: null, dueDate: null } : undefined;
    if (!overId?.startsWith('day:')) return undefined;
    const day = overId.slice('day:'.length);
    if (!task.dueDate) return scheduleOn(task, day);
    const days = grabDay.current ? daysBetween(grabDay.current, day) : daysBetween(task.dueDate, day);
    return days === 0 ? undefined : shiftTask(task, days);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    const task = active.data.current?.task as Task | undefined;
    setDragged(null);
    if (!task) return;
    const dates = datesForDrop(task, over ? String(over.id) : undefined);
    if (dates) void board.rescheduleTask(task.id, dates);
  }

  const describeDates = (dates: { startDate: string | null; dueDate: string | null }) =>
    !dates.dueDate
      ? 'ohne Fälligkeit'
      : dates.startDate
        ? `von ${formatDateLong(dates.startDate)} bis ${formatDateLong(dates.dueDate)}`
        : `fällig am ${formatDateLong(dates.dueDate)}`;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Task ${String(active.id).slice('task:'.length)} aufgenommen.`,
    onDragOver: ({ over }) =>
      over ? (over.id === 'unscheduled' ? 'Über „Ohne Fälligkeit“.' : `Über ${formatDateLong(String(over.id).slice(4))}.`) : undefined,
    onDragMove: () => undefined,
    onDragEnd: ({ active, over }) => {
      const task = active.data.current?.task as Task | undefined;
      const dates = task && datesForDrop(task, over ? String(over.id) : undefined);
      return dates ? `Task #${task.id} jetzt ${describeDates(dates)}.` : 'Termin unverändert.';
    },
    onDragCancel: () => 'Verschieben abgebrochen.',
  };

  function go(direction: -1 | 1) {
    setAnchor((current) => (mode === 'month' ? addMonths(current, direction) : addDays(current, direction * 7)));
  }

  const firstDay = weeks[0]![0]!;
  const title =
    mode === 'month'
      ? formatMonth(anchor)
      : `KW ${isoWeek(firstDay)} · ${formatDate(firstDay)} – ${formatDate(addDays(firstDay, 6))}`;

  if (board.status === 'loading') {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4" aria-label="Lade Kalender …">
        <Skeleton className="h-8 w-80 rounded-lg" />
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );
  }

  if (board.status === 'error') {
    return (
      <div className="p-6 text-sm text-danger-text">
        <p>Der Kalender konnte nicht geladen werden.</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => void board.reload()}>
          Erneut versuchen
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setAnchor(today)}>
          Heute
        </Button>
        <div className="flex">
          <button type="button" onClick={() => go(-1)} aria-label={mode === 'month' ? 'Vorheriger Monat' : 'Vorherige Woche'} className={iconButtonClass}>
            <ChevronLeftIcon />
          </button>
          <button type="button" onClick={() => go(1)} aria-label={mode === 'month' ? 'Nächster Monat' : 'Nächste Woche'} className={iconButtonClass}>
            <ChevronRightIcon />
          </button>
        </div>
        <h1 aria-live="polite" className="text-base font-semibold text-fg">
          {title}
        </h1>
        <div className="flex-1" />
        <SegmentedControl
          label="Kalenderansicht"
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'month', label: 'Monat' },
            { value: 'week', label: 'Woche' },
          ]}
        />
        <Button size="sm" variant="ghost" aria-pressed={showUnscheduled} onClick={() => setShowUnscheduled(!showUnscheduled)}>
          Ohne Fälligkeit ({unscheduled.length})
        </Button>
      </div>

      <DndContext
        // Without sensors nothing can be picked up: the bars of viewers stay where they are.
        sensors={canEdit ? sensors : NO_SENSORS}
        collisionDetection={collisionDetection}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Leertaste drücken, um aufzunehmen. Pfeiltasten links und rechts verschieben um einen Tag, hoch und runter um eine Woche. Leertaste legt ab, Escape bricht ab. Enter öffnet den Task.',
          },
        }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDragged(null)}
      >
        <div className="flex min-h-0 flex-1 gap-3">
          <div ref={calendarRef} className="flex min-w-0 flex-1 flex-col overflow-auto rounded-xl border border-line bg-surface">
            {mode === 'month' && (
              <div className="sticky top-0 z-20 flex border-b border-line bg-surface">
                <div className="w-9 shrink-0 border-r border-line" />
                <div className="grid flex-1 grid-cols-7">
                  {weeks[0]!.map((day) => (
                    <div key={day} className="px-1.5 py-1 text-xs font-medium text-fg-subtle">
                      {formatWeekday(day)}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-1 flex-col">
              {weeks.map((days) => (
                <CalendarWeek
                  key={days[0]}
                  days={days}
                  bars={layoutWeek(days, tasks)}
                  maxRows={mode === 'month' ? MONTH_ROWS : Infinity}
                  month={mode === 'month' ? anchor : undefined}
                  today={today}
                  doneColumnId={doneColumnId}
                  dayHeaders={mode === 'month' ? 'number' : 'weekday'}
                  minHeightClass={mode === 'month' ? 'min-h-28 flex-1' : 'min-h-96 flex-1'}
                  onOpenTask={setOpenTaskId}
                  onAddTask={canEdit ? setAddingOn : undefined}
                  onShowWeek={(day) => {
                    setAnchor(day);
                    setMode('week');
                  }}
                />
              ))}
            </div>
          </div>
          {showUnscheduled && <UnscheduledPanel tasks={unscheduled} onOpenTask={setOpenTaskId} />}
        </div>

        <DragOverlay dropAnimation={null}>{dragged && <CalendarBarGhost task={dragged} />}</DragOverlay>
      </DndContext>

      {addingOn && (
        <NewDatedTaskDialog
          day={addingOn}
          lanes={board.lanes}
          onClose={() => setAddingOn(null)}
          onCreate={async (title, laneId, priority) => {
            const task = await board.createTask(title, laneId, { priority, dueDate: addingOn });
            setAddingOn(null);
            toast({ message: `Task #${task.id} „${task.title}“ angelegt.` });
          }}
        />
      )}

      {openTask && (
        <TaskDetailDialog
          readOnly={!canEdit}
          key={openTask.id}
          task={openTask}
          columns={board.columns}
          lanes={board.lanes}
          onClose={() => setOpenTaskId(null)}
          onSave={board.updateTask}
          allTasks={tasks}
          onAddLink={board.addLink}
          onRemoveLink={board.removeLink}
          onUpdateAttachments={board.updateAttachments}
          labels={board.labels}
          onCreateLabel={board.createLabel}
          onOpenTask={setOpenTaskId}
          onMove={(id, columnId, laneId) =>
            void board.moveTask(id, columnId, laneId, cellTasks(board.cells, columnId, laneId).filter((t) => t.id !== id).length)
          }
          onDelete={async (id) => {
            await board.deleteTask(id);
            setOpenTaskId(null);
            toast({
              message: 'Task in den Papierkorb verschoben.',
              action: {
                label: 'Rückgängig',
                onClick: async () => {
                  try {
                    await trashApi.restore('task', id);
                    await board.reload();
                    
                  } catch {
                    toast({ message: 'Der Task konnte nicht wiederhergestellt werden.', tone: 'error' });
                  }
                },
              },
            });
          }}
        />
      )}
    </div>
  );
}

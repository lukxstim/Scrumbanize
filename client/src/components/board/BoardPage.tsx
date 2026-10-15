import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragMoveEvent,
  type DragStartEvent,
  type KeyboardCoordinateGetter,
} from '@dnd-kit/core';
import { useEffect, useRef, useState } from 'react';
import { useMatch, useNavigate } from 'react-router';
import { useBoard } from '../../hooks/useBoard';
import type { TaskStatus } from '../../types/task';
import { applyMove, findTask, type Columns } from '../../utils/board';
import { dropPosition, type ColumnGeometry } from '../../utils/dropPosition';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../../utils/taskStatus';
import BoardColumn from './BoardColumn';
import NewTaskForm from './NewTaskForm';
import { TaskCardBody } from './TaskCard';
import TaskDetailDialog from './TaskDetailDialog';

const CARD_GAP = 8;

/** Where a task sits on the board: its column and its index there. */
function placementOf(columns: Columns, id: number): { status: TaskStatus; index: number } | undefined {
  const task = findTask(columns, id);
  return task && { status: task.status, index: columns[task.status].findIndex((t) => t.id === id) };
}

/** The board at /board; /tasks/:taskId shows it with that task's details open. */
export default function BoardPage() {
  const board = useBoard();
  const navigate = useNavigate();
  const taskMatch = useMatch('/tasks/:taskId');
  const openTaskId = taskMatch ? Number(taskMatch.params.taskId) : null;

  // While dragging, the board shows this preview copy, so cards make room as the dragged card moves.
  // The real move is saved on drop. The ref mirrors the state for the drag handlers.
  const [dragColumns, setDragColumns] = useState<Columns | null>(null);
  const dragColumnsRef = useRef<Columns | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const boardRef = useRef<HTMLDivElement>(null);
  const columns = dragColumns ?? board.columns;

  const showDragColumns = (next: Columns | null) => {
    dragColumnsRef.current = next;
    setDragColumns(next);
  };

  /** Reads the columns' positions and their cards' middles from the page, leaving out the dragged card. */
  function measure(excludeId: number): ColumnGeometry[] {
    const sections = boardRef.current?.querySelectorAll<HTMLElement>('[data-board-column]') ?? [];
    return [...sections].map((section) => {
      const rect = section.getBoundingClientRect();
      const cards = [...section.querySelectorAll<HTMLElement>('[data-task-id]')].filter(
        (card) => Number(card.dataset.taskId) !== excludeId,
      );
      return {
        status: section.dataset.boardColumn as TaskStatus,
        left: rect.left,
        right: rect.right,
        cardMiddles: cards.map((card) => {
          const r = card.getBoundingClientRect();
          return r.top + r.height / 2;
        }),
      };
    });
  }

  // Keyboard dragging: up/down moves by one card, left/right jumps to the neighbouring column.
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
    const step = (context.collisionRect?.height ?? 80) + CARD_GAP;
    const sections = boardRef.current?.querySelectorAll('[data-board-column]');
    const first = sections?.[0]?.getBoundingClientRect();
    const second = sections?.[1]?.getBoundingClientRect();
    const pitch = first && second ? second.left - first.left : 300;

    switch (event.code) {
      case 'ArrowDown':
        return { ...currentCoordinates, y: currentCoordinates.y + step };
      case 'ArrowUp':
        return { ...currentCoordinates, y: currentCoordinates.y - step };
      case 'ArrowRight':
        return { ...currentCoordinates, x: currentCoordinates.x + pitch };
      case 'ArrowLeft':
        return { ...currentCoordinates, x: currentCoordinates.x - pitch };
    }
    return undefined;
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      // Enter opens the task, so only Space picks a card up.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const openTask = openTaskId === null ? undefined : findTask(board.columns, openTaskId);

  useEffect(() => {
    if (board.status === 'ready' && openTaskId !== null && !openTask) navigate('/board', { replace: true });
  }, [board.status, openTaskId, openTask, navigate]);

  function handleDragStart({ active }: DragStartEvent) {
    setActiveId(Number(active.id));
    showDragColumns(board.columns);
    setLiveMessage('');
  }

  /** The pointer for mouse and touch; the card's centre for the keyboard. */
  function pointerOf({ activatorEvent, delta, active }: DragMoveEvent): { x: number; y: number } | null {
    const start =
      activatorEvent instanceof MouseEvent
        ? activatorEvent
        : typeof TouchEvent !== 'undefined' && activatorEvent instanceof TouchEvent
          ? activatorEvent.touches[0]
          : undefined;
    if (start) return { x: start.clientX + delta.x, y: start.clientY + delta.y };

    const rect = active.rect.current.translated;
    return rect && { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function handleDragMove(event: DragMoveEvent) {
    const current = dragColumnsRef.current;
    const pointer = pointerOf(event);
    if (!current || !pointer) return;

    const id = Number(event.active.id);
    const target = dropPosition(pointer.x, pointer.y, measure(id));
    const now = placementOf(current, id);
    if (!target || !now || (target.status === now.status && target.index === now.index)) return;

    showDragColumns(applyMove(current, id, target.status, target.index));
    setLiveMessage(`${TASK_STATUS_LABELS[target.status]}, Position ${target.index + 1}.`);
  }

  function endDrag() {
    setActiveId(null);
    showDragColumns(null);
  }

  function handleDragEnd({ active }: { active: { id: string | number } }) {
    const id = Number(active.id);
    const dropped = dragColumnsRef.current && placementOf(dragColumnsRef.current, id);
    const original = placementOf(board.columns, id);
    endDrag();

    if (dropped && original && (dropped.status !== original.status || dropped.index !== original.index)) {
      void board.moveTask(id, dropped.status, dropped.index);
    }
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => `Task #${active.id} aufgenommen.`,
    onDragOver: () => undefined,
    onDragMove: () => undefined,
    onDragEnd: ({ active }) => {
      const dropped = dragColumnsRef.current && placementOf(dragColumnsRef.current, Number(active.id));
      return dropped
        ? `Task #${active.id} in „${TASK_STATUS_LABELS[dropped.status]}“ an Position ${dropped.index + 1} abgelegt.`
        : `Task #${active.id} abgelegt.`;
    },
    onDragCancel: ({ active }) => `Verschieben von Task #${active.id} abgebrochen.`,
  };

  const moveToColumnEnd = (id: number, status: TaskStatus) =>
    void board.moveTask(id, status, board.columns[status].filter((t) => t.id !== id).length);

  const activeTask = activeId === null ? undefined : findTask(columns, activeId);
  const dropStatus = activeId === null ? undefined : activeTask?.status;

  if (board.status === 'loading') {
    return <p className="p-6 text-sm text-slate-500">Lade Board …</p>;
  }

  if (board.status === 'error') {
    return (
      <div className="p-6 text-sm text-red-600">
        <p>Das Board konnte nicht geladen werden.</p>
        <button type="button" className="mt-2 underline" onClick={() => void board.reload()}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {board.actionError && (
        <div role="alert" className="flex items-center gap-3 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span className="flex-1">{board.actionError}</span>
          <button type="button" className="underline" onClick={board.dismissError}>
            Schließen
          </button>
        </div>
      )}

      <DndContext
        sensors={sensors}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Leertaste drücken, um den Task aufzunehmen. Pfeiltasten hoch und runter verschieben innerhalb der Spalte, links und rechts wechseln die Spalte. Leertaste legt ab, Escape bricht ab. Enter öffnet den Task.',
          },
        }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={endDrag}
      >
        <div ref={boardRef} className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
          {TASK_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              status={status}
              tasks={columns[status]}
              wipLimit={board.wipLimits[status] ?? null}
              isDropTarget={dropStatus === status}
              onWipLimitChange={(limit) => void board.setWipLimit(status, limit)}
              onOpenTask={(id) => navigate(`/tasks/${id}`)}
              onMoveTask={moveToColumnEnd}
              footer={status === 'backlog' ? <NewTaskForm onCreate={board.createTask} /> : undefined}
            />
          ))}
        </div>

        <DragOverlay>{activeTask && <TaskCardBody task={activeTask} lifted />}</DragOverlay>
      </DndContext>

      <div aria-live="assertive" className="sr-only">
        {liveMessage}
      </div>

      {openTask && (
        <TaskDetailDialog
          key={openTask.id}
          task={openTask}
          onClose={() => navigate('/board')}
          onSave={board.updateTask}
          onChangeStatus={moveToColumnEnd}
          onDelete={async (id) => {
            await board.deleteTask(id);
            navigate('/board', { replace: true });
          }}
        />
      )}
    </div>
  );
}

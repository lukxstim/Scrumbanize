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
import { useMatch, useNavigate, useParams } from 'react-router';
import { useBoard } from '../../hooks/useBoard';
import { useStoredState } from '../../hooks/useStoredState';
import type { BoardColumn } from '../../types/task';
import {
  applyMove,
  cellTasks,
  columnCount,
  findTask,
  laneCount,
  neighbours,
  placementOf,
  reorder,
  wipState,
  type Cells,
} from '../../utils/board';
import { columnDropIndex, dropPosition, type CellGeometry } from '../../utils/dropPosition';
import { paths } from '../../utils/paths';
import AddItemButton from './AddItemButton';
import BoardCell from './BoardCell';
import ColumnHeader, { ColumnHeaderGhost } from './ColumnHeader';
import DeleteBoardItemDialog from './DeleteBoardItemDialog';
import LaneHeader from './LaneHeader';
import NewTaskForm from './NewTaskForm';
import { TaskCardBody } from './TaskCard';
import TaskDetailDialog from './TaskDetailDialog';

const CARD_GAP = 8;
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isIdList = (value: unknown): value is number[] => Array.isArray(value) && value.every((v) => typeof v === 'number');

type Dragging = { type: 'task'; id: number } | { type: 'column'; id: number } | null;

/** The board at /p/:projectId/board; /p/:projectId/tasks/:taskId shows it with that task's details open. */
export default function BoardPage() {
  const projectId = Number(useParams().projectId);
  const board = useBoard(projectId);
  const navigate = useNavigate();
  const taskMatch = useMatch('/p/:projectId/tasks/:taskId');
  const openTaskId = taskMatch ? Number(taskMatch.params.taskId) : null;

  const [compact, setCompact] = useStoredState('scrumbanize.boardCompact', false, isBoolean);
  const [collapsedLanes, setCollapsedLanes] = useStoredState<number[]>('scrumbanize.collapsedLanes', [], isIdList);
  const [deleting, setDeleting] = useState<{ kind: 'column' | 'lane'; id: number } | null>(null);

  // While dragging, the board shows preview copies, so cards (or columns) make room as the dragged one moves.
  // The real move is saved on drop. The refs mirror the state for the drag handlers.
  const [dragging, setDragging] = useState<Dragging>(null);
  const [dragCells, setDragCells] = useState<Cells | null>(null);
  const dragCellsRef = useRef<Cells | null>(null);
  const [dragColumns, setDragColumns] = useState<BoardColumn[] | null>(null);
  const dragColumnsRef = useRef<BoardColumn[] | null>(null);
  const [liveMessage, setLiveMessage] = useState('');
  const boardRef = useRef<HTMLDivElement>(null);

  const cells = dragCells ?? board.cells;
  const columns = dragColumns ?? board.columns;
  const { lanes } = board;
  const showLanes = lanes.length > 1;
  const widthClass = compact ? 'w-56' : 'w-72';

  const showDragCells = (next: Cells | null) => {
    dragCellsRef.current = next;
    setDragCells(next);
  };
  const showDragColumns = (next: BoardColumn[] | null) => {
    dragColumnsRef.current = next;
    setDragColumns(next);
  };

  /** Reads the cells' positions and their cards' middles from the page, leaving out the dragged card. */
  function measureCells(excludeId: number): CellGeometry[] {
    const elements = boardRef.current?.querySelectorAll<HTMLElement>('[data-cell-column]') ?? [];
    return [...elements].map((cell) => {
      const rect = cell.getBoundingClientRect();
      const cards = [...cell.querySelectorAll<HTMLElement>('[data-task-id]')].filter(
        (card) => Number(card.dataset.taskId) !== excludeId,
      );
      return {
        columnId: Number(cell.dataset.cellColumn),
        laneId: Number(cell.dataset.cellLane),
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        cardMiddles: cards.map((card) => {
          const r = card.getBoundingClientRect();
          return r.top + r.height / 2;
        }),
      };
    });
  }

  /** Horizontal centres of the column headers, leaving out the dragged column. */
  function measureColumnCentres(excludeId: number): number[] {
    const headers = boardRef.current?.querySelectorAll<HTMLElement>('[data-column-header]') ?? [];
    return [...headers]
      .filter((header) => Number(header.dataset.columnHeader) !== excludeId)
      .map((header) => {
        const r = header.getBoundingClientRect();
        return r.left + r.width / 2;
      });
  }

  // Keyboard dragging: up/down moves by one card (into the next lane at the edge), left/right by one column.
  const keyboardCoordinates: KeyboardCoordinateGetter = (event, { currentCoordinates, context }) => {
    const step = (context.collisionRect?.height ?? 80) + CARD_GAP;
    const headers = boardRef.current?.querySelectorAll('[data-column-header]');
    const first = headers?.[0]?.getBoundingClientRect();
    const second = headers?.[1]?.getBoundingClientRect();
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
      // Enter opens a task, so only Space picks a card or column up.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  );

  const openTask = openTaskId === null ? undefined : findTask(board.cells, openTaskId);

  useEffect(() => {
    if (board.status === 'ready' && openTaskId !== null && !openTask) navigate(paths.board(projectId), { replace: true });
  }, [board.status, openTaskId, openTask, navigate, projectId]);

  const columnName = (id: number) => board.columns.find((c) => c.id === id)?.name ?? '';
  const laneName = (id: number) => lanes.find((l) => l.id === id)?.name ?? '';
  const cellLabel = (columnId: number, laneId: number) =>
    showLanes ? `„${columnName(columnId)}“, Swimlane „${laneName(laneId)}“` : `„${columnName(columnId)}“`;

  function handleDragStart({ active }: DragStartEvent) {
    setLiveMessage('');
    if (active.data.current?.type === 'column') {
      const id = Number(String(active.id).slice('column:'.length));
      setDragging({ type: 'column', id });
      showDragColumns(board.columns);
    } else {
      setDragging({ type: 'task', id: Number(active.id) });
      showDragCells(board.cells);
    }
  }

  /** The pointer for mouse and touch; the dragged item's centre for the keyboard. */
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
    const pointer = pointerOf(event);
    if (!pointer || !dragging) return;

    if (dragging.type === 'column') {
      const current = dragColumnsRef.current;
      if (!current) return;
      const index = columnDropIndex(pointer.x, measureColumnCentres(dragging.id));
      if (index === current.findIndex((c) => c.id === dragging.id)) return;
      showDragColumns(reorder(current, dragging.id, index));
      setLiveMessage(`Spalte an Position ${index + 1}.`);
      return;
    }

    const current = dragCellsRef.current;
    if (!current) return;
    const target = dropPosition(pointer.x, pointer.y, measureCells(dragging.id));
    const now = placementOf(current, dragging.id);
    if (!target || !now) return;
    if (target.columnId === now.columnId && target.laneId === now.laneId && target.index === now.index) return;

    showDragCells(applyMove(current, dragging.id, target.columnId, target.laneId, target.index));
    setLiveMessage(`${cellLabel(target.columnId, target.laneId)}, Position ${target.index + 1}.`);
  }

  function endDrag() {
    setDragging(null);
    showDragCells(null);
    showDragColumns(null);
  }

  function handleDragEnd() {
    if (dragging?.type === 'column') {
      const index = dragColumnsRef.current?.findIndex((c) => c.id === dragging.id) ?? -1;
      const original = board.columns.findIndex((c) => c.id === dragging.id);
      endDrag();
      if (index !== -1 && index !== original) void board.moveColumn(dragging.id, index);
      return;
    }

    if (dragging?.type === 'task') {
      const dropped = dragCellsRef.current && placementOf(dragCellsRef.current, dragging.id);
      const original = placementOf(board.cells, dragging.id);
      endDrag();
      const changed =
        dropped &&
        original &&
        (dropped.columnId !== original.columnId || dropped.laneId !== original.laneId || dropped.index !== original.index);
      if (changed) void board.moveTask(dragging.id, dropped.columnId, dropped.laneId, dropped.index);
      return;
    }
    endDrag();
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      active.data.current?.type === 'column'
        ? `Spalte „${columnName(Number(String(active.id).slice('column:'.length)))}“ aufgenommen.`
        : `Task #${active.id} aufgenommen.`,
    onDragOver: () => undefined,
    onDragMove: () => undefined,
    onDragEnd: ({ active }) => {
      if (active.data.current?.type === 'column') return 'Spalte abgelegt.';
      const dropped = dragCellsRef.current && placementOf(dragCellsRef.current, Number(active.id));
      return dropped
        ? `Task #${active.id} in ${cellLabel(dropped.columnId, dropped.laneId)} an Position ${dropped.index + 1} abgelegt.`
        : `Task #${active.id} abgelegt.`;
    },
    onDragCancel: () => 'Verschieben abgebrochen.',
  };

  /** Moves a task to the end of another cell; the lane stays unless given. */
  function moveToCellEnd(id: number, columnId: number, laneId?: number) {
    const task = findTask(board.cells, id);
    if (!task) return;
    const lane = laneId ?? task.laneId;
    void board.moveTask(id, columnId, lane, cellTasks(board.cells, columnId, lane).filter((t) => t.id !== id).length);
  }

  /** Moves a column or lane one step; the index counts the others, so it is simply the current index ± 1. */
  function step<T extends { id: number }>(items: T[], id: number, direction: -1 | 1, move: (id: number, index: number) => void) {
    const index = items.findIndex((i) => i.id === id);
    if (index !== -1) move(id, index + direction);
  }

  function toggleLane(id: number) {
    setCollapsedLanes(collapsedLanes.includes(id) ? collapsedLanes.filter((l) => l !== id) : [...collapsedLanes, id]);
  }

  const activeTask = dragging?.type === 'task' ? findTask(cells, dragging.id) : undefined;
  const activeColumn = dragging?.type === 'column' ? columns.find((c) => c.id === dragging.id) : undefined;
  const dropCell = activeTask ? `${activeTask.columnId}:${activeTask.laneId}` : undefined;

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

  const deletingItem =
    deleting?.kind === 'column'
      ? board.columns.find((c) => c.id === deleting.id)
      : deleting?.kind === 'lane'
        ? lanes.find((l) => l.id === deleting.id)
        : undefined;

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

      <div className="flex items-center justify-end gap-2 px-4 pt-3">
        <button
          type="button"
          aria-pressed={compact}
          onClick={() => setCompact(!compact)}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200/70"
        >
          <span
            aria-hidden="true"
            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${compact ? 'bg-indigo-600' : 'bg-slate-300'}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 size-3 rounded-full bg-white shadow transition-transform ${compact ? 'translate-x-3' : ''}`}
            />
          </span>
          Kompakt
        </button>
      </div>

      <DndContext
        sensors={sensors}
        accessibility={{
          announcements,
          screenReaderInstructions: {
            draggable:
              'Leertaste drücken, um aufzunehmen. Pfeiltasten verschieben: hoch und runter innerhalb der Spalte und zwischen Swimlanes, links und rechts zwischen Spalten. Leertaste legt ab, Escape bricht ab. Enter öffnet einen Task.',
          },
        }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={endDrag}
      >
        <div ref={boardRef} className="min-h-0 flex-1 overflow-auto">
          <div className="inline-flex min-w-full flex-col gap-3 px-4 pb-4">
            {/* Column headers stay visible while scrolling down. */}
            <div className="sticky top-0 z-10 -mx-4 flex items-start gap-3 bg-slate-50 px-4 pb-1 pt-2">
              {columns.map((column, i) => (
                <ColumnHeader
                  key={column.id}
                  column={column}
                  count={columnCount(cells, column.id)}
                  widthClass={widthClass}
                  isFirst={i === 0}
                  isLast={i === columns.length - 1}
                  deleteDisabledReason={columns.length <= 1 ? 'Die letzte Spalte kann nicht gelöscht werden.' : undefined}
                  onRename={(name) => void board.updateColumn(column.id, { name })}
                  onWipLimitChange={(wipLimit) => void board.updateColumn(column.id, { wipLimit })}
                  onMove={(direction) => step(board.columns, column.id, direction, board.moveColumn)}
                  onDelete={() => setDeleting({ kind: 'column', id: column.id })}
                />
              ))}
              <AddItemButton
                label="Spalte"
                placeholder="Name der Spalte …"
                onAdd={board.addColumn}
                className="w-56 shrink-0"
              />
            </div>

            {lanes.map((lane, laneIndex) => {
              const collapsed = showLanes && collapsedLanes.includes(lane.id);
              return (
                <section key={lane.id} aria-label={showLanes ? `Swimlane „${lane.name}“` : undefined} className="flex flex-col gap-2">
                  {showLanes && (
                    <LaneHeader
                      lane={lane}
                      count={laneCount(cells, lane.id)}
                      collapsed={collapsed}
                      onToggle={() => toggleLane(lane.id)}
                      isFirst={laneIndex === 0}
                      isLast={laneIndex === lanes.length - 1}
                      onRename={(name) => void board.renameLane(lane.id, name)}
                      onMove={(direction) => step(lanes, lane.id, direction, board.moveLane)}
                      onDelete={() => setDeleting({ kind: 'lane', id: lane.id })}
                    />
                  )}
                  {!collapsed && (
                    <div className="flex gap-3">
                      {columns.map((column, columnIndex) => {
                        const { previous, next } = neighbours(columns, column.id);
                        return (
                          <BoardCell
                            key={column.id}
                            column={column}
                            laneId={lane.id}
                            tasks={cellTasks(cells, column.id, lane.id)}
                            previous={previous}
                            next={next}
                            compact={compact}
                            widthClass={widthClass}
                            minHeightClass={showLanes ? 'min-h-28' : 'min-h-[calc(100vh-11rem)]'}
                            isDropTarget={dropCell === `${column.id}:${lane.id}`}
                            overLimit={wipState(columnCount(cells, column.id), column.wipLimit) === 'over-limit'}
                            onOpenTask={(id) => navigate(paths.task(projectId, id))}
                            onMoveTask={(id, columnId) => moveToCellEnd(id, columnId)}
                            footer={
                              columnIndex === 0 ? (
                                <NewTaskForm onCreate={(title) => board.createTask(title, lane.id)} />
                              ) : undefined
                            }
                          />
                        );
                      })}
                      {/* Keeps the cells aligned with the headers, which end with the add-column button. */}
                      <div className="w-56 shrink-0" aria-hidden="true" />
                    </div>
                  )}
                </section>
              );
            })}

            <AddItemButton
              label="Swimlane"
              placeholder="Name der Swimlane …"
              onAdd={board.addLane}
              className="sticky left-4 w-56"
            />
          </div>
        </div>

        <DragOverlay>
          {activeTask && <TaskCardBody task={activeTask} compact={compact} lifted />}
          {activeColumn && <ColumnHeaderGhost column={activeColumn} widthClass={widthClass} />}
        </DragOverlay>
      </DndContext>

      <div aria-live="assertive" className="sr-only">
        {liveMessage}
      </div>

      {deleting && deletingItem && (
        <DeleteBoardItemDialog
          kind={deleting.kind}
          name={deletingItem.name}
          taskCount={deleting.kind === 'column' ? columnCount(board.cells, deleting.id) : laneCount(board.cells, deleting.id)}
          targets={(deleting.kind === 'column' ? board.columns : lanes).filter((item) => item.id !== deleting.id)}
          onConfirm={(moveTasksTo) =>
            deleting.kind === 'column' ? board.deleteColumn(deleting.id, moveTasksTo) : board.deleteLane(deleting.id, moveTasksTo)
          }
          onClose={() => setDeleting(null)}
        />
      )}

      {openTask && (
        <TaskDetailDialog
          key={openTask.id}
          task={openTask}
          columns={board.columns}
          lanes={lanes}
          onClose={() => navigate(paths.board(projectId))}
          onSave={board.updateTask}
          onMove={moveToCellEnd}
          onDelete={async (id) => {
            await board.deleteTask(id);
            navigate(paths.board(projectId), { replace: true });
          }}
        />
      )}
    </div>
  );
}

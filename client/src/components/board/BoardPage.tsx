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
import { useLocation, useMatch, useNavigate, useParams } from 'react-router';
import { useBoard } from '../../hooks/useBoard';
import { useStoredState } from '../../hooks/useStoredState';
import { useToast } from '../../hooks/useToast';
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
import { isCreateRequest } from '../../utils/appEvents';
import { columnDropIndex, dropPosition, type CellGeometry } from '../../utils/dropPosition';
import { todayIso } from '../../utils/dates';
import { exportUrls, trashApi } from '../../utils/api';
import { DownloadIcon } from '../icons';
import { paths } from '../../utils/paths';
import { applyView, DEFAULT_VIEW, dropIndexInCell, isTaskView } from '../../utils/taskView';
import AddItemButton from './AddItemButton';
import BoardCell from './BoardCell';
import BoardViewBar from './BoardViewBar';
import ColumnHeader, { ColumnHeaderGhost } from './ColumnHeader';
import DeleteBoardItemDialog from './DeleteBoardItemDialog';
import LaneHeader from './LaneHeader';
import NewTaskForm from './NewTaskForm';
import { TaskCardBody } from './TaskCard';
import TaskDetailDialog from './TaskDetailDialog';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';

const CARD_GAP = 8;
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isIdList = (value: unknown): value is number[] => Array.isArray(value) && value.every((v) => typeof v === 'number');

type Dragging = { type: 'task'; id: number } | { type: 'column'; id: number } | null;

/** The board at /p/:projectId/board; /p/:projectId/tasks/:taskId shows it with that task's details open. */
export default function BoardPage() {
  const projectId = Number(useParams().projectId);
  const board = useBoard(projectId);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const taskMatch = useMatch('/p/:projectId/tasks/:taskId');
  const openTaskId = taskMatch ? Number(taskMatch.params.taskId) : null;

  const [compact, setCompact] = useStoredState('scrumbanize.boardCompact', false, isBoolean);
  const [collapsedLanes, setCollapsedLanes] = useStoredState<number[]>('scrumbanize.collapsedLanes', [], isIdList);
  // Sorting and filters are remembered per project in this browser; they never change the saved order.
  const [view, setView] = useStoredState(`scrumbanize.boardView.${projectId}`, DEFAULT_VIEW, isTaskView);
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

  // `cells` holds every task (WIP limits and counts use it); `shown` is what the view lets through, in its order.
  const cells = dragCells ?? board.cells;
  const columns = dragColumns ?? board.columns;
  const today = todayIso();
  const doneColumnId = board.columns.at(-1)?.id;
  const shown = applyView(cells, view, today, doneColumnId);
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

  // Failed saves reload the board; a toast says what happened.
  const { actionError, dismissError } = board;
  useEffect(() => {
    if (!actionError) return;
    toast({ message: actionError, tone: 'error' });
    dismissError();
  }, [actionError, dismissError, toast]);

  // "Neuer Task" from the command palette arrives as navigation state: with a title the task is created
  // (and opened), without one the "+ Task" field of the first lane opens.
  const [newTaskRequest, setNewTaskRequest] = useState(0);
  const handledRequest = useRef<unknown>(null);
  useEffect(() => {
    const state = location.state;
    if (board.status !== 'ready' || !isCreateRequest(state) || state.create !== 'task') return;
    if (handledRequest.current === state) return;
    handledRequest.current = state;
    const firstLane = board.lanes[0];
    if (!state.title || !firstLane) {
      setNewTaskRequest((n) => n + 1);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    board
      .createTask(state.title, firstLane.id)
      .then((task) => {
        toast({ message: `Task #${task.id} „${task.title}“ angelegt.` });
        navigate(paths.task(projectId, task.id), { replace: true });
      })
      .catch(() => toast({ message: 'Der Task konnte nicht angelegt werden.', tone: 'error' }));
  });

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
    // Positions are measured on the shown cards and mapped to the full cell (see dropIndexInCell).
    const target = dropPosition(pointer.x, pointer.y, measureCells(dragging.id));
    const now = placementOf(current, dragging.id);
    if (!target || !now) return;
    const original = placementOf(board.cells, dragging.id);
    const backHome = original && target.columnId === original.columnId && target.laneId === original.laneId;
    const index =
      view.sort !== 'manual' && backHome
        ? original.index
        : dropIndexInCell(current, applyView(current, view, today, doneColumnId), view, dragging.id, target);
    if (index === undefined) return;
    if (target.columnId === now.columnId && target.laneId === now.laneId && index === now.index) return;

    showDragCells(applyMove(current, dragging.id, target.columnId, target.laneId, index));
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
    return (
      <div className="flex gap-3 p-4 pt-12" aria-label="Lade Board …">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`flex shrink-0 flex-col gap-2 ${widthClass}`}>
            <Skeleton className="h-10 rounded-lg" />
            <div className="flex flex-col gap-2 rounded-xl bg-surface-muted p-2">
              {Array.from({ length: 3 - (i % 3) }, (_, j) => (
                <Skeleton key={j} className="h-16 rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (board.status === 'error') {
    return (
      <div className="p-6 text-sm text-danger-text">
        <p>Das Board konnte nicht geladen werden.</p>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => void board.reload()}>
          Erneut versuchen
        </Button>
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
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <BoardViewBar
          view={view}
          onChange={setView}
          shown={Object.values(shown).reduce((sum, list) => sum + list.length, 0)}
          total={Object.values(cells).reduce((sum, list) => sum + list.length, 0)}
        />
        <button
          type="button"
          aria-pressed={compact}
          onClick={() => setCompact(!compact)}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium text-fg-muted hover:bg-surface-strong"
        >
          <span
            aria-hidden="true"
            className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${compact ? 'bg-accent' : 'bg-line-strong'}`}
          >
            <span
              className={`absolute left-0.5 top-0.5 size-3 rounded-full bg-white shadow transition-transform duration-150 ${compact ? 'translate-x-3' : ''}`}
            />
          </span>
          Kompakt
        </button>
        <a
          href={exportUrls.boardCsv(projectId)}
          download
          title="Alle Tasks des Boards als CSV-Datei für Excel"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-fg-muted hover:bg-surface-strong"
        >
          <DownloadIcon className="size-3.5" />
          CSV
        </a>
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
            <div className="sticky top-0 z-10 -mx-4 flex items-start gap-3 bg-canvas px-4 pb-1 pt-2">
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
                            tasks={cellTasks(shown, column.id, lane.id)}
                            previous={previous}
                            next={next}
                            compact={compact}
                            done={column.id === doneColumnId}
                            flashId={board.flashId}
                            widthClass={widthClass}
                            minHeightClass={showLanes ? 'min-h-28' : 'min-h-[calc(100vh-11rem)]'}
                            isDropTarget={dropCell === `${column.id}:${lane.id}`}
                            overLimit={wipState(columnCount(cells, column.id), column.wipLimit) === 'over-limit'}
                            onOpenTask={(id) => navigate(paths.task(projectId, id))}
                            onMoveTask={(id, columnId) => moveToCellEnd(id, columnId)}
                            footer={
                              columnIndex === 0 ? (
                                <NewTaskForm
                                  key={laneIndex === 0 ? newTaskRequest : 0}
                                  defaultOpen={laneIndex === 0 && newTaskRequest > 0}
                                  onCreate={(title) => board.createTask(title, lane.id)}
                                />
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
          {activeTask && <TaskCardBody task={activeTask} compact={compact} done={activeTask.columnId === doneColumnId} lifted />}
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
          allTasks={Object.values(board.cells).flat()}
          onAddLink={board.addLink}
          onRemoveLink={board.removeLink}
          onUpdateAttachments={board.updateAttachments}
          onOpenTask={(id) => navigate(paths.task(projectId, id))}
          onDelete={async (id) => {
            await board.deleteTask(id);
            navigate(paths.board(projectId), { replace: true });
            toast({
              message: 'Task in den Papierkorb verschoben.',
              action: {
                label: 'Rückgängig',
                onClick: async () => {
                  try {
                    await trashApi.restore('task', id);
                    await board.reload();
                    navigate(paths.task(projectId, id));
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

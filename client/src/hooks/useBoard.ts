import { useCallback, useEffect, useState } from 'react';
import type { BoardColumn, Lane, Task, TaskPatch } from '../types/task';
import { ApiError, boardApi, columnsApi, lanesApi, tasksApi } from '../utils/api';
import { addTask, applyMove, groupByCell, removeTask, reorder, replaceTask, type Cells } from '../utils/board';
import type { LoadStatus } from './useNotes';

type ItemKind = 'column' | 'lane';

const KIND_LABELS: Record<ItemKind, { one: string; many: string }> = {
  column: { one: 'Spalte', many: 'Spalten' },
  lane: { one: 'Swimlane', many: 'Swimlanes' },
};

/** A German message for a failed column or lane change. */
function boardErrorMessage(kind: ItemKind, error: unknown): string {
  const { one, many } = KIND_LABELS[kind];
  switch (error instanceof ApiError ? error.code : undefined) {
    case 'name_taken':
      return `Es gibt bereits eine ${one} mit diesem Namen.`;
    case 'limit_reached':
      return `Ein Projekt kann höchstens 20 ${many} haben.`;
    case 'last_item':
      return `Die letzte ${one} kann nicht gelöscht werden.`;
    default:
      return `Die ${one} konnte nicht gespeichert werden.`;
  }
}

/**
 * Board state of one project. Task moves and reordering are shown immediately and then saved; if saving
 * fails, the board reloads from the server and `actionError` explains what happened. Adding, renaming and
 * deleting columns and lanes wait for the server; they resolve to false (with `actionError` set) on failure.
 */
export function useBoard(projectId: number) {
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [cells, setCells] = useState<Cells>({});
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const board = await boardApi.get(projectId);
      setColumns(board.columns);
      setLanes(board.lanes);
      setCells(groupByCell(board.tasks));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const failed = useCallback(
    (message: string) => {
      setActionError(message);
      void reload();
    },
    [reload],
  );

  /** Runs a column or lane change on the server, then shows the board as the server has it. */
  const change = useCallback(
    async (kind: ItemKind, request: () => Promise<unknown>): Promise<boolean> => {
      try {
        await request();
        setActionError(null);
        await reload();
        return true;
      } catch (error) {
        failed(boardErrorMessage(kind, error));
        return false;
      }
    },
    [failed, reload],
  );

  /** `index` counts the other tasks in the target cell. */
  const moveTask = useCallback(
    async (id: number, columnId: number, laneId: number, index: number) => {
      setCells((current) => applyMove(current, id, columnId, laneId, index));
      try {
        const saved = await tasksApi.move(id, columnId, laneId, index);
        setCells((current) => replaceTask(current, saved));
      } catch {
        failed('Der Task konnte nicht verschoben werden. Das Board wurde neu geladen.');
      }
    },
    [failed],
  );

  /** New tasks start at the end of the first column, in the given lane. */
  const createTask = useCallback(
    async (title: string, laneId: number): Promise<Task> => {
      const task = await tasksApi.create(projectId, { title, description: '', laneId });
      setCells((current) => addTask(current, task));
      return task;
    },
    [projectId],
  );

  const updateTask = useCallback(async (id: number, patch: TaskPatch): Promise<void> => {
    const saved = await tasksApi.update(id, patch);
    setCells((current) => replaceTask(current, saved));
  }, []);

  const deleteTask = useCallback(async (id: number): Promise<void> => {
    await tasksApi.remove(id);
    setCells((current) => removeTask(current, id));
  }, []);

  const moveColumn = useCallback(
    async (id: number, index: number) => {
      setColumns((current) => reorder(current, id, index));
      try {
        await columnsApi.move(id, index);
      } catch {
        failed('Die Spalte konnte nicht verschoben werden. Das Board wurde neu geladen.');
      }
    },
    [failed],
  );

  const moveLane = useCallback(
    async (id: number, index: number) => {
      setLanes((current) => reorder(current, id, index));
      try {
        await lanesApi.move(id, index);
      } catch {
        failed('Die Swimlane konnte nicht verschoben werden. Das Board wurde neu geladen.');
      }
    },
    [failed],
  );

  return {
    columns,
    lanes,
    cells,
    status,
    actionError,
    dismissError: () => setActionError(null),
    reload,
    moveTask,
    createTask,
    updateTask,
    deleteTask,
    moveColumn,
    moveLane,
    addColumn: (name: string) => change('column', () => columnsApi.create(projectId, { name })),
    updateColumn: (id: number, patch: { name?: string; wipLimit?: number | null }) =>
      change('column', () => columnsApi.update(id, patch)),
    deleteColumn: (id: number, moveTasksTo?: number) => change('column', () => columnsApi.remove(id, moveTasksTo)),
    addLane: (name: string) => change('lane', () => lanesApi.create(projectId, name)),
    renameLane: (id: number, name: string) => change('lane', () => lanesApi.rename(id, name)),
    deleteLane: (id: number, moveTasksTo?: number) => change('lane', () => lanesApi.remove(id, moveTasksTo)),
  };
}

export type BoardState = ReturnType<typeof useBoard>;

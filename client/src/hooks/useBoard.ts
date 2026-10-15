import { useCallback, useEffect, useState } from 'react';
import type { Task, TaskPatch, TaskStatus } from '../types/task';
import { boardApi, tasksApi } from '../utils/api';
import { applyMove, emptyColumns, groupByStatus, removeTask, replaceTask, type Columns } from '../utils/board';
import type { LoadStatus } from './useNotes';

type WipLimits = Record<TaskStatus, number | null>;

/**
 * Board state. Moves and WIP limit changes are shown immediately and then saved;
 * if saving fails, the board reloads from the server and `actionError` explains what happened.
 */
export function useBoard(projectId: number) {
  const [columns, setColumns] = useState<Columns>(emptyColumns);
  const [wipLimits, setWipLimits] = useState<WipLimits>({} as WipLimits);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const board = await boardApi.get(projectId);
      setColumns(groupByStatus(board.tasks));
      setWipLimits(Object.fromEntries(board.columns.map((c) => [c.status, c.wipLimit])) as WipLimits);
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

  /** `index` counts the other tasks in the target column. */
  const moveTask = useCallback(
    async (id: number, toStatus: TaskStatus, index: number) => {
      setColumns((current) => applyMove(current, id, toStatus, index));
      try {
        const saved = await tasksApi.move(id, toStatus, index);
        setColumns((current) => replaceTask(current, saved));
      } catch {
        failed('Der Task konnte nicht verschoben werden. Das Board wurde neu geladen.');
      }
    },
    [failed],
  );

  const setWipLimit = useCallback(
    async (columnStatus: TaskStatus, limit: number | null) => {
      setWipLimits((current) => ({ ...current, [columnStatus]: limit }));
      try {
        await boardApi.setWipLimit(projectId, columnStatus, limit);
      } catch {
        failed('Das WIP-Limit konnte nicht gespeichert werden.');
      }
    },
    [failed, projectId],
  );

  const createTask = useCallback(async (title: string): Promise<Task> => {
    const task = await tasksApi.create(projectId, { title, description: '' });
    setColumns((current) => ({ ...current, backlog: [...current.backlog, task] }));
    return task;
  }, [projectId]);

  const updateTask = useCallback(async (id: number, patch: TaskPatch): Promise<void> => {
    const saved = await tasksApi.update(id, patch);
    setColumns((current) => replaceTask(current, saved));
  }, []);

  const deleteTask = useCallback(async (id: number): Promise<void> => {
    await tasksApi.remove(id);
    setColumns((current) => removeTask(current, id));
  }, []);

  return {
    columns,
    wipLimits,
    status,
    actionError,
    dismissError: () => setActionError(null),
    reload,
    moveTask,
    setWipLimit,
    createTask,
    updateTask,
    deleteTask,
  };
}

import { useCallback, useEffect, useState } from 'react';
import type { Attachment } from '../types/attachment';
import type { ProjectColor } from '../types/project';
import type { BoardColumn, Label, Lane, LinkKind, Task, TaskInput, TaskPatch } from '../types/task';
import { ApiError, boardApi, columnsApi, labelsApi, lanesApi, tasksApi } from '../utils/api';
import { addTask, applyMove, groupByCell, removeTask, reorder, replaceTask, type Cells } from '../utils/board';
import { dropLinksTo, refreshLinkedTask } from '../utils/links';
import type { LoadStatus } from './useNotes';

type ItemKind = 'column' | 'lane' | 'label';

const KIND_LABELS: Record<ItemKind, { one: string; many: string; article: string; max: number }> = {
  column: { one: 'Spalte', many: 'Spalten', article: 'eine', max: 20 },
  lane: { one: 'Swimlane', many: 'Swimlanes', article: 'eine', max: 20 },
  label: { one: 'Label', many: 'Labels', article: 'ein', max: 30 },
};

/** A German message for a failed column, lane or label change. */
export function boardErrorMessage(kind: ItemKind, error: unknown): string {
  const { one, many, article, max } = KIND_LABELS[kind];
  switch (error instanceof ApiError ? error.code : undefined) {
    case 'name_taken':
      return `Es gibt bereits ${article} ${one} mit diesem Namen.`;
    case 'limit_reached':
      return `Ein Projekt kann höchstens ${max} ${many} haben.`;
    case 'last_item':
      return `Die letzte ${one} kann nicht gelöscht werden.`;
    default:
      return `${article === 'ein' ? 'Das' : 'Die'} ${one} konnte nicht gespeichert werden.`;
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
  const [labels, setLabels] = useState<Label[]>([]);
  const [cells, setCells] = useState<Cells>({});
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const board = await boardApi.get(projectId);
      setColumns(board.columns);
      setLanes(board.lanes);
      setLabels(board.labels);
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

  /**
   * Column widths are shown immediately and then saved, like moves: one column via PATCH, several in one request.
   * Without a reload, so resizing never makes the board flicker.
   */
  const setColumnWidths = useCallback(
    async (widths: { id: number; width: number | null }[]) => {
      if (widths.length === 0) return;
      const byId = new Map(widths.map((w) => [w.id, w.width]));
      setColumns((current) => current.map((c) => (byId.has(c.id) ? { ...c, width: byId.get(c.id)! } : c)));
      try {
        if (widths.length === 1) await columnsApi.update(widths[0]!.id, { width: widths[0]!.width });
        else await columnsApi.setWidths(projectId, widths);
      } catch {
        failed('Die Spaltenbreite konnte nicht gespeichert werden. Das Board wurde neu geladen.');
      }
    },
    [failed, projectId],
  );

  /** `index` counts the other tasks in the target cell. */
  // The last moved task is briefly highlighted, as feedback that the move was saved.
  const [flashId, setFlashId] = useState<number | null>(null);
  const flashTask = useCallback((id: number) => {
    setFlashId(id);
    setTimeout(() => setFlashId((current) => (current === id ? null : current)), 900);
  }, []);

  const moveTask = useCallback(
    async (id: number, columnId: number, laneId: number, index: number) => {
      setCells((current) => applyMove(current, id, columnId, laneId, index));
      try {
        const saved = await tasksApi.move(id, columnId, laneId, index);
        // Tasks linked to this one show its column, so they change too.
        setCells((current) => refreshLinkedTask(replaceTask(current, saved), saved, columns));
        flashTask(id);
      } catch {
        failed('Der Task konnte nicht verschoben werden. Das Board wurde neu geladen.');
      }
    },
    [failed, flashTask, columns],
  );

  /**
   * New tasks start at the end of the first column, in the given lane. `extra` adds priority, dates, labels, or
   * another column and lane (from a template).
   */
  const createTask = useCallback(
    async (title: string, laneId: number, extra?: Partial<TaskInput>): Promise<Task> => {
      const task = await tasksApi.create(projectId, { title, description: '', laneId, ...extra });
      setCells((current) => addTask(current, task));
      return task;
    },
    [projectId],
  );

  const updateTask = useCallback(
    async (id: number, patch: TaskPatch): Promise<void> => {
      const saved = await tasksApi.update(id, patch);
      setCells((current) => refreshLinkedTask(replaceTask(current, saved), saved, columns));
    },
    [columns],
  );

  /** Applies an upload or removal to the task's attachment list. */
  const updateAttachments = useCallback((taskId: number, update: (attachments: Attachment[]) => Attachment[]) => {
    setCells((current) => {
      const task = Object.values(current).flat().find((t) => t.id === taskId);
      return task ? replaceTask(current, { ...task, attachments: update(task.attachments) }) : current;
    });
  }, []);

  /** Links show on both tasks, so both are replaced with the server's versions. */
  const addLink = useCallback(async (id: number, targetId: number, kind: LinkKind): Promise<void> => {
    const { task, target } = await tasksApi.addLink(id, targetId, kind);
    setCells((current) => replaceTask(replaceTask(current, task), target));
  }, []);

  const removeLink = useCallback(async (id: number, linkId: number): Promise<void> => {
    const { task, target } = await tasksApi.removeLink(id, linkId);
    setCells((current) => replaceTask(replaceTask(current, task), target));
  }, []);

  /** Changes dates right away (e.g. dragged in the calendar) and then saves; a failed save reloads the board. */
  const rescheduleTask = useCallback(
    async (id: number, patch: Pick<TaskPatch, 'startDate' | 'dueDate'>) => {
      setCells((current) => {
        const task = Object.values(current).flat().find((t) => t.id === id);
        return task ? replaceTask(current, { ...task, ...patch }) : current;
      });
      try {
        const saved = await tasksApi.update(id, patch);
        setCells((current) => replaceTask(current, saved));
      } catch {
        failed('Der Termin konnte nicht gespeichert werden. Die Daten wurden neu geladen.');
      }
    },
    [failed],
  );

  const deleteTask = useCallback(async (id: number): Promise<void> => {
    await tasksApi.remove(id);
    setCells((current) => dropLinksTo(removeTask(current, id), id));
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

  /** A new label; resolves to it (e.g. to assign it right away), or undefined if it could not be created. */
  const createLabel = useCallback(
    async (name: string, color: ProjectColor): Promise<Label | undefined> => {
      try {
        const label = await labelsApi.create(projectId, { name, color });
        setActionError(null);
        setLabels((current) => [...current, label]);
        return label;
      } catch (error) {
        setActionError(boardErrorMessage('label', error));
        return undefined;
      }
    },
    [projectId],
  );

  return {
    columns,
    lanes,
    labels,
    cells,
    flashId,
    status,
    actionError,
    dismissError: () => setActionError(null),
    reload,
    moveTask,
    createTask,
    updateTask,
    addLink,
    removeLink,
    updateAttachments,
    rescheduleTask,
    deleteTask,
    moveColumn,
    moveLane,
    addColumn: (name: string) => change('column', () => columnsApi.create(projectId, { name })),
    updateColumn: (id: number, patch: { name?: string; wipLimit?: number | null }) =>
      change('column', () => columnsApi.update(id, patch)),
    setColumnWidths,
    deleteColumn: (id: number, moveTasksTo?: number) => change('column', () => columnsApi.remove(id, moveTasksTo)),
    addLane: (name: string) => change('lane', () => lanesApi.create(projectId, name)),
    renameLane: (id: number, name: string) => change('lane', () => lanesApi.rename(id, name)),
    deleteLane: (id: number, moveTasksTo?: number) => change('lane', () => lanesApi.remove(id, moveTasksTo)),
    createLabel,
    // Renaming, recoloring and deleting change the chips on the cards, so the board reloads.
    updateLabel: (id: number, patch: { name?: string; color?: ProjectColor }) => change('label', () => labelsApi.update(id, patch)),
    moveLabel: (id: number, index: number) => change('label', () => labelsApi.move(id, index)),
    deleteLabel: (id: number) => change('label', () => labelsApi.remove(id)),
  };
}

export type BoardState = ReturnType<typeof useBoard>;

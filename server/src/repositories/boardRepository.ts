import type { Db } from '../database.js';
import { TASK_STATUSES, type TaskStatus } from './tasksRepository.js';

export interface BoardColumn {
  status: TaskStatus;
  /** Maximum number of tasks before the column is shown as over its limit; null means unlimited. */
  wipLimit: number | null;
}

export type BoardRepository = ReturnType<typeof createBoardRepository>;

/** Board settings per project; the rows are created together with the project. */
export function createBoardRepository(db: Db) {
  const selectColumns = db.prepare<[number], { status: TaskStatus; wip_limit: number | null }>(
    `SELECT status, wip_limit FROM board_columns WHERE project_id = ?`,
  );
  const updateWipLimit = db.prepare<[number | null, number, TaskStatus]>(
    `UPDATE board_columns SET wip_limit = ? WHERE project_id = ? AND status = ?`,
  );

  function listColumns(projectId: number): BoardColumn[] {
    const limits = new Map(selectColumns.all(projectId).map((row) => [row.status, row.wip_limit]));
    return TASK_STATUSES.map((status) => ({ status, wipLimit: limits.get(status) ?? null }));
  }

  return {
    listColumns,

    setWipLimit(projectId: number, status: TaskStatus, wipLimit: number | null): BoardColumn {
      updateWipLimit.run(wipLimit, projectId, status);
      return listColumns(projectId).find((column) => column.status === status)!;
    },
  };
}

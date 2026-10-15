import type { Db } from '../database.js';
import { TASK_STATUSES, type TaskStatus } from './tasksRepository.js';

export interface BoardColumn {
  status: TaskStatus;
  /** Maximum number of tasks before the column is shown as over its limit; null means unlimited. */
  wipLimit: number | null;
}

export type BoardRepository = ReturnType<typeof createBoardRepository>;

export function createBoardRepository(db: Db) {
  const selectColumns = db.prepare<[], { status: TaskStatus; wip_limit: number | null }>(
    `SELECT status, wip_limit FROM board_columns`,
  );
  const updateWipLimit = db.prepare<[number | null, TaskStatus]>(
    `UPDATE board_columns SET wip_limit = ? WHERE status = ?`,
  );

  function listColumns(): BoardColumn[] {
    const limits = new Map(selectColumns.all().map((row) => [row.status, row.wip_limit]));
    return TASK_STATUSES.map((status) => ({ status, wipLimit: limits.get(status) ?? null }));
  }

  return {
    listColumns,

    setWipLimit(status: TaskStatus, wipLimit: number | null): BoardColumn {
      updateWipLimit.run(wipLimit, status);
      return listColumns().find((column) => column.status === status)!;
    },
  };
}

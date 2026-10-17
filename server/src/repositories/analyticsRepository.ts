import { buildReport, resolveRange, type AnalyticsInput, type BoardEvent, type Granularity } from '../analytics.js';
import type { Db } from '../database.js';

interface TaskEventRow {
  entity_id: number;
  action_type: 'create' | 'move' | 'delete' | 'restore';
  created_at: string;
  title: string | null;
  create_column_id: number | null;
  column_name: string | null;
  column_id: number | null;
  from_column_id: number | null;
  to_column_id: number | null;
}

interface ColumnEventRow {
  entity_id: number;
  action_type: 'update' | 'delete';
  created_at: string;
  name: string;
  limit_from: number | null;
  limit_to: number | null;
  moved_tasks: number | null;
  target_id: number | null;
}

export type AnalyticsRepository = ReturnType<typeof createAnalyticsRepository>;

/** Reads what the analytics need; the figures themselves are computed in analytics.ts. */
export function createAnalyticsRepository(db: Db) {
  const selectColumns = db.prepare<[number], { id: number; name: string; wip_limit: number | null }>(
    `SELECT id, name, wip_limit FROM board_columns WHERE project_id = ? ORDER BY position, id`,
  );
  const selectTaskCounts = db.prepare<[number], { column_id: number; n: number }>(
    `SELECT column_id, COUNT(*) AS n FROM live_tasks WHERE project_id = ? GROUP BY column_id`,
  );
  // The tasks table, not live_tasks: work on tasks that went to the trash afterwards still counts.
  const selectTasks = db.prepare<[number], { id: number; title: string; created_at: string; trashed: number }>(
    `SELECT id, title, created_at, deleted_at IS NOT NULL AS trashed FROM tasks WHERE project_id = ?`,
  );
  const selectCoverageStart = db.prepare<[number], { first: string | null }>(
    `SELECT MIN(created_at) AS first FROM activities WHERE project_id = ?`,
  );
  // "column" is an object on "create" entries and a name on "delete"/"restore" entries.
  const selectTaskEvents = db.prepare<[number], TaskEventRow>(
    `SELECT entity_id, action_type, created_at,
       json_extract(metadata, '$.title') AS title,
       json_extract(metadata, '$.column.id') AS create_column_id,
       CASE WHEN json_type(metadata, '$.column') = 'text' THEN json_extract(metadata, '$.column') END AS column_name,
       json_extract(metadata, '$.columnId') AS column_id,
       json_extract(metadata, '$.from.columnId') AS from_column_id,
       json_extract(metadata, '$.to.columnId') AS to_column_id
     FROM activities
     WHERE project_id = ? AND entity_type = 'task' AND entity_id IS NOT NULL
       AND action_type IN ('create', 'move', 'delete', 'restore')
     ORDER BY id`,
  );
  const selectColumnEvents = db.prepare<[number], ColumnEventRow>(
    `SELECT entity_id, action_type, created_at,
       json_extract(metadata, '$.name') AS name,
       json_extract(metadata, '$.wipLimit.from') AS limit_from,
       json_extract(metadata, '$.wipLimit.to') AS limit_to,
       json_extract(metadata, '$.movedTasks') AS moved_tasks,
       json_extract(metadata, '$.target.id') AS target_id
     FROM activities
     WHERE project_id = ? AND entity_type = 'board' AND entity_id IS NOT NULL
       AND json_extract(metadata, '$.kind') = 'column'
       AND (action_type = 'delete' OR (action_type = 'update' AND json_type(metadata, '$.wipLimit') IS NOT NULL))
     ORDER BY id`,
  );

  function toTaskEvent(row: TaskEventRow): BoardEvent | undefined {
    const at = Date.parse(row.created_at);
    const base = { at, taskId: row.entity_id };
    switch (row.action_type) {
      case 'create':
        return { type: 'task-create', ...base, title: row.title ?? '', columnId: row.create_column_id };
      case 'move':
        if (row.from_column_id === null || row.to_column_id === null) return undefined;
        return { type: 'task-move', ...base, title: row.title ?? '', fromColumnId: row.from_column_id, toColumnId: row.to_column_id };
      case 'delete':
      case 'restore':
        return {
          type: row.action_type === 'delete' ? 'task-trash' : 'task-restore',
          ...base,
          columnId: row.column_id,
          columnName: row.column_name ?? '',
        };
    }
  }

  function toColumnEvent(row: ColumnEventRow): BoardEvent {
    const at = Date.parse(row.created_at);
    return row.action_type === 'update'
      ? { type: 'wip-limit', at, columnId: row.entity_id, from: row.limit_from, to: row.limit_to }
      : { type: 'column-delete', at, columnId: row.entity_id, name: row.name, movedTasks: row.moved_tasks ?? 0, targetId: row.target_id };
  }

  return {
    report(projectId: number, query: { from?: string; to?: string; granularity: Granularity; timeZone: string }, now = new Date()) {
      const coverageStart = selectCoverageStart.get(projectId)?.first ?? null;
      // Both lists are in log order; merged by time, task entries first at the same instant.
      const events = [
        ...selectTaskEvents.all(projectId).flatMap((row) => toTaskEvent(row) ?? []),
        ...selectColumnEvents.all(projectId).map(toColumnEvent),
      ].sort((a, b) => a.at - b.at);

      const input: AnalyticsInput = {
        columns: selectColumns.all(projectId).map((row) => ({ id: row.id, name: row.name, wipLimit: row.wip_limit })),
        taskCounts: new Map(selectTaskCounts.all(projectId).map((row) => [row.column_id, row.n])),
        tasks: new Map(
          selectTasks.all(projectId).map((row) => [row.id, { title: row.title, createdAt: Date.parse(row.created_at), live: row.trashed === 0 }]),
        ),
        events,
        coverageStart: coverageStart === null ? null : Date.parse(coverageStart),
        now: now.getTime(),
      };
      return buildReport(input, resolveRange(query, now.getTime()));
    },
  };
}

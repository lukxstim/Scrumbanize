import type { Db } from '../database.js';
import { positionForIndex } from '../positions.js';

export const MAX_COLUMNS = 20;
export const MAX_LANES = 20;

/** The board a new project starts with. */
export const DEFAULT_COLUMNS: { name: string; wipLimit: number | null }[] = [
  { name: 'Backlog', wipLimit: null },
  { name: 'To Do', wipLimit: null },
  { name: 'In Progress', wipLimit: 3 },
  { name: 'Review', wipLimit: null },
  { name: 'Done', wipLimit: null },
];
export const DEFAULT_LANE = 'Standard';

export interface BoardColumn {
  id: number;
  name: string;
  position: number;
  /** Maximum number of tasks (across all lanes) before the column shows as over its limit; null means none. */
  wipLimit: number | null;
}

export interface Lane {
  id: number;
  name: string;
  position: number;
}

/** Why a change to a column or lane was refused. */
export type BoardFailure = 'not_found' | 'name_taken' | 'limit_reached' | 'last_item' | 'not_empty' | 'invalid_target';
export type BoardResult<T> = { ok: true; value: T } | { ok: false; reason: BoardFailure };

interface ItemRow {
  id: number;
  project_id: number;
  name: string;
  position: number;
  wip_limit?: number | null;
}

const sameName = (a: string, b: string) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');

/**
 * Columns and lanes are both ordered, named lists per project that tasks point into, so they share this code.
 * `taskField` is the tasks column that references them.
 */
function orderedList<T>(
  db: Db,
  options: { table: 'board_columns' | 'lanes'; taskField: 'column_id' | 'lane_id'; max: number; toItem: (row: ItemRow) => T },
) {
  const { table, taskField, max, toItem } = options;
  const selectItem = db.prepare<[number], ItemRow>(`SELECT * FROM ${table} WHERE id = ?`);
  const selectItems = db.prepare<[number], ItemRow>(`SELECT * FROM ${table} WHERE project_id = ? ORDER BY position, id`);
  const insertItem = db.prepare<[number, string, number], { id: number }>(
    `INSERT INTO ${table} (project_id, name, position) VALUES (?, ?, ?) RETURNING id`,
  );
  const updateName = db.prepare<[string, number]>(`UPDATE ${table} SET name = ? WHERE id = ?`);
  const updatePosition = db.prepare<[number, number]>(`UPDATE ${table} SET position = ? WHERE id = ?`);
  const deleteItem = db.prepare<[number]>(`DELETE FROM ${table} WHERE id = ?`);
  const countTasks = db.prepare<[number], { n: number }>(`SELECT COUNT(*) AS n FROM tasks WHERE ${taskField} = ?`);
  const maxTaskPosition = db.prepare<[number], { max: number }>(
    `SELECT COALESCE(MAX(position), 0) AS max FROM tasks WHERE ${taskField} = ?`,
  );
  // Moved tasks go after the target's existing tasks, keeping their own order.
  const reassignTasks = db.prepare<[number, number, string, number]>(
    `UPDATE tasks SET ${taskField} = ?, position = position + ?, updated_at = ? WHERE ${taskField} = ?`,
  );

  const list = (projectId: number) => selectItems.all(projectId).map(toItem);
  const nameTaken = (projectId: number, name: string, exceptId?: number) =>
    selectItems.all(projectId).some((row) => row.id !== exceptId && sameName(row.name, name));

  return {
    list,
    row: (id: number) => selectItem.get(id),

    create(projectId: number, name: string): BoardResult<number> {
      const rows = selectItems.all(projectId);
      if (rows.length >= max) return { ok: false, reason: 'limit_reached' };
      if (nameTaken(projectId, name)) return { ok: false, reason: 'name_taken' };
      const position = (rows.at(-1)?.position ?? 0) + 1;
      return { ok: true, value: insertItem.get(projectId, name, position)!.id };
    },

    rename(id: number, name: string): BoardResult<ItemRow> {
      const row = selectItem.get(id);
      if (!row) return { ok: false, reason: 'not_found' };
      if (nameTaken(row.project_id, name, id)) return { ok: false, reason: 'name_taken' };
      updateName.run(name, id);
      return { ok: true, value: row };
    },

    /** Places the item at `index` among the project's other items. */
    move(id: number, index: number): BoardResult<ItemRow> {
      const row = selectItem.get(id);
      if (!row) return { ok: false, reason: 'not_found' };
      const siblings = selectItems.all(row.project_id).filter((r) => r.id !== id);
      const { position, renumbered } = positionForIndex(siblings, index);
      for (const sibling of renumbered) updatePosition.run(sibling.position, sibling.id);
      updatePosition.run(position, id);
      return { ok: true, value: row };
    },

    /** Moves the item's tasks to `moveTasksTo` first; required when there are tasks. The last item stays. */
    remove(id: number, moveTasksTo: number | undefined): BoardResult<ItemRow> {
      const row = selectItem.get(id);
      if (!row) return { ok: false, reason: 'not_found' };
      if (selectItems.all(row.project_id).length <= 1) return { ok: false, reason: 'last_item' };

      if (countTasks.get(id)!.n > 0) {
        if (moveTasksTo === undefined) return { ok: false, reason: 'not_empty' };
        const target = selectItem.get(moveTasksTo);
        if (!target || target.id === id || target.project_id !== row.project_id) {
          return { ok: false, reason: 'invalid_target' };
        }
        reassignTasks.run(target.id, maxTaskPosition.get(target.id)!.max, new Date().toISOString(), id);
      }
      deleteItem.run(id);
      return { ok: true, value: row };
    },
  };
}

export type BoardRepository = ReturnType<typeof createBoardRepository>;

export function createBoardRepository(db: Db) {
  const columns = orderedList(db, {
    table: 'board_columns',
    taskField: 'column_id',
    max: MAX_COLUMNS,
    toItem: (row): BoardColumn => ({ id: row.id, name: row.name, position: row.position, wipLimit: row.wip_limit ?? null }),
  });
  const lanes = orderedList(db, {
    table: 'lanes',
    taskField: 'lane_id',
    max: MAX_LANES,
    toItem: (row): Lane => ({ id: row.id, name: row.name, position: row.position }),
  });
  const updateWipLimit = db.prepare<[number | null, number]>(`UPDATE board_columns SET wip_limit = ? WHERE id = ?`);
  const insertColumn = db.prepare<[number, string, number, number | null]>(
    `INSERT INTO board_columns (project_id, name, position, wip_limit) VALUES (?, ?, ?, ?)`,
  );
  const insertLane = db.prepare<[number, string]>(`INSERT INTO lanes (project_id, name, position) VALUES (?, ?, 1)`);

  const columnById = (id: number) => {
    const row = columns.row(id);
    return row && columns.list(row.project_id).find((c) => c.id === id)!;
  };
  const laneById = (id: number) => {
    const row = lanes.row(id);
    return row && lanes.list(row.project_id).find((l) => l.id === id)!;
  };

  /** Turns a successful result into the item's current state, read after the change. */
  function then<T>(result: BoardResult<unknown>, read: () => T | undefined): BoardResult<T> {
    return result.ok ? { ok: true, value: read()! } : result;
  }

  return {
    listColumns: columns.list,
    listLanes: lanes.list,

    /** The project a column or lane belongs to, or undefined if it does not exist. */
    columnProjectId: (id: number) => columns.row(id)?.project_id,
    laneProjectId: (id: number) => lanes.row(id)?.project_id,

    /** Five standard columns and one lane, for a new project. */
    createDefaults(projectId: number): void {
      DEFAULT_COLUMNS.forEach((column, i) => insertColumn.run(projectId, column.name, i + 1, column.wipLimit));
      insertLane.run(projectId, DEFAULT_LANE);
    },

    createColumn: db.transaction((projectId: number, input: { name: string; wipLimit?: number | null }) => {
      const result = columns.create(projectId, input.name);
      if (result.ok && input.wipLimit != null) updateWipLimit.run(input.wipLimit, result.value);
      return then(result, () => (result.ok ? columnById(result.value) : undefined));
    }),

    updateColumn: db.transaction((id: number, patch: { name?: string; wipLimit?: number | null }) => {
      if (!columns.row(id)) return { ok: false, reason: 'not_found' } as const;
      if (patch.name !== undefined) {
        const renamed = columns.rename(id, patch.name);
        if (!renamed.ok) return renamed;
      }
      if (patch.wipLimit !== undefined) updateWipLimit.run(patch.wipLimit, id);
      return { ok: true, value: columnById(id)! } as const;
    }),

    moveColumn: db.transaction((id: number, index: number) => then(columns.move(id, index), () => columnById(id))),
    deleteColumn: db.transaction((id: number, moveTasksTo?: number) => then(columns.remove(id, moveTasksTo), () => null)),

    createLane: db.transaction((projectId: number, name: string) => {
      const result = lanes.create(projectId, name);
      return then(result, () => (result.ok ? laneById(result.value) : undefined));
    }),
    renameLane: db.transaction((id: number, name: string) => then(lanes.rename(id, name), () => laneById(id))),
    moveLane: db.transaction((id: number, index: number) => then(lanes.move(id, index), () => laneById(id))),
    deleteLane: db.transaction((id: number, moveTasksTo?: number) => then(lanes.remove(id, moveTasksTo), () => null)),
  };
}

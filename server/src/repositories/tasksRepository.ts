import type { Db } from '../database.js';
import { positionForIndex } from '../positions.js';
import type { TaskInput, TaskPatch } from '../validation.js';

export interface Task {
  id: number;
  projectId: number;
  columnId: number;
  laneId: number;
  title: string;
  description: string;
  /** Order within the task's cell (column × lane), ascending. */
  position: number;
  /** The note the task was created from; null if it was created elsewhere or the note was deleted. */
  sourceNote: { id: number; title: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** The short form of a task that notes carry. */
export interface LinkedTask {
  id: number;
  title: string;
  column: { id: number; name: string };
}

interface TaskRow {
  id: number;
  project_id: number;
  column_id: number;
  lane_id: number;
  title: string;
  description: string;
  position: number;
  source_note_id: number | null;
  source_note_title: string | null;
  created_at: string;
  updated_at: string;
}

const selectTaskSql = `
  SELECT t.*, n.title AS source_note_title
  FROM tasks t LEFT JOIN notes n ON n.id = t.source_note_id`;

export type MoveResult = { ok: true; task: Task } | { ok: false; reason: 'not_found' | 'invalid_target' };

export type TasksRepository = ReturnType<typeof createTasksRepository>;

export function createTasksRepository(db: Db) {
  const selectNoteProject = db.prepare<[number], { project_id: number }>(`SELECT project_id FROM notes WHERE id = ?`);
  const selectFirstColumn = db.prepare<[number], { id: number }>(
    `SELECT id FROM board_columns WHERE project_id = ? ORDER BY position, id LIMIT 1`,
  );
  const selectFirstLane = db.prepare<[number], { id: number }>(
    `SELECT id FROM lanes WHERE project_id = ? ORDER BY position, id LIMIT 1`,
  );
  const selectColumnProject = db.prepare<[number], { project_id: number }>(
    `SELECT project_id FROM board_columns WHERE id = ?`,
  );
  const selectLaneProject = db.prepare<[number], { project_id: number }>(`SELECT project_id FROM lanes WHERE id = ?`);
  const nextCellPosition = db.prepare<[number, number], { position: number }>(
    `SELECT COALESCE(MAX(position), 0) + 1 AS position FROM tasks WHERE column_id = ? AND lane_id = ?`,
  );
  const insertTask = db.prepare<
    [number, number, number, string, string, number, number | null, string, string],
    { id: number }
  >(
    `INSERT INTO tasks (project_id, column_id, lane_id, title, description, position, source_note_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
  );
  const selectTask = db.prepare<[number], TaskRow>(`${selectTaskSql} WHERE t.id = ?`);
  const selectProjectTasks = db.prepare<[number], TaskRow>(
    `${selectTaskSql}
     JOIN board_columns c ON c.id = t.column_id
     JOIN lanes l ON l.id = t.lane_id
     WHERE t.project_id = ?
     ORDER BY c.position, l.position, t.position, t.id`,
  );
  const deleteTask = db.prepare<[number]>(`DELETE FROM tasks WHERE id = ?`);
  const updateTask = db.prepare<[string | null, string | null, string, number]>(
    `UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description), updated_at = ? WHERE id = ?`,
  );
  const selectCellSiblings = db.prepare<[number, number, number], { id: number; position: number }>(
    `SELECT id, position FROM tasks WHERE column_id = ? AND lane_id = ? AND id != ? ORDER BY position, id`,
  );
  const updatePlacement = db.prepare<[number, number, number, string, number]>(
    `UPDATE tasks SET column_id = ?, lane_id = ?, position = ?, updated_at = ? WHERE id = ?`,
  );
  const updatePosition = db.prepare<[number, number]>(`UPDATE tasks SET position = ? WHERE id = ?`);

  function toTask(row: TaskRow): Task {
    return {
      id: row.id,
      projectId: row.project_id,
      columnId: row.column_id,
      laneId: row.lane_id,
      title: row.title,
      description: row.description,
      position: row.position,
      sourceNote:
        row.source_note_id === null ? null : { id: row.source_note_id, title: row.source_note_title ?? '' },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  return {
    /** The project a note belongs to, or undefined if the note does not exist. */
    noteProjectId(noteId: number): number | undefined {
      return selectNoteProject.get(noteId)?.project_id;
    },

    /** The project's tasks in board order: by column, lane, then position. */
    list(projectId: number): Task[] {
      return selectProjectTasks.all(projectId).map(toTask);
    },

    get(id: number): Task | undefined {
      const row = selectTask.get(id);
      return row && toTask(row);
    },

    /**
     * New tasks start at the end of the first column, in `laneId` or the first lane.
     * The caller checks that the lane belongs to the project.
     */
    create: db.transaction((projectId: number, input: TaskInput): Task => {
      const now = new Date().toISOString();
      const columnId = selectFirstColumn.get(projectId)!.id;
      const laneId = input.laneId ?? selectFirstLane.get(projectId)!.id;
      const { position } = nextCellPosition.get(columnId, laneId)!;
      const sourceNoteId = input.sourceNoteId ?? null;
      const { id } = insertTask.get(
        projectId,
        columnId,
        laneId,
        input.title,
        input.description,
        position,
        sourceNoteId,
        now,
        now,
      )!;
      return toTask(selectTask.get(id)!);
    }),

    /** Changes title and/or description. Returns undefined if the task does not exist. */
    update: db.transaction((id: number, patch: TaskPatch): Task | undefined => {
      updateTask.run(patch.title ?? null, patch.description ?? null, new Date().toISOString(), id);
      const row = selectTask.get(id);
      return row && toTask(row);
    }),

    /**
     * Places the task at `index` among the other tasks of the cell (column × lane), clamped to the end.
     * Column and lane must belong to the task's project.
     */
    move: db.transaction((id: number, columnId: number, laneId: number, index: number): MoveResult => {
      const task = selectTask.get(id);
      if (!task) return { ok: false, reason: 'not_found' };
      if (
        selectColumnProject.get(columnId)?.project_id !== task.project_id ||
        selectLaneProject.get(laneId)?.project_id !== task.project_id
      ) {
        return { ok: false, reason: 'invalid_target' };
      }

      const { position, renumbered } = positionForIndex(selectCellSiblings.all(columnId, laneId, id), index);
      for (const sibling of renumbered) updatePosition.run(sibling.position, sibling.id);
      updatePlacement.run(columnId, laneId, position, new Date().toISOString(), id);
      return { ok: true, task: toTask(selectTask.get(id)!) };
    }),

    /** Returns false if the task did not exist. */
    remove(id: number): boolean {
      return deleteTask.run(id).changes > 0;
    },
  };
}

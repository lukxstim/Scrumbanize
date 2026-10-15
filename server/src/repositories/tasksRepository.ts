import type { Db } from '../database.js';
import type { TaskInput, TaskPatch } from '../validation.js';

/** Board columns in display order. */
export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The "active" columns that can have a WIP limit; Backlog and Done are always unlimited. */
export const WIP_LIMITED_STATUSES = ['todo', 'in_progress', 'review'] as const;

/** Below this gap between neighbours, a column's positions are renumbered instead of halved again. */
const MIN_POSITION_GAP = 1e-6;

export interface Task {
  id: number;
  projectId: number;
  title: string;
  description: string;
  status: TaskStatus;
  /** Order within the task's column, ascending. */
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
  status: TaskStatus;
}

interface TaskRow {
  id: number;
  project_id: number;
  title: string;
  description: string;
  status: TaskStatus;
  position: number;
  source_note_id: number | null;
  source_note_title: string | null;
  created_at: string;
  updated_at: string;
}

const selectTaskSql = `
  SELECT t.*, n.title AS source_note_title
  FROM tasks t LEFT JOIN notes n ON n.id = t.source_note_id`;

const statusOrderSql = `CASE t.status ${TASK_STATUSES.map((s, i) => `WHEN '${s}' THEN ${i}`).join(' ')} END`;

export type TasksRepository = ReturnType<typeof createTasksRepository>;

export function createTasksRepository(db: Db) {
  const selectNoteProject = db.prepare<[number], { project_id: number }>(`SELECT project_id FROM notes WHERE id = ?`);
  const nextBacklogPosition = db.prepare<[number], { position: number }>(
    `SELECT COALESCE(MAX(position), 0) + 1 AS position FROM tasks WHERE project_id = ? AND status = 'backlog'`,
  );
  const insertTask = db.prepare<[number, string, string, number, number | null, string, string], { id: number }>(
    `INSERT INTO tasks (project_id, title, description, status, position, source_note_id, created_at, updated_at)
     VALUES (?, ?, ?, 'backlog', ?, ?, ?, ?) RETURNING id`,
  );
  const selectTask = db.prepare<[number], TaskRow>(`${selectTaskSql} WHERE t.id = ?`);
  const selectProjectTasks = db.prepare<[number], TaskRow>(
    `${selectTaskSql} WHERE t.project_id = ? ORDER BY ${statusOrderSql}, t.position, t.id`,
  );
  const deleteTask = db.prepare<[number]>(`DELETE FROM tasks WHERE id = ?`);
  const updateTask = db.prepare<[string | null, string | null, string, number]>(
    `UPDATE tasks SET title = COALESCE(?, title), description = COALESCE(?, description), updated_at = ? WHERE id = ?`,
  );
  const selectColumnSiblings = db.prepare<[number, TaskStatus, number], { id: number; position: number }>(
    `SELECT id, position FROM tasks WHERE project_id = ? AND status = ? AND id != ? ORDER BY position, id`,
  );
  const updatePlacement = db.prepare<[TaskStatus, number, string, number]>(
    `UPDATE tasks SET status = ?, position = ?, updated_at = ? WHERE id = ?`,
  );
  const updatePosition = db.prepare<[number, number]>(`UPDATE tasks SET position = ? WHERE id = ?`);

  function toTask(row: TaskRow): Task {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      description: row.description,
      status: row.status,
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

    /** The project's tasks in board order: by column, then position. */
    list(projectId: number): Task[] {
      return selectProjectTasks.all(projectId).map(toTask);
    },

    get(id: number): Task | undefined {
      const row = selectTask.get(id);
      return row && toTask(row);
    },

    /** New tasks always start at the end of the backlog. */
    create: db.transaction((projectId: number, input: TaskInput): Task => {
      const now = new Date().toISOString();
      const { position } = nextBacklogPosition.get(projectId)!;
      const sourceNoteId = input.sourceNoteId ?? null;
      const { id } = insertTask.get(projectId, input.title, input.description, position, sourceNoteId, now, now)!;
      return toTask(selectTask.get(id)!);
    }),

    /** Changes title and/or description. Returns undefined if the task does not exist. */
    update: db.transaction((id: number, patch: TaskPatch): Task | undefined => {
      updateTask.run(patch.title ?? null, patch.description ?? null, new Date().toISOString(), id);
      const row = selectTask.get(id);
      return row && toTask(row);
    }),

    /**
     * Places the task at `index` among the other tasks of column `status` in its project (clamped to the end).
     * Only the moved task's position changes, unless its neighbours are too close and the column is renumbered.
     * Returns undefined if the task does not exist.
     */
    move: db.transaction((id: number, status: TaskStatus, index: number): Task | undefined => {
      const task = selectTask.get(id);
      if (!task) return undefined;

      const siblings = selectColumnSiblings.all(task.project_id, status, id);
      const at = Math.min(index, siblings.length);
      const prev = siblings[at - 1];
      const next = siblings[at];

      let position: number;
      if (prev && next) {
        position = (prev.position + next.position) / 2;
      } else if (prev) {
        position = prev.position + 1;
      } else if (next) {
        position = next.position - 1;
      } else {
        position = 1;
      }

      if (prev && next && next.position - prev.position < MIN_POSITION_GAP) {
        siblings.forEach((sibling, i) => updatePosition.run(i < at ? i + 1 : i + 2, sibling.id));
        position = at + 1;
      }

      updatePlacement.run(status, position, new Date().toISOString(), id);
      return toTask(selectTask.get(id)!);
    }),

    /** Returns false if the task did not exist. */
    remove(id: number): boolean {
      return deleteTask.run(id).changes > 0;
    },
  };
}

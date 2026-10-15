import type { Db } from '../database.js';
import type { TaskInput } from '../validation.js';

/** Board columns in display order. */
export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Task {
  id: number;
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
  const noteExists = db.prepare<[number], { found: 1 }>(`SELECT 1 AS found FROM notes WHERE id = ?`);
  const nextBacklogPosition = db.prepare<[], { position: number }>(
    `SELECT COALESCE(MAX(position), 0) + 1 AS position FROM tasks WHERE status = 'backlog'`,
  );
  const insertTask = db.prepare<[string, string, number, number | null, string, string], { id: number }>(
    `INSERT INTO tasks (title, description, status, position, source_note_id, created_at, updated_at)
     VALUES (?, ?, 'backlog', ?, ?, ?, ?) RETURNING id`,
  );
  const selectTask = db.prepare<[number], TaskRow>(`${selectTaskSql} WHERE t.id = ?`);
  const selectAllTasks = db.prepare<[], TaskRow>(`${selectTaskSql} ORDER BY ${statusOrderSql}, t.position, t.id`);
  const deleteTask = db.prepare<[number]>(`DELETE FROM tasks WHERE id = ?`);

  function toTask(row: TaskRow): Task {
    return {
      id: row.id,
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
    noteExists(id: number): boolean {
      return noteExists.get(id) !== undefined;
    },

    list(): Task[] {
      return selectAllTasks.all().map(toTask);
    },

    get(id: number): Task | undefined {
      const row = selectTask.get(id);
      return row && toTask(row);
    },

    /** New tasks always start at the end of the backlog. */
    create: db.transaction((input: TaskInput): Task => {
      const now = new Date().toISOString();
      const { position } = nextBacklogPosition.get()!;
      const { id } = insertTask.get(input.title, input.description, position, input.sourceNoteId ?? null, now, now)!;
      return toTask(selectTask.get(id)!);
    }),

    /** Returns false if the task did not exist. */
    remove(id: number): boolean {
      return deleteTask.run(id).changes > 0;
    },
  };
}

import type { Db } from '../database.js';
import type { TaskPriority } from '../validation.js';
import { isDoneSql } from './doneColumn.js';

export type RemindersRepository = ReturnType<typeof createRemindersRepository>;

/** A task the desktop app reminds about: due on or before the given day and not done yet. */
export interface DueTask {
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  dueDate: string;
  priority: TaskPriority | null;
}

/** Tasks to remind about, across all projects (US-18). */
export function createRemindersRepository(db: Db) {
  const selectDue = db.prepare<
    [string],
    { id: number; project_id: number; project_name: string; title: string; due_date: string; priority: TaskPriority | null }
  >(
    `SELECT t.id, t.project_id, p.name AS project_name, t.title, t.due_date, t.priority
     FROM live_tasks t JOIN live_projects p ON p.id = t.project_id
     WHERE t.due_date <= ? AND NOT ${isDoneSql('t')}
     ORDER BY t.due_date,
       CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
       t.id`,
  );

  return {
    /** Open tasks due on `today` (YYYY-MM-DD) or earlier, the oldest due date first, then by priority. */
    due: (today: string): DueTask[] =>
      selectDue.all(today).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name,
        title: row.title,
        dueDate: row.due_date,
        priority: row.priority,
      })),
  };
}

import { text } from '../activityText.js';
import type { Db } from '../database.js';
import { createActivityRepository } from './activityRepository.js';
import { createNotesRepository } from './notesRepository.js';
import { createProjectsRepository, type ProjectColor } from './projectsRepository.js';
import { snippetAround } from './searchRepository.js';
import { createTasksRepository } from './tasksRepository.js';
import type { TrashType } from '../validation.js';

/** One entry of the trash. Notes and tasks of a trashed project are not listed; they come back with it. */
export interface TrashItem {
  type: TrashType;
  id: number;
  /** For a project its own id. */
  projectId: number;
  projectName: string;
  projectColor: ProjectColor;
  title: string;
  deletedAt: string;
  /** Notes: the start of the content. */
  snippet?: string;
  /** Tasks: the column they come back to. */
  columnName?: string;
  /** Projects: what comes back with them (items trashed on their own before stay in the trash). */
  noteCount?: number;
  taskCount?: number;
}

export type TrashRepository = ReturnType<typeof createTrashRepository>;

export function createTrashRepository(db: Db) {
  const notes = createNotesRepository(db);
  const tasks = createTasksRepository(db);
  const projects = createProjectsRepository(db);
  const activities = createActivityRepository(db);

  // `?` is a project id, or NULL for all projects.
  const selectNotes = db.prepare<[number | null, number | null], {
    id: number; project_id: number; project_name: string; color: ProjectColor; title: string; content: string; deleted_at: string;
  }>(
    `SELECT n.id, n.project_id, p.name AS project_name, p.color, n.title, n.content, n.deleted_at
     FROM notes n JOIN live_projects p ON p.id = n.project_id
     WHERE n.deleted_at IS NOT NULL AND (? IS NULL OR n.project_id = ?)`,
  );
  // Tasks of a board that is switched off stay hidden here, too (US-26).
  const selectTasks = db.prepare<[number | null, number | null], {
    id: number; project_id: number; project_name: string; color: ProjectColor; title: string; column_name: string; deleted_at: string;
  }>(
    `SELECT t.id, t.project_id, p.name AS project_name, p.color, t.title, c.name AS column_name, t.deleted_at
     FROM tasks t JOIN live_projects p ON p.id = t.project_id JOIN board_columns c ON c.id = t.column_id
     WHERE t.deleted_at IS NOT NULL AND p.kind = 'project' AND (? IS NULL OR t.project_id = ?)`,
  );
  const selectProjects = db.prepare<[], {
    id: number; name: string; color: ProjectColor; deleted_at: string; note_count: number; task_count: number;
  }>(
    `SELECT p.id, p.name, p.color, p.deleted_at,
       (SELECT COUNT(*) FROM notes WHERE project_id = p.id AND deleted_at IS NULL) AS note_count,
       (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND deleted_at IS NULL) AS task_count
     FROM projects p WHERE p.deleted_at IS NOT NULL`,
  );

  /** Trashed notes and tasks of one project (or all), and all trashed projects; most recently deleted first. */
  function list(projectId?: number): TrashItem[] {
    const scope = projectId ?? null;
    const items: TrashItem[] = [
      ...selectNotes.all(scope, scope).map((row) => ({
        type: 'note' as const,
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name,
        projectColor: row.color,
        title: row.title,
        deletedAt: row.deleted_at,
        snippet: snippetAround(row.content, ''),
      })),
      ...selectTasks.all(scope, scope).map((row) => ({
        type: 'task' as const,
        id: row.id,
        projectId: row.project_id,
        projectName: row.project_name,
        projectColor: row.color,
        title: row.title,
        deletedAt: row.deleted_at,
        columnName: row.column_name,
      })),
      ...selectProjects.all().map((row) => ({
        type: 'project' as const,
        id: row.id,
        projectId: row.id,
        projectName: row.name,
        projectColor: row.color,
        title: row.name,
        deletedAt: row.deleted_at,
        noteCount: row.note_count,
        taskCount: row.task_count,
      })),
    ];
    return items.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt) || b.id - a.id);
  }

  /** Purges the trashed notes and tasks of a project, logged as one entry. */
  function emptyProject(projectId: number): { notes: number; tasks: number } {
    const noteIds = selectNotes.all(projectId, projectId).map((n) => n.id);
    const taskIds = selectTasks.all(projectId, projectId).map((t) => t.id);
    for (const id of taskIds) tasks.purge(id, false);
    for (const id of noteIds) notes.purge(id, false);
    if (noteIds.length + taskIds.length > 0) {
      activities.record({
        projectId,
        entityType: 'project',
        entityId: projectId,
        actionType: 'purge',
        description: text.trashEmptied(noteIds.length, taskIds.length),
        metadata: { notes: noteIds.length, tasks: taskIds.length },
      });
    }
    return { notes: noteIds.length, tasks: taskIds.length };
  }

  return {
    list,

    restore(type: TrashType, id: number) {
      if (type === 'note') return notes.restore(id) && { type, item: notes.get(id)! };
      if (type === 'task') return tasks.restore(id) && { type, item: tasks.get(id)! };
      const result = projects.restore(id);
      return result && { type, item: result.project, renamedFrom: result.renamedFrom };
    },

    /** False if there is no such item in the trash. */
    purge(type: TrashType, id: number): boolean {
      if (type === 'note') return notes.purge(id) !== undefined;
      if (type === 'task') return tasks.purge(id) !== undefined;
      return projects.purge(id) !== undefined;
    },

    /**
     * Empties the trash of one project, or everything including trashed projects – limited to `ownProjects` (those the
     * user owns) when given. Returns what was purged.
     */
    empty: db.transaction((projectId?: number, ownProjects?: Set<number>) => {
      if (projectId !== undefined) return { ...emptyProject(projectId), projects: 0 };
      const mine = (id: number) => !ownProjects || ownProjects.has(id);
      const projectIds = [...new Set([...selectNotes.all(null, null), ...selectTasks.all(null, null)].map((i) => i.project_id))].filter(mine);
      const total = { notes: 0, tasks: 0, projects: 0 };
      for (const id of projectIds) {
        const purged = emptyProject(id);
        total.notes += purged.notes;
        total.tasks += purged.tasks;
      }
      for (const project of selectProjects.all().filter((p) => mine(p.id))) {
        projects.purge(project.id);
        total.projects++;
      }
      return total;
    }),
  };
}

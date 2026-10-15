import type { Db } from '../database.js';
import type { ProjectInput, ProjectPatch } from '../validation.js';
import { createBoardRepository } from './boardRepository.js';

/** Preset colors a project can have; the client maps them to Tailwind colors. */
export const PROJECT_COLORS = ['slate', 'red', 'amber', 'emerald', 'sky', 'indigo', 'violet', 'pink'] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export interface Project {
  id: number;
  name: string;
  color: ProjectColor;
  noteCount: number;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: number;
  name: string;
  color: ProjectColor;
  note_count: number;
  task_count: number;
  created_at: string;
  updated_at: string;
}

export type ProjectResult = { ok: true; project: Project } | { ok: false; reason: 'not_found' | 'name_taken' };

export type ProjectsRepository = ReturnType<typeof createProjectsRepository>;

/** Names are compared like this for uniqueness, so "Studium" and "studium" (and "Ärger" and "ärger") clash. */
const sameName = (a: string, b: string) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');

export function createProjectsRepository(db: Db) {
  const selectProjects = db.prepare<[], ProjectRow>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM notes WHERE project_id = p.id) AS note_count,
       (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) AS task_count
     FROM projects p`,
  );
  const selectNames = db.prepare<[], { id: number; name: string }>(`SELECT id, name FROM projects`);
  const projectExists = db.prepare<[number], { found: 1 }>(`SELECT 1 AS found FROM projects WHERE id = ?`);
  const countProjects = db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM projects`);
  const insertProject = db.prepare<[string, string, string, string], { id: number }>(
    `INSERT INTO projects (name, color, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING id`,
  );
  const board = createBoardRepository(db);
  const updateProject = db.prepare<[string | null, string | null, string, number]>(
    `UPDATE projects SET name = COALESCE(?, name), color = COALESCE(?, color), updated_at = ? WHERE id = ?`,
  );
  const deleteProject = db.prepare<[number]>(`DELETE FROM projects WHERE id = ?`);
  const deleteUnusedTags = db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)`);

  function toProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      noteCount: row.note_count,
      taskCount: row.task_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function nameTaken(name: string, exceptId?: number): boolean {
    return selectNames.all().some((p) => p.id !== exceptId && sameName(p.name, name));
  }

  function list(): Project[] {
    return selectProjects
      .all()
      .map(toProject)
      .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }) || a.id - b.id);
  }

  return {
    list,

    get(id: number): Project | undefined {
      return list().find((p) => p.id === id);
    },

    exists(id: number): boolean {
      return projectExists.get(id) !== undefined;
    },

    /** Also sets up the project's default board: five columns and one lane. */
    create: db.transaction((input: ProjectInput): ProjectResult => {
      if (nameTaken(input.name)) return { ok: false, reason: 'name_taken' };
      const now = new Date().toISOString();
      const { id } = insertProject.get(input.name, input.color, now, now)!;
      board.createDefaults(id);
      return { ok: true, project: list().find((p) => p.id === id)! };
    }),

    update: db.transaction((id: number, patch: ProjectPatch): ProjectResult => {
      if (!projectExists.get(id)) return { ok: false, reason: 'not_found' };
      if (patch.name !== undefined && nameTaken(patch.name, id)) return { ok: false, reason: 'name_taken' };
      updateProject.run(patch.name ?? null, patch.color ?? null, new Date().toISOString(), id);
      return { ok: true, project: list().find((p) => p.id === id)! };
    }),

    /** Deletes the project with all its notes, tasks and board settings. The last project cannot be deleted. */
    remove: db.transaction((id: number): 'deleted' | 'not_found' | 'last_project' => {
      if (!projectExists.get(id)) return 'not_found';
      if (countProjects.get()!.n <= 1) return 'last_project';
      deleteProject.run(id);
      deleteUnusedTags.run();
      return 'deleted';
    }),
  };
}

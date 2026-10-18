import { text } from '../activityText.js';
import { currentUserId } from '../auth/currentUser.js';
import type { Db } from '../database.js';
import type { NotebookIcon, ProjectInput, ProjectPatch } from '../validation.js';
import { createActivityRepository } from './activityRepository.js';
import { createBoardRepository } from './boardRepository.js';
import { createLabelsRepository } from './labelsRepository.js';

/** Preset colors a project can have; the client maps them to Tailwind colors. */
export const PROJECT_COLORS = ['slate', 'red', 'amber', 'emerald', 'sky', 'indigo', 'violet', 'pink'] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

/** A project has a board; a notebook (US-22) only notes, folders and the rest that comes with a project. */
export type ProjectKind = 'project' | 'notebook';

export interface Project {
  id: number;
  name: string;
  color: ProjectColor;
  kind: ProjectKind;
  /** Notebooks: one of the fixed symbols; null for projects. */
  icon: NotebookIcon | null;
  noteCount: number;
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ProjectRow {
  id: number;
  name: string;
  color: ProjectColor;
  kind: ProjectKind;
  icon: NotebookIcon | null;
  note_count: number;
  task_count: number;
  created_at: string;
  updated_at: string;
}

export type ProjectResult = { ok: true; project: Project } | { ok: false; reason: 'not_found' | 'name_taken' };

/** A restored project whose name was taken meanwhile gets a free name like "Studium (2)". */
export type RestoreResult = { project: Project; renamedFrom?: string };

const MAX_NAME_LENGTH = 60;

export type ProjectsRepository = ReturnType<typeof createProjectsRepository>;

/** Names are compared like this for uniqueness, so "Studium" and "studium" (and "Ärger" and "ärger") clash. */
const sameName = (a: string, b: string) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');

export function createProjectsRepository(db: Db) {
  // Everything except trashing, restoring and purging only sees projects outside the trash (live_projects).
  const selectProjects = db.prepare<[], ProjectRow>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM live_notes WHERE project_id = p.id) AS note_count,
       (SELECT COUNT(*) FROM live_tasks WHERE project_id = p.id) AS task_count
     FROM live_projects p`,
  );
  // Names are unique per kind (US-22): a project and a notebook may share one.
  const selectNames = db.prepare<[string], { id: number; name: string }>(`SELECT id, name FROM live_projects WHERE kind = ?`);
  const projectExists = db.prepare<[number], { found: 1 }>(`SELECT 1 AS found FROM live_projects WHERE id = ?`);
  const countProjects = db.prepare<[], { n: number }>(`SELECT COUNT(*) AS n FROM live_projects WHERE kind = 'project'`);
  const selectTrashedProject = db.prepare<[number], { id: number; name: string; kind: ProjectKind }>(
    `SELECT id, name, kind FROM projects WHERE id = ? AND deleted_at IS NOT NULL`,
  );
  const setDeletedAt = db.prepare<[string | null, number]>(`UPDATE projects SET deleted_at = ? WHERE id = ?`);
  const setName = db.prepare<[string, number]>(`UPDATE projects SET name = ? WHERE id = ?`);
  const insertOwner = db.prepare<[number, number, string]>(
    `INSERT INTO project_members (project_id, user_id, role, created_at) VALUES (?, ?, 'owner', ?)`,
  );
  const insertProject = db.prepare<[string, string, ProjectKind, NotebookIcon | null, string, string], { id: number }>(
    `INSERT INTO projects (name, color, kind, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
  );
  const board = createBoardRepository(db);
  const labels = createLabelsRepository(db);
  const activities = createActivityRepository(db);
  const updateProject = db.prepare<[string | null, string | null, string, number]>(
    `UPDATE projects SET name = COALESCE(?, name), color = COALESCE(?, color), updated_at = ? WHERE id = ?`,
  );
  const updateIcon = db.prepare<[NotebookIcon | null, number]>(`UPDATE projects SET icon = ? WHERE id = ?`);
  const deleteProject = db.prepare<[number]>(`DELETE FROM projects WHERE id = ?`);
  const deleteUnusedTags = db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)`);

  function toProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      color: row.color,
      kind: row.kind,
      icon: row.icon,
      noteCount: row.note_count,
      taskCount: row.task_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function nameTaken(kind: ProjectKind, name: string, exceptId?: number): boolean {
    return selectNames.all(kind).some((p) => p.id !== exceptId && sameName(p.name, name));
  }

  /** `name`, or the first of "name (2)", "name (3)" … that no project (or notebook) outside the trash uses. */
  function freeName(kind: ProjectKind, name: string): string {
    if (!nameTaken(kind, name)) return name;
    for (let n = 2; ; n++) {
      const suffix = ` (${n})`;
      const candidate = `${name.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
      if (!nameTaken(kind, candidate)) return candidate;
    }
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

    /** Project or notebook (US-22); undefined if there is none outside the trash. */
    kindOf(id: number): ProjectKind | undefined {
      return (db.prepare(`SELECT kind FROM live_projects WHERE id = ?`).get(id) as { kind: ProjectKind } | undefined)?.kind;
    },

    /** Also sets up a project's default board (five columns, one lane, starter labels); a notebook gets none. */
    create: db.transaction((input: Omit<ProjectInput, 'kind'> & { kind?: ProjectKind }): ProjectResult => {
      const kind = input.kind ?? 'project';
      if (nameTaken(kind, input.name)) return { ok: false, reason: 'name_taken' };
      const now = new Date().toISOString();
      const { id } = insertProject.get(input.name, input.color, kind, kind === 'notebook' ? (input.icon ?? 'book') : null, now, now)!;
      if (kind === 'project') {
        board.createDefaults(id);
        labels.createStarters(id);
      }
      // Whoever creates a project owns it (US-21); outside a request (sample project) nobody does yet.
      const userId = currentUserId();
      if (userId !== undefined) insertOwner.run(id, userId, now);
      activities.record({
        projectId: id,
        entityType: 'project',
        entityId: id,
        actionType: 'create',
        description: text.projectCreated(input.name, kind),
        metadata: { name: input.name, color: input.color, kind },
      });
      return { ok: true, project: list().find((p) => p.id === id)! };
    }),

    update: db.transaction((id: number, patch: ProjectPatch): ProjectResult => {
      const before = list().find((p) => p.id === id);
      if (!before) return { ok: false, reason: 'not_found' };
      if (patch.name !== undefined && nameTaken(before.kind, patch.name, id)) return { ok: false, reason: 'name_taken' };
      updateProject.run(patch.name ?? null, patch.color ?? null, new Date().toISOString(), id);
      // Only notebooks have a symbol.
      if (patch.icon !== undefined && before.kind === 'notebook' && patch.icon !== before.icon) {
        updateIcon.run(patch.icon ?? 'book', id);
        activities.record({ projectId: id, entityType: 'project', entityId: id, actionType: 'update', description: text.projectRestyled(patch.name ?? before.name), metadata: { icon: { from: before.icon, to: patch.icon } } });
      }

      const log = (description: string, metadata: Record<string, unknown>) =>
        activities.record({ projectId: id, entityType: 'project', entityId: id, actionType: 'update', description, metadata });
      if (patch.name !== undefined && patch.name !== before.name) {
        log(text.projectRenamed(before.name, patch.name, before.kind), { name: { from: before.name, to: patch.name } });
      }
      if (patch.color !== undefined && patch.color !== before.color) {
        log(text.projectRecolored(patch.name ?? before.name, before.kind), { color: { from: before.color, to: patch.color } });
      }
      return { ok: true, project: list().find((p) => p.id === id)! };
    }),

    /**
     * Moves the project to the trash; its notes, tasks and board stay untouched and come back with it.
     * The last project outside the trash cannot be deleted; notebooks can (US-22).
     */
    remove: db.transaction((id: number): 'deleted' | 'not_found' | 'last_project' => {
      const project = list().find((p) => p.id === id);
      if (!project) return 'not_found';
      if (project.kind === 'project' && countProjects.get()!.n <= 1) return 'last_project';
      setDeletedAt.run(new Date().toISOString(), id);
      activities.record({
        projectId: id,
        entityType: 'project',
        entityId: id,
        actionType: 'delete',
        description: text.projectTrashed(project.name, project.kind),
        metadata: { name: project.name },
      });
      return 'deleted';
    }),

    /** Brings a project back from the trash, renamed if its name is taken now. Undefined if it is not in the trash. */
    restore: db.transaction((id: number): RestoreResult | undefined => {
      const trashed = selectTrashedProject.get(id);
      if (!trashed) return undefined;
      const name = freeName(trashed.kind, trashed.name);
      if (name !== trashed.name) setName.run(name, id);
      setDeletedAt.run(null, id);
      const renamed = name !== trashed.name;
      activities.record({
        projectId: id,
        entityType: 'project',
        entityId: id,
        actionType: 'restore',
        description: text.projectRestored(trashed.name, renamed ? name : undefined, trashed.kind),
        metadata: { name, ...(renamed ? { renamedFrom: trashed.name } : {}) },
      });
      const project = list().find((p) => p.id === id)!;
      return renamed ? { project, renamedFrom: trashed.name } : { project };
    }),

    /**
     * Deletes a trashed project for good, with all its notes, tasks, board and activity log. Nothing is logged:
     * the log belonged to the project. Returns its name, or undefined if it is not in the trash.
     */
    purge: db.transaction((id: number): string | undefined => {
      const trashed = selectTrashedProject.get(id);
      if (!trashed) return undefined;
      deleteProject.run(id);
      deleteUnusedTags.run();
      return trashed.name;
    }),
  };
}

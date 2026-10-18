import type { Request, RequestHandler, Response } from 'express';
import type { Db } from '../database.js';
import { HttpError, notFound } from '../errors.js';
import type { ProjectRole, User } from '../repositories/usersRepository.js';
import { idParamSchema } from '../validation.js';
import { userOf, type AuthMode } from './middleware.js';

/**
 * Who may do what in a project (US-21b). Roles rank viewer < member < owner:
 * - viewer: read everything of the project (board, notes, calendar, statistics, exports).
 * - member: also create and change notes, tasks, labels, attachments, links; restore from the trash.
 * - owner: also columns, swimlanes, WIP limits and column widths, the project itself, its members, and deleting
 *   from the trash for good.
 * A system administrator manages accounts, backups and templates for all projects, but only sees the projects they
 * are a member of. Without login (desktop app, AUTH=off) the local user is owner of everything.
 */
export const ROLE_RANK: Record<ProjectRole, number> = { viewer: 1, member: 2, owner: 3 };

export type Access = ReturnType<typeof createAccess>;

/** Resolves the project a request is about; undefined when the note, task … does not exist. */
type ProjectOf = (req: Request, res: Response) => number | undefined;

export function createAccess(db: Db, mode: AuthMode) {
  const selectRole = db.prepare<[number, number], { role: ProjectRole }>(`SELECT role FROM project_members WHERE project_id = ? AND user_id = ?`);
  const selectRoles = db.prepare<[number], { project_id: number; role: ProjectRole }>(`SELECT project_id, role FROM project_members WHERE user_id = ?`);
  const selectProject = db.prepare<[number], { id: number }>(`SELECT id FROM projects WHERE id = ?`);
  const selectAllProjects = db.prepare<[], { id: number }>(`SELECT id FROM projects`);
  // Trashed notes and tasks included: restoring them needs their project, too.
  const projectOfStatements = {
    note: db.prepare<[number], { project_id: number }>(`SELECT project_id FROM notes WHERE id = ?`),
    task: db.prepare<[number], { project_id: number }>(`SELECT project_id FROM tasks WHERE id = ?`),
    column: db.prepare<[number], { project_id: number }>(`SELECT project_id FROM board_columns WHERE id = ?`),
    lane: db.prepare<[number], { project_id: number }>(`SELECT project_id FROM lanes WHERE id = ?`),
    label: db.prepare<[number], { project_id: number }>(`SELECT project_id FROM labels WHERE id = ?`),
    attachment: db.prepare<[number], { project_id: number }>(`SELECT project_id FROM attachments WHERE id = ?`),
  };
  const selectTemplate = db.prepare<[number], { project_id: number | null }>(`SELECT project_id FROM templates WHERE id = ?`);

  /** The user's role in a project; undefined if they are not a member (or the project does not exist). */
  function roleIn(user: User, projectId: number): ProjectRole | undefined {
    if (mode === 'local') return selectProject.get(projectId) ? 'owner' : undefined;
    return selectRole.get(projectId, user.id)?.role;
  }

  /** The user's role in every project they belong to. */
  function roles(user: User): Map<number, ProjectRole> {
    if (mode === 'local') return new Map(selectAllProjects.all().map((p) => [p.id, 'owner' as const]));
    return new Map(selectRoles.all(user.id).map((r) => [r.project_id, r.role]));
  }

  /** The projects in which the user has at least `min`. */
  function projectIds(user: User, min: ProjectRole = 'viewer'): Set<number> {
    return new Set([...roles(user)].filter(([, role]) => ROLE_RANK[role] >= ROLE_RANK[min]).map(([id]) => id));
  }

  const has = (role: ProjectRole | undefined, min: ProjectRole) => role !== undefined && ROLE_RANK[role] >= ROLE_RANK[min];

  /** Throws unless the user has at least `min` in the project: 404 for non-members (nothing to see), 403 for a too low role. */
  function check(user: User, projectId: number | undefined, min: ProjectRole): ProjectRole {
    const role = projectId === undefined ? undefined : roleIn(user, projectId);
    if (!role) throw notFound();
    if (!has(role, min)) throw new HttpError(403, 'forbidden', `This needs the role "${min}" in the project`);
    return role;
  }

  /**
   * Middleware: the request's project (from `projectOf`) needs at least `min`. Leaves the project and the role in
   * res.locals for the route.
   */
  function requireRole(min: ProjectRole, projectOf: ProjectOf): RequestHandler {
    return (req, res, next) => {
      const projectId = projectOf(req, res);
      res.locals.projectRole = check(userOf(res)!, projectId, min);
      res.locals.projectId = projectId;
      next();
    };
  }

  /** Middleware after requireRole on a router: this route needs more than the router's minimum. */
  function atLeast(min: ProjectRole): RequestHandler {
    return (_req, res, next) => {
      if (!has(res.locals.projectRole as ProjectRole, min)) throw new HttpError(403, 'forbidden', `This needs the role "${min}" in the project`);
      next();
    };
  }

  const requireSystemAdmin: RequestHandler = (_req, res, next) => {
    if (userOf(res)?.systemRole !== 'admin') throw new HttpError(403, 'forbidden', 'Only administrators may do this');
    next();
  };

  const id = (req: Request, key = 'id') => idParamSchema.parse(req.params[key]);
  /** Where the project of a request comes from. */
  const of = {
    project:
      (key = 'projectId'): ProjectOf =>
      (req) => {
        const projectId = id(req, key);
        return selectProject.get(projectId) ? projectId : undefined;
      },
    note: (key = 'id'): ProjectOf => (req) => projectOfStatements.note.get(id(req, key))?.project_id,
    task: (key = 'id'): ProjectOf => (req) => projectOfStatements.task.get(id(req, key))?.project_id,
    column: (): ProjectOf => (req) => projectOfStatements.column.get(id(req))?.project_id,
    lane: (): ProjectOf => (req) => projectOfStatements.lane.get(id(req))?.project_id,
    label: (): ProjectOf => (req) => projectOfStatements.label.get(id(req))?.project_id,
    attachment: (): ProjectOf => (req) => projectOfStatements.attachment.get(id(req))?.project_id,
  };

  return {
    roleIn,
    roles,
    projectIds,
    check,
    has,
    requireRole,
    atLeast,
    requireSystemAdmin,
    of,
    /** The project of a template; null for templates of all projects, undefined if there is none. */
    templateProject: (templateId: number) => {
      const row = selectTemplate.get(templateId);
      return row ? row.project_id : undefined;
    },
    /** The project of an item in the trash (a project is its own). */
    trashProject: (type: 'note' | 'task' | 'project', itemId: number) =>
      type === 'project' ? selectProject.get(itemId)?.id : projectOfStatements[type].get(itemId)?.project_id,
  };
}

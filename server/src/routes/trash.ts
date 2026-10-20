import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { userOf } from '../auth/middleware.js';
import { notFound } from '../errors.js';
import type { ProjectsRepository } from '../repositories/projectsRepository.js';
import type { TrashRepository } from '../repositories/trashRepository.js';
import { changed } from '../realtime/events.js';
import { idParamSchema, trashQuerySchema, trashTypeSchema } from '../validation.js';

/**
 * The trash bin across projects: list, restore, purge single items, empty. `afterPurge` removes the files of
 * attachments that went with the purged items. Everyone sees the trash of their own projects; members restore notes
 * and tasks; owners restore projects and delete for good (US-21).
 */
export function trashRouter(trash: TrashRepository, projects: ProjectsRepository, afterPurge: () => void, access: Access): Router {
  const router = Router();

  /** 404 if the item does not exist or is not the user's to see, 403 for a too low role. */
  function checkItem(res: Parameters<typeof userOf>[0], type: 'note' | 'task' | 'project', id: number, min: 'member' | 'owner') {
    // Restoring a project is the owner's decision, like deleting it.
    access.check(userOf(res)!, access.trashProject(type, id), type === 'project' ? 'owner' : min);
  }

  /** `project` limits notes and tasks to one project; trashed projects are always listed. Only the user's projects. */
  router.get('/', (req, res) => {
    const { project } = trashQuerySchema.parse(req.query);
    if (project !== undefined && !projects.exists(project)) throw notFound('Project not found');
    if (project !== undefined) access.check(userOf(res)!, project, 'viewer');
    // With the user's role in the item's project, so the app offers only what they may do.
    const roles = access.roles(userOf(res)!);
    res.json(trash.list(project).flatMap((item) => (roles.has(item.projectId) ? [{ ...item, role: roles.get(item.projectId)! }] : [])));
  });

  router.post('/:type/:id/restore', (req, res) => {
    const type = trashTypeSchema.parse(req.params.type);
    const id = idParamSchema.parse(req.params.id);
    checkItem(res, type, id, 'member');
    const projectId = access.trashProject(type, id)!;
    const restored = trash.restore(type, id);
    if (!restored) throw notFound('Not in the trash');
    announce(res, projectId, type, id, 'restored');
    res.json(restored);
  });

  router.delete('/:type/:id', (req, res) => {
    const type = trashTypeSchema.parse(req.params.type);
    const id = idParamSchema.parse(req.params.id);
    checkItem(res, type, id, 'owner');
    // Known only before the item is gone.
    const projectId = access.trashProject(type, id)!;
    if (!trash.purge(type, id)) throw notFound('Not in the trash');
    announce(res, projectId, type, id, 'purged');
    afterPurge();
    res.status(204).end();
  });

  /** Without `project` everything the user owns goes, trashed projects included. */
  router.delete('/', (req, res) => {
    const { project } = trashQuerySchema.parse(req.query);
    if (project !== undefined && !projects.exists(project)) throw notFound('Project not found');
    if (project !== undefined) access.check(userOf(res)!, project, 'owner');
    const own = access.projectIds(userOf(res)!, 'owner');
    const purged = trash.empty(project, own);
    for (const projectId of project === undefined ? own : [project]) changed(res, projectId, { type: 'trash.emptied' });
    afterPurge();
    res.json(purged);
  });

  return router;
}

/** A restored or purged note, task or project, for the open pages (US-24). */
function announce(res: Parameters<typeof changed>[0], projectId: number, type: 'note' | 'task' | 'project', id: number, what: 'restored' | 'purged') {
  if (type === 'note') changed(res, projectId, { type: `note.${what}`, noteId: id });
  else if (type === 'task') changed(res, projectId, { type: `task.${what}`, taskId: id });
  else changed(res, projectId, { type: `project.${what}` });
}

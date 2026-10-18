import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { userOf } from '../auth/middleware.js';
import { notFound } from '../errors.js';
import type { ProjectsRepository } from '../repositories/projectsRepository.js';
import type { TrashRepository } from '../repositories/trashRepository.js';
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
    checkItem(res, trashTypeSchema.parse(req.params.type), idParamSchema.parse(req.params.id), 'member');
    const restored = trash.restore(trashTypeSchema.parse(req.params.type), idParamSchema.parse(req.params.id));
    if (!restored) throw notFound('Not in the trash');
    res.json(restored);
  });

  router.delete('/:type/:id', (req, res) => {
    checkItem(res, trashTypeSchema.parse(req.params.type), idParamSchema.parse(req.params.id), 'owner');
    if (!trash.purge(trashTypeSchema.parse(req.params.type), idParamSchema.parse(req.params.id))) {
      throw notFound('Not in the trash');
    }
    afterPurge();
    res.status(204).end();
  });

  /** Without `project` everything the user owns goes, trashed projects included. */
  router.delete('/', (req, res) => {
    const { project } = trashQuerySchema.parse(req.query);
    if (project !== undefined && !projects.exists(project)) throw notFound('Project not found');
    if (project !== undefined) access.check(userOf(res)!, project, 'owner');
    const purged = trash.empty(project, access.projectIds(userOf(res)!, 'owner'));
    afterPurge();
    res.json(purged);
  });

  return router;
}

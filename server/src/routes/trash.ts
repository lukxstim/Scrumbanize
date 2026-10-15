import { Router } from 'express';
import { notFound } from '../errors.js';
import type { ProjectsRepository } from '../repositories/projectsRepository.js';
import type { TrashRepository } from '../repositories/trashRepository.js';
import { idParamSchema, trashQuerySchema, trashTypeSchema } from '../validation.js';

/** The trash bin across projects: list, restore, purge single items, empty. */
export function trashRouter(trash: TrashRepository, projects: ProjectsRepository): Router {
  const router = Router();

  /** `project` limits notes and tasks to one project; trashed projects are always listed. */
  router.get('/', (req, res) => {
    const { project } = trashQuerySchema.parse(req.query);
    if (project !== undefined && !projects.exists(project)) throw notFound('Project not found');
    res.json(trash.list(project));
  });

  router.post('/:type/:id/restore', (req, res) => {
    const restored = trash.restore(trashTypeSchema.parse(req.params.type), idParamSchema.parse(req.params.id));
    if (!restored) throw notFound('Not in the trash');
    res.json(restored);
  });

  router.delete('/:type/:id', (req, res) => {
    if (!trash.purge(trashTypeSchema.parse(req.params.type), idParamSchema.parse(req.params.id))) {
      throw notFound('Not in the trash');
    }
    res.status(204).end();
  });

  /** Without `project` everything goes, trashed projects included. */
  router.delete('/', (req, res) => {
    const { project } = trashQuerySchema.parse(req.query);
    if (project !== undefined && !projects.exists(project)) throw notFound('Project not found');
    res.json(trash.empty(project));
  });

  return router;
}

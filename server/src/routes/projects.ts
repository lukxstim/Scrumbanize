import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { userOf } from '../auth/middleware.js';
import { HttpError, notFound } from '../errors.js';
import type { ProjectResult, ProjectsRepository } from '../repositories/projectsRepository.js';
import { accessChanged, changed } from '../realtime/events.js';
import { idParamSchema, projectInputSchema, projectPatchSchema } from '../validation.js';

const nameTaken = () => new HttpError(409, 'name_taken', 'A project with this name already exists');

function unwrap(result: ProjectResult) {
  if (result.ok) return result.project;
  throw result.reason === 'name_taken' ? nameTaken() : notFound('Project not found');
}

/** The projects of the logged-in user, each with their role (US-21); anyone may create one and owns it then. */
export function projectsRouter(projects: ProjectsRepository, access: Access): Router {
  const router = Router();
  const owner = access.requireRole('owner', access.of.project('id'));

  router.get('/', (_req, res) => {
    const roles = access.roles(userOf(res)!);
    res.json(projects.list().flatMap((project) => (roles.has(project.id) ? [{ ...project, role: roles.get(project.id)! }] : [])));
  });

  router.post('/', (req, res) => {
    const project = unwrap(projects.create(projectInputSchema.parse(req.body)));
    // The creator's other tabs and windows get the new project's room.
    accessChanged(res, [userOf(res)!.id]);
    res.status(201).json({ ...project, role: 'owner' });
  });

  router.patch('/:id', owner, (req, res) => {
    const project = unwrap(projects.update(idParamSchema.parse(req.params.id), projectPatchSchema.parse(req.body)));
    changed(res, project.id, { type: 'project.updated' });
    res.json({ ...project, role: res.locals.projectRole });
  });

  router.delete('/:id', owner, (req, res) => {
    const result = projects.remove(idParamSchema.parse(req.params.id));
    if (result === 'not_found') throw notFound('Project not found');
    if (result === 'last_project') throw new HttpError(409, 'last_project', 'The last project cannot be deleted');
    changed(res, res.locals.projectId as number, { type: 'project.deleted' });
    res.status(204).end();
  });

  return router;
}

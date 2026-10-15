import { Router } from 'express';
import { HttpError, notFound } from '../errors.js';
import type { ProjectResult, ProjectsRepository } from '../repositories/projectsRepository.js';
import { idParamSchema, projectInputSchema, projectPatchSchema } from '../validation.js';

const nameTaken = () => new HttpError(409, 'name_taken', 'A project with this name already exists');

function unwrap(result: ProjectResult) {
  if (result.ok) return result.project;
  throw result.reason === 'name_taken' ? nameTaken() : notFound('Project not found');
}

export function projectsRouter(projects: ProjectsRepository): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(projects.list());
  });

  router.post('/', (req, res) => {
    res.status(201).json(unwrap(projects.create(projectInputSchema.parse(req.body))));
  });

  router.patch('/:id', (req, res) => {
    res.json(unwrap(projects.update(idParamSchema.parse(req.params.id), projectPatchSchema.parse(req.body))));
  });

  router.delete('/:id', (req, res) => {
    const result = projects.remove(idParamSchema.parse(req.params.id));
    if (result === 'not_found') throw notFound('Project not found');
    if (result === 'last_project') throw new HttpError(409, 'last_project', 'The last project cannot be deleted');
    res.status(204).end();
  });

  return router;
}

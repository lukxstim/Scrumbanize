import { Router } from 'express';
import { notFound } from '../errors.js';
import type { TasksRepository } from '../repositories/tasksRepository.js';
import { idParamSchema, moveTaskSchema, taskPatchSchema } from '../validation.js';

/** Single tasks by id; listing and creating are project-scoped (see projectScoped.ts). */
export function tasksRouter(tasks: TasksRepository): Router {
  const router = Router();

  router.get('/:id', (req, res) => {
    const task = tasks.get(idParamSchema.parse(req.params.id));
    if (!task) throw notFound('Task not found');
    res.json(task);
  });

  router.patch('/:id', (req, res) => {
    const task = tasks.update(idParamSchema.parse(req.params.id), taskPatchSchema.parse(req.body));
    if (!task) throw notFound('Task not found');
    res.json(task);
  });

  // Moves stay inside the task's own project.
  router.post('/:id/move', (req, res) => {
    const { status, index } = moveTaskSchema.parse(req.body);
    const task = tasks.move(idParamSchema.parse(req.params.id), status, index);
    if (!task) throw notFound('Task not found');
    res.json(task);
  });

  router.delete('/:id', (req, res) => {
    if (!tasks.remove(idParamSchema.parse(req.params.id))) throw notFound('Task not found');
    res.status(204).end();
  });

  return router;
}

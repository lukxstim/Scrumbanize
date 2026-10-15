import { Router } from 'express';
import { notFound } from '../errors.js';
import type { TasksRepository } from '../repositories/tasksRepository.js';
import { idParamSchema, taskInputSchema } from '../validation.js';

export function tasksRouter(tasks: TasksRepository): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(tasks.list());
  });

  router.get('/:id', (req, res) => {
    const task = tasks.get(idParamSchema.parse(req.params.id));
    if (!task) throw notFound('Task not found');
    res.json(task);
  });

  router.post('/', (req, res) => {
    const input = taskInputSchema.parse(req.body);
    if (input.sourceNoteId !== undefined && !tasks.noteExists(input.sourceNoteId)) {
      throw notFound('Source note not found');
    }
    res.status(201).json(tasks.create(input));
  });

  router.delete('/:id', (req, res) => {
    if (!tasks.remove(idParamSchema.parse(req.params.id))) throw notFound('Task not found');
    res.status(204).end();
  });

  return router;
}

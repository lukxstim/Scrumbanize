import { Router } from 'express';
import type { BoardRepository } from '../repositories/boardRepository.js';
import type { TasksRepository } from '../repositories/tasksRepository.js';
import { wipLimitSchema, wipLimitStatusSchema } from '../validation.js';

export function boardRouter(board: BoardRepository, tasks: TasksRepository): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json({ columns: board.listColumns(), tasks: tasks.list() });
  });

  router.patch('/columns/:status', (req, res) => {
    const status = wipLimitStatusSchema.parse(req.params.status);
    const { wipLimit } = wipLimitSchema.parse(req.body);
    res.json(board.setWipLimit(status, wipLimit));
  });

  return router;
}

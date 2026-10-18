import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { HttpError, notFound } from '../errors.js';
import type { BoardFailure, BoardRepository, BoardResult } from '../repositories/boardRepository.js';
import {
  columnPatchSchema,
  deleteBoardItemQuerySchema,
  idParamSchema,
  laneInputSchema,
  reorderSchema,
} from '../validation.js';

const MESSAGES: Record<BoardFailure, [number, string]> = {
  not_found: [404, 'not found'],
  name_taken: [409, 'name is already used in this project'],
  limit_reached: [409, 'limit per project reached'],
  last_item: [409, 'cannot delete the last one of a project'],
  not_empty: [409, 'still has tasks; pass moveTasksTo'],
  invalid_target: [400, 'moveTasksTo must be another one of the same project'],
};

/** Returns the value of a successful result, or throws the matching HTTP error. */
export function unwrapBoard<T>(result: BoardResult<T>, label: 'Column' | 'Lane'): T {
  if (result.ok) return result.value;
  const [status, message] = MESSAGES[result.reason];
  if (result.reason === 'not_found') throw notFound(`${label} not found`);
  throw new HttpError(status, result.reason, `${label}: ${message}`);
}

/** Single columns by id, mounted at /api/columns. Creating is project-scoped (see projectScoped.ts). Owners only. */
export function columnsRouter(board: BoardRepository, access: Access): Router {
  const router = Router();
  router.use('/:id', access.requireRole('owner', access.of.column()));

  router.patch('/:id', (req, res) => {
    res.json(unwrapBoard(board.updateColumn(idParamSchema.parse(req.params.id), columnPatchSchema.parse(req.body)), 'Column'));
  });

  router.post('/:id/move', (req, res) => {
    const { index } = reorderSchema.parse(req.body);
    res.json(unwrapBoard(board.moveColumn(idParamSchema.parse(req.params.id), index), 'Column'));
  });

  router.delete('/:id', (req, res) => {
    const { moveTasksTo } = deleteBoardItemQuerySchema.parse(req.query);
    unwrapBoard(board.deleteColumn(idParamSchema.parse(req.params.id), moveTasksTo), 'Column');
    res.status(204).end();
  });

  return router;
}

/** Single lanes by id, mounted at /api/lanes. Creating is project-scoped (see projectScoped.ts). Owners only. */
export function lanesRouter(board: BoardRepository, access: Access): Router {
  const router = Router();
  router.use('/:id', access.requireRole('owner', access.of.lane()));

  router.patch('/:id', (req, res) => {
    const { name } = laneInputSchema.parse(req.body);
    res.json(unwrapBoard(board.renameLane(idParamSchema.parse(req.params.id), name), 'Lane'));
  });

  router.post('/:id/move', (req, res) => {
    const { index } = reorderSchema.parse(req.body);
    res.json(unwrapBoard(board.moveLane(idParamSchema.parse(req.params.id), index), 'Lane'));
  });

  router.delete('/:id', (req, res) => {
    const { moveTasksTo } = deleteBoardItemQuerySchema.parse(req.query);
    unwrapBoard(board.deleteLane(idParamSchema.parse(req.params.id), moveTasksTo), 'Lane');
    res.status(204).end();
  });

  return router;
}

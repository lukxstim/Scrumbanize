import { Router } from 'express';
import type { SearchRepository } from '../repositories/searchRepository.js';
import { searchQuerySchema } from '../validation.js';

/** GET /api/search?q=…&project=…&limit=… — notes and tasks of all projects, `project` first. */
export function searchRouter(search: SearchRepository): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const { q, project, limit } = searchQuerySchema.parse(req.query);
    res.json(q ? search.search(q, project ?? 0, limit) : { notes: [], tasks: [] });
  });

  return router;
}

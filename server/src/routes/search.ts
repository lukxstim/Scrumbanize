import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { userOf } from '../auth/middleware.js';
import type { SearchRepository } from '../repositories/searchRepository.js';
import { searchQuerySchema } from '../validation.js';

/** GET /api/search?q=…&project=…&limit=… — notes and tasks of all the user's projects, `project` first. */
export function searchRouter(search: SearchRepository, access: Access): Router {
  const router = Router();

  router.get('/', (req, res) => {
    const { q, project, limit } = searchQuerySchema.parse(req.query);
    res.json(q ? search.search(q, project ?? 0, limit, access.projectIds(userOf(res)!)) : { notes: [], tasks: [] });
  });

  return router;
}

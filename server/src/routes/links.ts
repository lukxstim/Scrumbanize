import { Router } from 'express';
import type { Access } from '../auth/access.js';
import type { ContentLinksRepository } from '../repositories/contentLinksRepository.js';
import { idParamSchema, linkCandidatesQuerySchema, resolveLinksSchema } from '../validation.js';

/**
 * Links between notes and tasks across projects (US-22), mounted at /api. What a user may not see comes back as
 * "forbidden" (resolve) or is left out (backlinks, candidates).
 */
export function linksRouter(links: ContentLinksRepository, access: Access): Router {
  const router = Router();

  /** The targets of the links in an open note or task: title and place, "trashed" or "forbidden". */
  router.post('/links/resolve', (req, res) => {
    res.json(links.resolve(resolveLinksSchema.parse(req.body).refs));
  });

  /** Suggestions for the [[ picker, from every project and notebook the user may see. */
  router.get('/links/candidates', (req, res) => {
    const { q, project } = linkCandidatesQuerySchema.parse(req.query);
    res.json(links.candidates(q, project ?? 0));
  });

  router.get('/notes/:id/backlinks', access.requireRole('viewer', access.of.note()), (req, res) => {
    res.json(links.backlinks('note', idParamSchema.parse(req.params.id)));
  });

  router.get('/tasks/:id/backlinks', access.requireRole('viewer', access.of.task()), (req, res) => {
    res.json(links.backlinks('task', idParamSchema.parse(req.params.id)));
  });

  return router;
}

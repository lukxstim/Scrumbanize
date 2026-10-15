import { Router } from 'express';
import type { NotesRepository } from '../repositories/notesRepository.js';

export function tagsRouter(notes: NotesRepository): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(notes.listTags());
  });

  return router;
}

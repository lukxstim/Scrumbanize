import { Router } from 'express';
import { notFound } from '../errors.js';
import type { NotesRepository } from '../repositories/notesRepository.js';
import { idParamSchema, noteInputSchema } from '../validation.js';

/** Single notes by id; listing and creating are project-scoped (see projectScoped.ts). */
export function notesRouter(notes: NotesRepository): Router {
  const router = Router();

  router.get('/:id', (req, res) => {
    const note = notes.get(idParamSchema.parse(req.params.id));
    if (!note) throw notFound('Note not found');
    res.json(note);
  });

  router.put('/:id', (req, res) => {
    const note = notes.update(idParamSchema.parse(req.params.id), noteInputSchema.parse(req.body));
    if (!note) throw notFound('Note not found');
    res.json(note);
  });

  router.delete('/:id', (req, res) => {
    if (!notes.remove(idParamSchema.parse(req.params.id))) throw notFound('Note not found');
    res.status(204).end();
  });

  return router;
}

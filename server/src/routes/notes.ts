import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { notFound } from '../errors.js';
import type { NotesRepository } from '../repositories/notesRepository.js';
import { idParamSchema, noteInputSchema } from '../validation.js';

/** Single notes by id; listing and creating are project-scoped (see projectScoped.ts). Reading: viewer, changing: member. */
export function notesRouter(notes: NotesRepository, access: Access): Router {
  const router = Router();
  const read = access.requireRole('viewer', access.of.note());
  const edit = access.requireRole('member', access.of.note());

  router.get('/:id', read, (req, res) => {
    const note = notes.get(idParamSchema.parse(req.params.id));
    if (!note) throw notFound('Note not found');
    res.json(note);
  });

  router.put('/:id', edit, (req, res) => {
    const note = notes.update(idParamSchema.parse(req.params.id), noteInputSchema.parse(req.body));
    if (!note) throw notFound('Note not found');
    res.json(note);
  });

  router.delete('/:id', edit, (req, res) => {
    if (!notes.remove(idParamSchema.parse(req.params.id))) throw notFound('Note not found');
    res.status(204).end();
  });

  return router;
}

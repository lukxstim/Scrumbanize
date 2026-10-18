import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { HttpError, notFound } from '../errors.js';
import type { FoldersRepository } from '../repositories/foldersRepository.js';
import type { NotesRepository } from '../repositories/notesRepository.js';
import { idParamSchema, noteFolderSchema, noteInputSchema } from '../validation.js';

/** Single notes by id; listing and creating are project-scoped (see projectScoped.ts). Reading: viewer, changing: member. */
export function notesRouter(notes: NotesRepository, folders: FoldersRepository, access: Access): Router {
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

  /** Into a folder of the note's project, or (null) to the top level (US-22). */
  router.put('/:id/folder', edit, (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!folders.moveNote(id, noteFolderSchema.parse(req.body).folderId)) {
      throw new HttpError(400, 'invalid_folder', "The folder must belong to the note's project");
    }
    res.json(notes.get(id));
  });

  router.delete('/:id', edit, (req, res) => {
    if (!notes.remove(idParamSchema.parse(req.params.id))) throw notFound('Note not found');
    res.status(204).end();
  });

  return router;
}

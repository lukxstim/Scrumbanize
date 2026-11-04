import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { userOf } from '../auth/middleware.js';
import { HttpError, notFound } from '../errors.js';
import type { FoldersRepository } from '../repositories/foldersRepository.js';
import type { NotesRepository } from '../repositories/notesRepository.js';
import { changed } from '../realtime/events.js';
import { idParamSchema, noteColorSchema, noteFolderSchema, noteListQuerySchema, noteUpdateSchema } from '../validation.js';

/**
 * Single notes by id, and the notes of all the user's notebooks at once; listing and creating per project are project-scoped (see
 * projectScoped.ts). Reading: viewer, changing: member.
 */
export function notesRouter(notes: NotesRepository, folders: FoldersRepository, access: Access): Router {
  const router = Router();
  const read = access.requireRole('viewer', access.of.note());
  const edit = access.requireRole('member', access.of.note());

  /** "Alle Notizen" (US-22, US-26): the notes of every notebook the user can see, `?q=` and `?tag=` as per project. */
  router.get('/', (req, res) => {
    const { q, tag } = noteListQuerySchema.parse(req.query);
    res.json(notes.listAcross(access.projectIds(userOf(res)!), { q, tags: tag }));
  });

  router.get('/:id', read, (req, res) => {
    const note = notes.get(idParamSchema.parse(req.params.id));
    if (!note) throw notFound('Note not found');
    res.json(note);
  });

  // A save based on an older version is refused with the current note (US-24), so the editor can offer both.
  router.put('/:id', edit, (req, res) => {
    const { baseUpdatedAt, ...input } = noteUpdateSchema.parse(req.body);
    const result = notes.update(idParamSchema.parse(req.params.id), input, baseUpdatedAt);
    if (!result.ok && result.reason === 'not_found') throw notFound('Note not found');
    if (!result.ok) throw new HttpError(409, 'conflict', 'The note was changed in the meantime', { note: result.note });
    changed(res, result.note.projectId, { type: 'note.updated', noteId: result.note.id });
    res.json(result.note);
  });

  /**
   * Into a folder of the note's project, or (null) to the top level (US-22); with `projectId`, into another notebook,
   * where the user must be a member, too (US-34).
   */
  router.put('/:id/folder', edit, (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    const { folderId, projectId: target } = noteFolderSchema.parse(req.body);
    const from = res.locals.projectId as number;
    if (target !== undefined && target !== from) {
      access.check(userOf(res)!, target, 'member');
      if (!folders.moveNoteToProject(id, target, folderId)) {
        throw new HttpError(400, 'invalid_folder', 'The folder must belong to the target notebook');
      }
      changed(res, from, { type: 'note.moved', noteId: id });
      changed(res, target, { type: 'note.moved', noteId: id });
    } else {
      if (!folders.moveNote(id, folderId)) throw new HttpError(400, 'invalid_folder', "The folder must belong to the note's project");
      changed(res, from, { type: 'note.moved', noteId: id });
    }
    res.json(notes.get(id));
  });

  /** A color of its own (US-26: the quick notes), or null for none. */
  router.put('/:id/color', edit, (req, res) => {
    const { color } = noteColorSchema.parse(req.body);
    const note = notes.setColor(idParamSchema.parse(req.params.id), color);
    if (!note) throw notFound('Note not found');
    changed(res, note.projectId, { type: 'note.updated', noteId: note.id });
    res.json(note);
  });

  router.delete('/:id', edit, (req, res) => {
    const id = idParamSchema.parse(req.params.id);
    if (!notes.remove(id)) throw notFound('Note not found');
    changed(res, res.locals.projectId as number, { type: 'note.deleted', noteId: id });
    res.status(204).end();
  });

  return router;
}

/** GET /api/tags — the tags beside "Alle Notizen" (US-22, US-26): tags of the notes in all the user's notebooks, with counts. */
export function tagsRouter(notes: NotesRepository, access: Access): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(notes.listTagsAcross(access.projectIds(userOf(res)!)));
  });

  return router;
}

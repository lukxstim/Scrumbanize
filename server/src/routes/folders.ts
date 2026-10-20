import { Router } from 'express';
import type { Access } from '../auth/access.js';
import { HttpError, notFound } from '../errors.js';
import type { FolderResult, FoldersRepository } from '../repositories/foldersRepository.js';
import { MAX_FOLDER_DEPTH } from '../repositories/foldersRepository.js';
import { changed } from '../realtime/events.js';
import { folderPatchSchema, idParamSchema } from '../validation.js';

/** The folder of a successful result, or the matching HTTP error. */
export function unwrapFolder(result: FolderResult) {
  if (result.ok) return result.folder;
  if (result.reason === 'not_found') throw notFound('Folder not found');
  if (result.reason === 'invalid_parent') throw new HttpError(400, 'invalid_parent', 'Folder: the parent must be another folder of the same project, outside this one');
  if (result.reason === 'too_deep') throw new HttpError(409, 'too_deep', `Folder: at most ${MAX_FOLDER_DEPTH} levels`);
  throw new HttpError(409, 'name_taken', 'Folder: name is already used here');
}

/** Single folders by id (US-22), mounted at /api/folders. Listing and creating are project-scoped (see projectScoped.ts). */
export function foldersRouter(folders: FoldersRepository, access: Access): Router {
  const router = Router();
  const edit = access.requireRole('member', access.of.folder());

  router.patch('/:id', edit, (req, res) => {
    const folder = unwrapFolder(folders.update(idParamSchema.parse(req.params.id), folderPatchSchema.parse(req.body)));
    changed(res, res.locals.projectId as number, { type: 'folder.changed' });
    res.json(folder);
  });

  /** Its notes and subfolders move up one level. */
  router.delete('/:id', edit, (req, res) => {
    if (!folders.remove(idParamSchema.parse(req.params.id))) throw notFound('Folder not found');
    changed(res, res.locals.projectId as number, { type: 'folder.changed' });
    res.status(204).end();
  });

  return router;
}

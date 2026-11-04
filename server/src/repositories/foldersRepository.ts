import type { Db } from '../database.js';
import { positionForIndex } from '../positions.js';

/** Folders nest at most this deep (US-22): a folder in a folder … five levels. */
export const MAX_FOLDER_DEPTH = 5;

/** A folder of notes in a project or notebook (US-22). */
export interface Folder {
  id: number;
  projectId: number;
  /** null: at the top level. */
  parentId: number | null;
  name: string;
  position: number;
}

interface FolderRow {
  id: number;
  project_id: number;
  parent_id: number | null;
  name: string;
  position: number;
}

export type FolderFailure = 'not_found' | 'invalid_parent' | 'too_deep' | 'name_taken';
export type FolderResult = { ok: true; folder: Folder } | { ok: false; reason: FolderFailure };

const toFolder = (row: FolderRow): Folder => ({ id: row.id, projectId: row.project_id, parentId: row.parent_id, name: row.name, position: row.position });
const sameName = (a: string, b: string) => a.toLocaleLowerCase('de') === b.toLocaleLowerCase('de');

export type FoldersRepository = ReturnType<typeof createFoldersRepository>;

/**
 * Folders of notes (US-22), in projects and notebooks alike. Notes without folder stay at the top level. Deleting a
 * folder never deletes notes: they and its subfolders move up one level. Not logged – folders only arrange notes.
 */
export function createFoldersRepository(db: Db) {
  const selectAll = db.prepare<[number], FolderRow>(`SELECT * FROM note_folders WHERE project_id = ? ORDER BY position, id`);
  const selectOne = db.prepare<[number], FolderRow>(`SELECT * FROM note_folders WHERE id = ?`);
  const insert = db.prepare<[number, number | null, string, number, string], FolderRow>(
    `INSERT INTO note_folders (project_id, parent_id, name, position, created_at) VALUES (?, ?, ?, ?, ?) RETURNING *`,
  );
  const setPlace = db.prepare<[number | null, number, number]>(`UPDATE note_folders SET parent_id = ?, position = ? WHERE id = ?`);
  const setPosition = db.prepare<[number, number]>(`UPDATE note_folders SET position = ? WHERE id = ?`);
  const setName = db.prepare<[string, number]>(`UPDATE note_folders SET name = ? WHERE id = ?`);
  const deleteFolder = db.prepare<[number]>(`DELETE FROM note_folders WHERE id = ?`);
  const moveNotesUp = db.prepare<[number | null, number]>(`UPDATE notes SET folder_id = ?, position = NULL WHERE folder_id = ?`);
  const selectNoteProject = db.prepare<[number], { project_id: number }>(`SELECT project_id FROM notes WHERE id = ?`);
  const setNoteFolder = db.prepare<[number | null, number]>(`UPDATE notes SET folder_id = ?, position = NULL WHERE id = ?`);
  const selectLiveProject = db.prepare<[number], { id: number }>(`SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL`);
  const setNoteProject = db.prepare<[number, number | null, number]>(`UPDATE notes SET project_id = ?, folder_id = ?, position = NULL WHERE id = ?`);
  const setAttachmentsProject = db.prepare<[number, number]>(`UPDATE attachments SET project_id = ? WHERE note_id = ?`);

  const siblings = (projectId: number, parentId: number | null, exceptId?: number) =>
    selectAll.all(projectId).filter((f) => f.parent_id === parentId && f.id !== exceptId);

  /** How deep a folder sits: 1 at the top level. */
  function depth(folder: FolderRow | undefined): number {
    let level = 0;
    for (let current = folder; current; current = current.parent_id === null ? undefined : selectOne.get(current.parent_id)) level++;
    return level;
  }

  /** Levels of a folder and everything below it: 1 without subfolders. */
  function height(folderId: number, all: FolderRow[]): number {
    const children = all.filter((f) => f.parent_id === folderId);
    return 1 + Math.max(0, ...children.map((c) => height(c.id, all)));
  }

  /** Whether `candidateId` is `folderId` itself or inside it. */
  function isWithin(candidateId: number, folderId: number): boolean {
    for (let current = selectOne.get(candidateId); current; current = current.parent_id === null ? undefined : selectOne.get(current.parent_id)) {
      if (current.id === folderId) return true;
    }
    return false;
  }

  /** A parent must be a folder of the same project (or null). */
  const validParent = (projectId: number, parentId: number | null) =>
    parentId === null ? null : (selectOne.get(parentId)?.project_id === projectId ? selectOne.get(parentId)! : undefined);

  return {
    list(projectId: number): Folder[] {
      return selectAll.all(projectId).map(toFolder);
    },

    get(id: number): Folder | undefined {
      const row = selectOne.get(id);
      return row && toFolder(row);
    },

    /** At the end of its parent's folders. */
    create: db.transaction((projectId: number, input: { name: string; parentId: number | null }): FolderResult => {
      const parent = validParent(projectId, input.parentId);
      if (parent === undefined) return { ok: false, reason: 'invalid_parent' };
      if (depth(parent ?? undefined) + 1 > MAX_FOLDER_DEPTH) return { ok: false, reason: 'too_deep' };
      const others = siblings(projectId, input.parentId);
      if (others.some((f) => sameName(f.name, input.name))) return { ok: false, reason: 'name_taken' };
      const { position } = positionForIndex(others, others.length);
      return { ok: true, folder: toFolder(insert.get(projectId, input.parentId, input.name, position, new Date().toISOString())!) };
    }),

    /** Renames and/or moves a folder (into another parent and/or to `index` among its siblings). */
    update: db.transaction((id: number, patch: { name?: string; parentId?: number | null; index?: number }): FolderResult => {
      const folder = selectOne.get(id);
      if (!folder) return { ok: false, reason: 'not_found' };
      const parentId = patch.parentId === undefined ? folder.parent_id : patch.parentId;
      const parent = validParent(folder.project_id, parentId);
      if (parent === undefined || (parentId !== null && isWithin(parentId, id))) return { ok: false, reason: 'invalid_parent' };
      if (depth(parent ?? undefined) + height(id, selectAll.all(folder.project_id)) > MAX_FOLDER_DEPTH) return { ok: false, reason: 'too_deep' };
      const name = patch.name ?? folder.name;
      const others = siblings(folder.project_id, parentId, id);
      if (others.some((f) => sameName(f.name, name))) return { ok: false, reason: 'name_taken' };
      if (patch.name !== undefined) setName.run(name, id);
      if (patch.parentId !== undefined || patch.index !== undefined) {
        const { position, renumbered } = positionForIndex(others, patch.index ?? others.length);
        for (const r of renumbered) setPosition.run(r.position, r.id);
        setPlace.run(parentId, position, id);
      }
      return { ok: true, folder: toFolder(selectOne.get(id)!) };
    }),

    /** Deletes the folder; its notes and subfolders move to its parent (subfolders at the end, in their order). */
    remove: db.transaction((id: number): boolean => {
      const folder = selectOne.get(id);
      if (!folder) return false;
      moveNotesUp.run(folder.parent_id, id);
      const children = selectAll.all(folder.project_id).filter((f) => f.parent_id === id);
      let last = Math.max(0, ...siblings(folder.project_id, folder.parent_id, id).map((f) => f.position));
      for (const child of children) setPlace.run(folder.parent_id, ++last, child.id);
      deleteFolder.run(id);
      return true;
    }),

    /** Puts a note into a folder of its own project, or (null) at the top level. False if either does not fit. */
    moveNote(noteId: number, folderId: number | null): boolean {
      const note = selectNoteProject.get(noteId);
      if (!note) return false;
      if (folderId !== null && selectOne.get(folderId)?.project_id !== note.project_id) return false;
      setNoteFolder.run(folderId, noteId);
      return true;
    },

    /**
     * Moves a note into another notebook (US-34), into one of its folders or (null) to its top level, with its
     * attachments; tags, links and tasks made from it stay with it. False if the notebook or the folder does not fit.
     */
    moveNoteToProject: db.transaction((noteId: number, projectId: number, folderId: number | null): boolean => {
      if (!selectNoteProject.get(noteId) || !selectLiveProject.get(projectId)) return false;
      if (folderId !== null && selectOne.get(folderId)?.project_id !== projectId) return false;
      setNoteProject.run(projectId, folderId, noteId);
      setAttachmentsProject.run(projectId, noteId);
      return true;
    }),

    /** Whether a folder belongs to a project, for creating a note right inside it. */
    inProject(folderId: number, projectId: number): boolean {
      return selectOne.get(folderId)?.project_id === projectId;
    },
  };
}

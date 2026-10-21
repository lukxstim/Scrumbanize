import { text } from '../activityText.js';
import type { Db } from '../database.js';
import type { NoteInput } from '../validation.js';
import { canSee, visibleProjects } from '../auth/visibility.js';
import { createActivityRepository } from './activityRepository.js';
import { createContentLinksRepository } from './contentLinksRepository.js';
import type { LinkedTask } from './tasksRepository.js';
import { createAttachmentQueries, type Attachment } from './attachmentsRepository.js';

export interface Note {
  id: number;
  projectId: number;
  /** The folder (US-22); null at the top level. */
  folderId: number | null;
  title: string;
  content: string;
  tags: string[];
  /** Tasks created from this note, oldest first; also in other projects (US-22). */
  tasks: LinkedTask[];
  /** Attached files, oldest first. */
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
}

export interface TagSummary {
  id: number;
  name: string;
  noteCount: number;
}

export interface NoteFilter {
  /** Case-insensitive substring match on title, content or tag names. */
  q?: string;
  /** A note must carry every listed tag. */
  tags?: string[];
}

interface LinkedTaskRow {
  id: number;
  project_id: number;
  /** The project of the note the task came from. */
  note_project_id: number;
  title: string;
  source_note_id: number;
  column_id: number;
  column_name: string;
}

interface NoteRow {
  id: number;
  project_id: number;
  folder_id: number | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ImportedNote extends NoteInput {
  /** From the file's front matter; otherwise the time of the import. */
  createdAt?: string;
}

export type NoteUpdateResult =
  | { ok: true; note: Note }
  | { ok: false; reason: 'not_found' }
  /** Changed elsewhere since the edit started (US-24); `note` is the current state. */
  | { ok: false; reason: 'conflict'; note: Note };

/** Tags are stored as a set; their order does not matter. */
const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((tag) => b.includes(tag));

export type NotesRepository = ReturnType<typeof createNotesRepository>;

export function createNotesRepository(db: Db) {
  const activities = createActivityRepository(db);
  const attachmentQueries = createAttachmentQueries(db);
  const contentLinks = createContentLinksRepository(db);
  const insertNote = db.prepare<[number, string, string, string, string], NoteRow>(
    `INSERT INTO notes (project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING *`,
  );
  const updateNote = db.prepare<[string, string, string, number], NoteRow>(
    `UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ? RETURNING *`,
  );
  const deleteNote = db.prepare<[number]>(`DELETE FROM notes WHERE id = ?`);
  const insertImported = db.prepare<[number, string, string, string, string], { id: number }>(
    `INSERT INTO notes (project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING id`,
  );
  const selectTitles = db.prepare<[number], { title: string }>(`SELECT title FROM live_notes WHERE project_id = ?`);
  // Reads go through live_notes and live_tasks, which leave out the trash and the contents of trashed projects.
  const selectNote = db.prepare<[number], NoteRow>(`SELECT * FROM live_notes WHERE id = ?`);
  // A note in the trash of a project that is not itself in the trash: the ones that can be restored or purged.
  const selectTrashedNote = db.prepare<[number], NoteRow>(
    `SELECT n.* FROM notes n JOIN live_projects p ON p.id = n.project_id WHERE n.id = ? AND n.deleted_at IS NOT NULL`,
  );
  const setDeletedAt = db.prepare<[string | null, number]>(`UPDATE notes SET deleted_at = ? WHERE id = ?`);
  const selectTagsOfNote = db.prepare<[number], { name: string }>(
    `SELECT t.name FROM tags t JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ? ORDER BY t.name`,
  );
  const selectAllNoteTags = db.prepare<[number], { note_id: number; name: string }>(
    `SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id JOIN live_notes n ON n.id = nt.note_id
     WHERE n.project_id = ? ORDER BY t.name`,
  );
  // The tasks may live in another project than the note (US-22: from a notebook into a project).
  const linkedTaskSql = `SELECT t.id, t.project_id, n.project_id AS note_project_id, t.title, t.source_note_id,
       c.id AS column_id, c.name AS column_name
     FROM live_tasks t JOIN board_columns c ON c.id = t.column_id JOIN notes n ON n.id = t.source_note_id`;
  const selectTasksOfNote = db.prepare<[number], LinkedTaskRow>(`${linkedTaskSql} WHERE t.source_note_id = ? ORDER BY t.id`);
  const selectAllLinkedTasks = db.prepare<[number], LinkedTaskRow>(`${linkedTaskSql} WHERE n.project_id = ? ORDER BY t.id`);
  // A task in a project the viewer may not see shows as "no access", without its title.
  const toLinkedTask = (row: LinkedTaskRow, visible: Set<number> | null): LinkedTask =>
    row.project_id === row.note_project_id || canSee(visible, row.project_id)
      ? { id: row.id, projectId: row.project_id, title: row.title, column: { id: row.column_id, name: row.column_name }, restricted: false }
      : { id: row.id, projectId: row.project_id, title: '', column: { id: 0, name: '' }, restricted: true };
  const clearNoteTags = db.prepare<[number]>(`DELETE FROM note_tags WHERE note_id = ?`);
  const upsertTag = db.prepare<[string], { id: number }>(
    `INSERT INTO tags (name) VALUES (?) ON CONFLICT (name) DO UPDATE SET name = name RETURNING id`,
  );
  const linkTag = db.prepare<[number, number]>(`INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)`);
  const deleteUnusedTags = db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)`);
  const selectTagSummaries = db.prepare<[number], TagSummary>(
    `SELECT t.id, t.name, COUNT(nt.note_id) AS noteCount
     FROM tags t JOIN note_tags nt ON nt.tag_id = t.id JOIN live_notes n ON n.id = nt.note_id
     WHERE n.project_id = ?
     GROUP BY t.id ORDER BY t.name`,
  );
  // The same over the notebooks among several projects (US-22: Wissen); the parameter is a JSON array of their ids.
  const selectNotebookTagSummaries = db.prepare<[string], TagSummary>(
    `SELECT t.id, t.name, COUNT(nt.note_id) AS noteCount
     FROM tags t JOIN note_tags nt ON nt.tag_id = t.id JOIN live_notes n ON n.id = nt.note_id
     JOIN projects p ON p.id = n.project_id AND p.kind = 'notebook'
     WHERE n.project_id IN (SELECT value FROM json_each(?))
     GROUP BY t.id ORDER BY t.name`,
  );
  const selectNotebookIds = db.prepare<[], { id: number }>(`SELECT id FROM live_projects WHERE kind = 'notebook'`);

  function setTags(noteId: number, tags: string[]): void {
    clearNoteTags.run(noteId);
    for (const name of tags) {
      linkTag.run(noteId, upsertTag.get(name)!.id);
    }
    deleteUnusedTags.run();
  }

  function toNote(row: NoteRow, tags: string[], tasks: LinkedTask[], attachments: Attachment[]): Note {
    return {
      id: row.id,
      projectId: row.project_id,
      folderId: row.folder_id ?? null,
      title: row.title,
      content: row.content,
      tags,
      tasks,
      attachments,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function withRelations(row: NoteRow): Note {
    return toNote(
      row,
      selectTagsOfNote.all(row.id).map((t) => t.name),
      selectTasksOfNote.all(row.id).map((task) => toLinkedTask(task, visibleProjects(db))),
      attachmentQueries.forNote(row.id),
    );
  }

  function list(projectId: number, filter: NoteFilter = {}): Note[] {
    const where: string[] = ['n.project_id = ?'];
    const params: (string | number)[] = [projectId];

    const q = filter.q?.trim();
    if (q) {
      const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push(`(n.title LIKE ? ESCAPE '\\' OR n.content LIKE ? ESCAPE '\\' OR EXISTS (
        SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
        WHERE nt.note_id = n.id AND t.name LIKE ? ESCAPE '\\'))`);
      params.push(pattern, pattern, pattern);
    }

    const tags = filter.tags ?? [];
    if (tags.length > 0) {
      where.push(`n.id IN (
        SELECT nt.note_id FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
        WHERE t.name IN (${tags.map(() => '?').join(', ')})
        GROUP BY nt.note_id HAVING COUNT(*) = ?)`);
      params.push(...tags, tags.length);
    }

    const rows = db
      .prepare<(string | number)[], NoteRow>(
        `SELECT n.* FROM live_notes n WHERE ${where.join(' AND ')}
         ORDER BY n.updated_at DESC, n.id DESC`,
      )
      .all(...params);

    const tagsByNote = new Map<number, string[]>();
    for (const { note_id, name } of selectAllNoteTags.all(projectId)) {
      const list = tagsByNote.get(note_id) ?? [];
      list.push(name);
      tagsByNote.set(note_id, list);
    }

    const tasksByNote = new Map<number, LinkedTask[]>();
    const visible = visibleProjects(db);
    for (const row of selectAllLinkedTasks.all(projectId)) {
      const list = tasksByNote.get(row.source_note_id) ?? [];
      list.push(toLinkedTask(row, visible));
      tasksByNote.set(row.source_note_id, list);
    }

    const attachmentsByNote = attachmentQueries.forProjectNotes(projectId);
    return rows.map((row) =>
      toNote(row, tagsByNote.get(row.id) ?? [], tasksByNote.get(row.id) ?? [], attachmentsByNote.get(row.id) ?? []),
    );
  }

  return {
    list,

    /**
     * "Alle Notizen" in Wissen (US-22): the notes of those of `projectIds` that are notebooks, most recently changed
     * first. Notes of projects stay with their project.
     */
    listInNotebooks(projectIds: Iterable<number>, filter: NoteFilter = {}): Note[] {
      const allowed = new Set(projectIds);
      return selectNotebookIds
        .all()
        .filter(({ id }) => allowed.has(id))
        .flatMap(({ id }) => list(id, filter))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id);
    },

    get(id: number): Note | undefined {
      const row = selectNote.get(id);
      return row && withRelations(row);
    },

    /** `folderId` must be a folder of the project (checked by the route). */
    create: db.transaction((projectId: number, input: NoteInput, folderId: number | null = null): Note => {
      const now = new Date().toISOString();
      let row = insertNote.get(projectId, input.title, input.content, now, now)!;
      if (folderId !== null) row = db.prepare<[number, number], NoteRow>(`UPDATE notes SET folder_id = ? WHERE id = ? RETURNING *`).get(folderId, row.id)!;
      setTags(row.id, input.tags);
      contentLinks.sync('note', row.id, input.content);
      activities.record({
        projectId,
        entityType: 'note',
        entityId: row.id,
        actionType: 'create',
        description: text.noteCreated(input.title),
        metadata: { title: input.title },
      });
      return withRelations(row);
    }),

    /**
     * Creates imported notes. A title the project already has (or the import had before) gets a number, "Plan (2)",
     * so nothing is overwritten or mixed up. One log entry for the whole import (see recordImport).
     */
    importMany: db.transaction((projectId: number, inputs: ImportedNote[], now = new Date()): { id: number; title: string }[] => {
      const taken = new Set(selectTitles.all(projectId).map((r) => r.title.toLocaleLowerCase('de')));
      const created = inputs.map((input) => {
        let title = input.title;
        for (let n = 2; taken.has(title.toLocaleLowerCase('de')); n++) title = `${input.title} (${n})`;
        taken.add(title.toLocaleLowerCase('de'));
        const createdAt = input.createdAt ?? now.toISOString();
        // Shown as recently changed, so the imported notes appear on top of the list.
        const id = insertImported.get(projectId, title, input.content, createdAt, now.toISOString())!.id;
        setTags(id, input.tags);
        contentLinks.sync('note', id, input.content);
        return { id, title };
      });
      activities.recordImport(projectId, created.length, now);
      return created;
    }),

    /** Replaces title, content and tags. Returns undefined if the note does not exist. */
    /**
     * Saves title, text and tags. With `baseUpdatedAt` (US-24), the version the edit started from: if the note changed
     * since, nothing is saved and the result holds the current note, unless the edit is the same as what is there.
     */
    update: db.transaction((id: number, input: NoteInput, baseUpdatedAt?: string): NoteUpdateResult => {
      const before = selectNote.get(id);
      if (!before) return { ok: false, reason: 'not_found' };
      const tagsBefore = selectTagsOfNote.all(id).map((t) => t.name);
      if (baseUpdatedAt !== undefined && baseUpdatedAt !== before.updated_at) {
        const same =
          before.title === input.title && before.content === input.content && sameTags(tagsBefore, input.tags);
        return same ? { ok: true, note: withRelations(before) } : { ok: false, reason: 'conflict', note: withRelations(before) };
      }

      // Always later than the version before, so two saves within a millisecond still tell apart (see baseUpdatedAt).
      const at = new Date(Math.max(Date.now(), Date.parse(before.updated_at) + 1)).toISOString();
      const row = updateNote.get(input.title, input.content, at, id)!;
      setTags(id, input.tags);
      if (before.content !== input.content) contentLinks.sync('note', id, input.content);

      activities.recordEdit({
        projectId: row.project_id,
        entityType: 'note',
        entityId: id,
        title: input.title,
        changes: {
          fields: [
            ...(before.title !== input.title ? (['title'] as const) : []),
            ...(before.content !== input.content ? (['content'] as const) : []),
          ],
          tagsAdded: input.tags.filter((t) => !tagsBefore.includes(t)),
          tagsRemoved: tagsBefore.filter((t) => !input.tags.includes(t)),
        },
        describeUpdate: text.noteUpdated,
        describeCreate: (title) => text.noteCreated(title),
      });
      return { ok: true, note: withRelations(row) };
    }),

    /** Moves the note to the trash; its tags and task links stay for a restore. False if there is no such note. */
    remove: db.transaction((id: number): boolean => {
      const before = selectNote.get(id);
      if (!before) return false;
      setDeletedAt.run(new Date().toISOString(), id);
      activities.record({
        projectId: before.project_id,
        entityType: 'note',
        entityId: id,
        actionType: 'delete',
        description: text.noteTrashed(before.title),
        metadata: { title: before.title },
      });
      return true;
    }),

    /** Brings a note back from the trash, as it was. Undefined if it is not in the trash. */
    restore: db.transaction((id: number): Note | undefined => {
      const row = selectTrashedNote.get(id);
      if (!row) return undefined;
      setDeletedAt.run(null, id);
      activities.record({
        projectId: row.project_id,
        entityType: 'note',
        entityId: id,
        actionType: 'restore',
        description: text.noteRestored(row.title),
        metadata: { title: row.title },
      });
      return withRelations(row);
    }),

    /**
     * Deletes a note in the trash for good; tasks created from it lose the link. With `log: false` the caller
     * records one entry for several notes (emptying the trash). Returns the deleted note's row, if there was one.
     */
    purge: db.transaction((id: number, log = true): NoteRow | undefined => {
      const row = selectTrashedNote.get(id);
      if (!row) return undefined;
      deleteNote.run(id);
      deleteUnusedTags.run();
      contentLinks.prune();
      if (log) {
        activities.record({
          projectId: row.project_id,
          entityType: 'note',
          entityId: id,
          actionType: 'purge',
          description: text.notePurged(row.title),
          metadata: { title: row.title },
        });
      }
      return row;
    }),

    /** Tags used by the project's notes, with how many of them use each. */
    listTags(projectId: number): TagSummary[] {
      return selectTagSummaries.all(projectId);
    },

    /** The tags of the notes in those of `projectIds` that are notebooks (US-22: the tags of Wissen). */
    listNotebookTags(projectIds: Iterable<number>): TagSummary[] {
      return selectNotebookTagSummaries.all(JSON.stringify([...projectIds]));
    },
  };
}

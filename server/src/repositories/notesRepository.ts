import type { Db } from '../database.js';
import type { NoteInput } from '../validation.js';
import type { LinkedTask } from './tasksRepository.js';

export interface Note {
  id: number;
  projectId: number;
  title: string;
  content: string;
  tags: string[];
  /** Tasks created from this note, oldest first. */
  tasks: LinkedTask[];
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
  title: string;
  source_note_id: number;
  column_id: number;
  column_name: string;
}

interface NoteRow {
  id: number;
  project_id: number;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export type NotesRepository = ReturnType<typeof createNotesRepository>;

export function createNotesRepository(db: Db) {
  const insertNote = db.prepare<[number, string, string, string, string], NoteRow>(
    `INSERT INTO notes (project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?) RETURNING *`,
  );
  const updateNote = db.prepare<[string, string, string, number], NoteRow>(
    `UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ? RETURNING *`,
  );
  const deleteNote = db.prepare<[number]>(`DELETE FROM notes WHERE id = ?`);
  const selectNote = db.prepare<[number], NoteRow>(`SELECT * FROM notes WHERE id = ?`);
  const selectTagsOfNote = db.prepare<[number], { name: string }>(
    `SELECT t.name FROM tags t JOIN note_tags nt ON nt.tag_id = t.id WHERE nt.note_id = ? ORDER BY t.name`,
  );
  const selectAllNoteTags = db.prepare<[number], { note_id: number; name: string }>(
    `SELECT nt.note_id, t.name FROM note_tags nt JOIN tags t ON t.id = nt.tag_id JOIN notes n ON n.id = nt.note_id
     WHERE n.project_id = ? ORDER BY t.name`,
  );
  const selectTasksOfNote = db.prepare<[number], LinkedTaskRow>(
    `SELECT t.id, t.title, t.source_note_id, c.id AS column_id, c.name AS column_name
     FROM tasks t JOIN board_columns c ON c.id = t.column_id
     WHERE t.source_note_id = ? ORDER BY t.id`,
  );
  const selectAllLinkedTasks = db.prepare<[number], LinkedTaskRow>(
    `SELECT t.id, t.title, t.source_note_id, c.id AS column_id, c.name AS column_name
     FROM tasks t JOIN board_columns c ON c.id = t.column_id
     WHERE t.project_id = ? AND t.source_note_id IS NOT NULL ORDER BY t.id`,
  );
  const toLinkedTask = (row: LinkedTaskRow): LinkedTask => ({
    id: row.id,
    title: row.title,
    column: { id: row.column_id, name: row.column_name },
  });
  const clearNoteTags = db.prepare<[number]>(`DELETE FROM note_tags WHERE note_id = ?`);
  const upsertTag = db.prepare<[string], { id: number }>(
    `INSERT INTO tags (name) VALUES (?) ON CONFLICT (name) DO UPDATE SET name = name RETURNING id`,
  );
  const linkTag = db.prepare<[number, number]>(`INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)`);
  const deleteUnusedTags = db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM note_tags)`);
  const selectTagSummaries = db.prepare<[number], TagSummary>(
    `SELECT t.id, t.name, COUNT(nt.note_id) AS noteCount
     FROM tags t JOIN note_tags nt ON nt.tag_id = t.id JOIN notes n ON n.id = nt.note_id
     WHERE n.project_id = ?
     GROUP BY t.id ORDER BY t.name`,
  );

  function setTags(noteId: number, tags: string[]): void {
    clearNoteTags.run(noteId);
    for (const name of tags) {
      linkTag.run(noteId, upsertTag.get(name)!.id);
    }
    deleteUnusedTags.run();
  }

  function toNote(row: NoteRow, tags: string[], tasks: LinkedTask[]): Note {
    return {
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      content: row.content,
      tags,
      tasks,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  function withRelations(row: NoteRow): Note {
    return toNote(
      row,
      selectTagsOfNote.all(row.id).map((t) => t.name),
      selectTasksOfNote.all(row.id).map(toLinkedTask),
    );
  }

  return {
    list(projectId: number, filter: NoteFilter = {}): Note[] {
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
          `SELECT n.* FROM notes n WHERE ${where.join(' AND ')}
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
      for (const row of selectAllLinkedTasks.all(projectId)) {
        const list = tasksByNote.get(row.source_note_id) ?? [];
        list.push(toLinkedTask(row));
        tasksByNote.set(row.source_note_id, list);
      }

      return rows.map((row) => toNote(row, tagsByNote.get(row.id) ?? [], tasksByNote.get(row.id) ?? []));
    },

    get(id: number): Note | undefined {
      const row = selectNote.get(id);
      return row && withRelations(row);
    },

    create: db.transaction((projectId: number, input: NoteInput): Note => {
      const now = new Date().toISOString();
      const row = insertNote.get(projectId, input.title, input.content, now, now)!;
      setTags(row.id, input.tags);
      return withRelations(row);
    }),

    /** Replaces title, content and tags. Returns undefined if the note does not exist. */
    update: db.transaction((id: number, input: NoteInput): Note | undefined => {
      const row = updateNote.get(input.title, input.content, new Date().toISOString(), id);
      if (!row) return undefined;
      setTags(id, input.tags);
      return withRelations(row);
    }),

    /** Returns false if the note did not exist. */
    remove: db.transaction((id: number): boolean => {
      const { changes } = deleteNote.run(id);
      deleteUnusedTags.run();
      return changes > 0;
    }),

    /** Tags used by the project's notes, with how many of them use each. */
    listTags(projectId: number): TagSummary[] {
      return selectTagSummaries.all(projectId);
    },
  };
}

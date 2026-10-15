import type { Db } from '../database.js';

export interface NoteHit {
  id: number;
  projectId: number;
  title: string;
  /** Text around the first match in the content, or the start of the content. */
  snippet: string;
}

export interface TaskHit {
  id: number;
  projectId: number;
  title: string;
  columnName: string;
}

const SNIPPET_LENGTH = 90;

/** A short excerpt of `content` around the first occurrence of `query`, on one line. */
export function snippetAround(content: string, query: string): string {
  // Highlights are stored as <mark data-color="…"> tags, which are not part of the text.
  const text = content.replace(/<\/?mark[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at <= 30) return text.slice(0, SNIPPET_LENGTH);
  return `… ${text.slice(at - 30, at - 30 + SNIPPET_LENGTH)}`;
}

export type SearchRepository = ReturnType<typeof createSearchRepository>;

/** Search across all projects for the command palette; hits of `preferProjectId` come first. The trash is left out. */
export function createSearchRepository(db: Db) {
  type Params = { project: number; pattern: string; limit: number };
  // Title hits rank above content hits; within that, the most recently changed come first.
  const selectNotes = db.prepare<[Params], { id: number; project_id: number; title: string; content: string }>(
    `SELECT n.id, n.project_id, n.title, n.content FROM live_notes n
     WHERE n.title LIKE @pattern ESCAPE '\\' OR n.content LIKE @pattern ESCAPE '\\' OR EXISTS (
       SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
       WHERE nt.note_id = n.id AND t.name LIKE @pattern ESCAPE '\\')
     ORDER BY n.project_id = @project DESC, n.title LIKE @pattern ESCAPE '\\' DESC, n.updated_at DESC
     LIMIT @limit`,
  );
  const selectTasks = db.prepare<[Params], { id: number; project_id: number; title: string; column_name: string }>(
    `SELECT t.id, t.project_id, t.title, c.name AS column_name FROM live_tasks t
     JOIN board_columns c ON c.id = t.column_id
     WHERE t.title LIKE @pattern ESCAPE '\\' OR t.description LIKE @pattern ESCAPE '\\'
     ORDER BY t.project_id = @project DESC, t.title LIKE @pattern ESCAPE '\\' DESC, t.updated_at DESC
     LIMIT @limit`,
  );

  return {
    search(query: string, preferProjectId: number, limit: number): { notes: NoteHit[]; tasks: TaskHit[] } {
      const params = { project: preferProjectId, pattern: `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, limit };
      const notes = selectNotes.all(params).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        snippet: snippetAround(row.content, query),
      }));
      const tasks = selectTasks.all(params).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        columnName: row.column_name,
      }));
      return { notes, tasks };
    },
  };
}

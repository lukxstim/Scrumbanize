import type { Statement } from 'better-sqlite3';
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

/** A short excerpt of `content` around the first occurrence of `query` (or of its first word that occurs), on one line. */
export function snippetAround(content: string, query: string): string {
  // Highlights are stored as <mark data-color="…"> tags, which are not part of the text.
  const text = content.replace(/<\/?mark[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const candidates = [query, ...searchWords(query)].map((w) => lower.indexOf(w.toLowerCase())).filter((at) => at >= 0);
  const at = candidates[0] ?? 0;
  if (at <= 30) return text.slice(0, SNIPPET_LENGTH);
  return `… ${text.slice(at - 30, at - 30 + SNIPPET_LENGTH)}`;
}

/** The words of a query; every one of them has to match somewhere (title, text or a tag), in any order. */
export function searchWords(query: string): string[] {
  return query.split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
}

/** "#17" or "17": the task with that number. */
const TASK_NUMBER = /^#?(\d{1,9})$/;
/** More words make no better search, only slower SQL. */
const MAX_WORDS = 8;

const likePattern = (word: string) => `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export type SearchRepository = ReturnType<typeof createSearchRepository>;

/** Search across all projects for the command palette; hits of `preferProjectId` come first. The trash is left out. */
export function createSearchRepository(db: Db) {
  // `allowed`: JSON array of the project ids the user may see, or null for all. `w0`, `w1`, …: one pattern per word.
  type Params = Record<string, string | number | null>;
  const noteWord = (w: string) => `(n.title LIKE @${w} ESCAPE '\\' OR n.content LIKE @${w} ESCAPE '\\' OR EXISTS (
         SELECT 1 FROM note_tags nt JOIN tags t ON t.id = nt.tag_id
         WHERE nt.note_id = n.id AND t.name LIKE @${w} ESCAPE '\\'))`;
  const taskWord = (w: string) => `(t.title LIKE @${w} ESCAPE '\\' OR t.description LIKE @${w} ESCAPE '\\' OR EXISTS (
         SELECT 1 FROM task_labels tl JOIN labels l ON l.id = tl.label_id
         WHERE tl.task_id = t.id AND l.name LIKE @${w} ESCAPE '\\'))`;
  const names = (count: number) => Array.from({ length: count }, (_, i) => `w${i}`);

  // Title hits of the whole query rank above other hits; within that, the most recently changed come first.
  // One statement per number of words, prepared on first use.
  const noteStatements = new Map<number, Statement<[Params], { id: number; project_id: number; title: string; content: string }>>();
  const taskStatements = new Map<number, Statement<[Params], { id: number; project_id: number; title: string; column_name: string }>>();
  function selectNotes(count: number) {
    let statement = noteStatements.get(count);
    if (!statement) {
      statement = db.prepare(
        `SELECT n.id, n.project_id, n.title, n.content FROM live_notes n
         WHERE (@allowed IS NULL OR n.project_id IN (SELECT value FROM json_each(@allowed)))
           AND ${names(count).map(noteWord).join(' AND ')}
         ORDER BY n.project_id = @project DESC, n.title LIKE @pattern ESCAPE '\\' DESC, n.updated_at DESC
         LIMIT @limit`,
      );
      noteStatements.set(count, statement);
    }
    return statement;
  }
  function selectTasks(count: number) {
    let statement = taskStatements.get(count);
    if (!statement) {
      // A task number ("#17") finds that task, too, and puts it first.
      statement = db.prepare(
        `SELECT t.id, t.project_id, t.title, c.name AS column_name FROM live_tasks t
         JOIN board_columns c ON c.id = t.column_id
         WHERE (@allowed IS NULL OR t.project_id IN (SELECT value FROM json_each(@allowed)))
           AND (t.id = @number OR (${names(count).map(taskWord).join(' AND ')}))
         ORDER BY t.id = @number DESC, t.project_id = @project DESC, t.title LIKE @pattern ESCAPE '\\' DESC, t.updated_at DESC
         LIMIT @limit`,
      );
      taskStatements.set(count, statement);
    }
    return statement;
  }

  return {
    /** `allowed`: the projects to search (the user's); undefined searches all. */
    search(query: string, preferProjectId: number, limit: number, allowed?: Iterable<number>): { notes: NoteHit[]; tasks: TaskHit[] } {
      const words = searchWords(query);
      if (words.length === 0) return { notes: [], tasks: [] };
      const params: Params = {
        project: preferProjectId,
        pattern: likePattern(query.trim()),
        number: Number(TASK_NUMBER.exec(query.trim())?.[1] ?? 0),
        limit,
        allowed: allowed === undefined ? null : JSON.stringify([...allowed]),
        ...Object.fromEntries(words.map((word, i) => [`w${i}`, likePattern(word)])),
      };
      const notes = selectNotes(words.length).all(params).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        snippet: snippetAround(row.content, query),
      }));
      const tasks = selectTasks(words.length).all(params).map((row) => ({
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        columnName: row.column_name,
      }));
      return { notes, tasks };
    },
  };
}

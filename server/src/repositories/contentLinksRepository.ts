import { canSee, visibleProjects } from '../auth/visibility.js';
import { findContentLinks, type ContentType } from '../contentLinks.js';
import type { Db } from '../database.js';
import type { ProjectKind } from './projectsRepository.js';
import { isDoneSql } from './doneColumn.js';

/** Where a note or task lives, for chips and lists that point into other projects. */
export interface ContentPlace {
  projectId: number;
  projectName: string;
  projectKind: ProjectKind;
}

/** A link target as the viewer may see it (US-22). */
export type ResolvedLink =
  | ({ type: ContentType; id: number; status: 'ok'; title: string; done?: boolean } & ContentPlace)
  /** In the trash (of a visible project). */
  | { type: ContentType; id: number; status: 'trashed' }
  /** Not visible to the viewer, or it does not exist (the two look the same, so nothing leaks). */
  | { type: ContentType; id: number; status: 'forbidden' };

/** A note or task whose content links to another. */
export interface Backlink extends ContentPlace {
  type: ContentType;
  id: number;
  title: string;
}

/** A suggestion for the [[ picker. */
export interface LinkCandidate extends ContentPlace {
  type: ContentType;
  id: number;
  title: string;
}

interface ItemRow {
  id: number;
  title: string;
  project_id: number;
  project_name: string;
  project_kind: ProjectKind;
}

export type ContentLinksRepository = ReturnType<typeof createContentLinksRepository>;

/**
 * The `content_links` table: which note or task links to which in its Markdown. Kept up to date whenever a note's
 * content or a task's description is saved; reads leave out the trash and what the viewer may not see.
 */
export function createContentLinksRepository(db: Db) {
  const deleteFrom = db.prepare<[ContentType, number]>(`DELETE FROM content_links WHERE source_type = ? AND source_id = ?`);
  const insert = db.prepare<[ContentType, number, ContentType, number]>(
    `INSERT OR IGNORE INTO content_links (source_type, source_id, target_type, target_id) VALUES (?, ?, ?, ?)`,
  );
  const placeSql = `p.id AS project_id, p.name AS project_name, p.kind AS project_kind`;
  const liveNote = db.prepare<[number], ItemRow>(
    `SELECT n.id, n.title, ${placeSql} FROM live_notes n JOIN projects p ON p.id = n.project_id WHERE n.id = ?`,
  );
  const liveTask = db.prepare<[number], ItemRow & { done: number }>(
    `SELECT t.id, t.title, ${isDoneSql('t')} AS done, ${placeSql} FROM live_tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ?`,
  );
  // Also trashed ones (and those in trashed projects): their project decides whether "trashed" may be said.
  const anyNote = db.prepare<[number], { project_id: number }>(`SELECT project_id FROM notes WHERE id = ?`);
  const anyTask = db.prepare<[number], { project_id: number }>(`SELECT project_id FROM tasks WHERE id = ?`);
  const noteSources = db.prepare<[ContentType, number], ItemRow>(
    `SELECT n.id, n.title, ${placeSql} FROM content_links l
     JOIN live_notes n ON n.id = l.source_id JOIN projects p ON p.id = n.project_id
     WHERE l.source_type = 'note' AND l.target_type = ? AND l.target_id = ? ORDER BY n.updated_at DESC`,
  );
  const taskSources = db.prepare<[ContentType, number], ItemRow>(
    `SELECT t.id, t.title, ${placeSql} FROM content_links l
     JOIN live_tasks t ON t.id = l.source_id JOIN projects p ON p.id = t.project_id
     WHERE l.source_type = 'task' AND l.target_type = ? AND l.target_id = ? ORDER BY t.updated_at DESC`,
  );
  type CandidateParams = { pattern: string; project: number; allowed: string | null; id: number; limit: number };
  const noteCandidates = db.prepare<[CandidateParams], ItemRow>(
    `SELECT n.id, n.title, ${placeSql} FROM live_notes n JOIN projects p ON p.id = n.project_id
     WHERE (@allowed IS NULL OR n.project_id IN (SELECT value FROM json_each(@allowed)))
       AND (n.title LIKE @pattern ESCAPE '\\' OR n.id = @id)
     ORDER BY n.project_id = @project DESC, n.updated_at DESC LIMIT @limit`,
  );
  const taskCandidates = db.prepare<[CandidateParams], ItemRow>(
    `SELECT t.id, t.title, ${placeSql} FROM live_tasks t JOIN projects p ON p.id = t.project_id
     WHERE (@allowed IS NULL OR t.project_id IN (SELECT value FROM json_each(@allowed)))
       AND (t.title LIKE @pattern ESCAPE '\\' OR t.id = @id)
     ORDER BY t.project_id = @project DESC, t.updated_at DESC LIMIT @limit`,
  );
  const projectLinks = db.prepare<[number, number], { source_type: ContentType; source_id: number; target_type: ContentType; target_id: number }>(
    `SELECT l.* FROM content_links l
     WHERE (l.source_type = 'note' AND l.source_id IN (SELECT id FROM live_notes WHERE project_id = ?))
        OR (l.source_type = 'task' AND l.source_id IN (SELECT id FROM live_tasks WHERE project_id = ?))`,
  );
  const prune = db.prepare(
    `DELETE FROM content_links
     WHERE (source_type = 'note' AND source_id NOT IN (SELECT id FROM notes))
        OR (source_type = 'task' AND source_id NOT IN (SELECT id FROM tasks))`,
  );

  const place = (row: ItemRow): ContentPlace => ({ projectId: row.project_id, projectName: row.project_name, projectKind: row.project_kind });
  const item = (type: ContentType, row: ItemRow) => ({ type, id: row.id, title: row.title, ...place(row) });

  function resolveOne(type: ContentType, id: number, visible: Set<number> | null): ResolvedLink {
    const row = type === 'note' ? liveNote.get(id) : liveTask.get(id);
    if (row && canSee(visible, row.project_id)) {
      return { ...item(type, row), status: 'ok', ...('done' in row ? { done: row.done === 1 } : {}) };
    }
    const any = type === 'note' ? anyNote.get(id) : anyTask.get(id);
    if (!row && any && canSee(visible, any.project_id)) return { type, id, status: 'trashed' };
    return { type, id, status: 'forbidden' };
  }

  return {
    /** Records the links in a note's content or a task's description (replacing earlier ones). */
    sync(type: ContentType, id: number, markdown: string): void {
      deleteFrom.run(type, id);
      for (const ref of findContentLinks(markdown)) {
        if (ref.type !== type || ref.id !== id) insert.run(type, id, ref.type, ref.id);
      }
    },

    /** Forgets the links of notes and tasks that were deleted for good. */
    prune(): void {
      prune.run();
    },

    /** What the current viewer may know about each target. */
    resolve(refs: { type: ContentType; id: number }[]): ResolvedLink[] {
      const visible = visibleProjects(db);
      return refs.map((ref) => resolveOne(ref.type, ref.id, visible));
    },

    /** Notes and tasks linking to this one that the viewer may see, newest first. */
    backlinks(type: ContentType, id: number): Backlink[] {
      const visible = visibleProjects(db);
      return [...noteSources.all(type, id).map((r) => item('note', r)), ...taskSources.all(type, id).map((r) => item('task', r))].filter((b) =>
        canSee(visible, b.projectId),
      );
    },

    /** For the [[ picker: notes and tasks by title (or "#17"), the current project's first. */
    candidates(query: string, preferProjectId: number, limit = 8): LinkCandidate[] {
      const visible = visibleProjects(db);
      const q = query.trim();
      const params = {
        pattern: `%${q.replace(/^#/, '').replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
        project: preferProjectId,
        allowed: visible === null ? null : JSON.stringify([...visible]),
        id: /^#?\d+$/.test(q) ? Number(q.replace('#', '')) : -1,
        limit,
      };
      return [...noteCandidates.all(params).map((r) => item('note', r)), ...taskCandidates.all(params).map((r) => item('task', r))];
    },

    /** Links whose source lives in the project (for the graph). */
    ofProject(projectId: number) {
      return projectLinks.all(projectId, projectId);
    },

    resolveOne: (type: ContentType, id: number) => resolveOne(type, id, visibleProjects(db)),
  };
}

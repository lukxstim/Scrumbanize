import type { EditSummary } from '../activityText.js';
import type { Db } from '../database.js';

export const ENTITY_TYPES = ['note', 'task', 'board', 'project'] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];
/** "delete" moves a note, task or project to the trash; "purge" deletes it for good. */
export type ActionType = 'create' | 'update' | 'move' | 'delete' | 'restore' | 'purge';

/** Edits of the same note or task within this window are aggregated into one entry (auto-save). */
export const AGGREGATE_WINDOW_MS = 10 * 60 * 1000;

export interface ActivityInput {
  projectId: number;
  entityType: EntityType;
  entityId: number | null;
  actionType: ActionType;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface Activity {
  id: number;
  projectId: number;
  entityType: EntityType;
  entityId: number | null;
  actionType: ActionType;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  /** Whether the note or task can be opened, so the UI only links to those. */
  exists: boolean;
  /** The note or task is in the trash (and could be restored). */
  trashed: boolean;
}

interface ActivityRow {
  id: number;
  project_id: number;
  entity_type: EntityType;
  entity_id: number | null;
  action_type: ActionType;
  description: string;
  metadata: string;
  created_at: string;
  entity_exists?: number;
  entity_trashed?: number;
}

export interface EditInput {
  projectId: number;
  entityType: 'note' | 'task';
  entityId: number;
  /** The current title, after the edit. */
  title: string;
  changes: EditSummary;
  describeUpdate: (title: string, changes: EditSummary) => string;
  /** Rewrites a recent "created" entry with the new title, e.g. a note titled right after creating it. */
  describeCreate: (title: string, createMetadata: Record<string, unknown>) => string;
}

const isEmpty = (changes: EditSummary) =>
  changes.fields.length === 0 && changes.tagsAdded.length === 0 && changes.tagsRemoved.length === 0;

/** Combines two edits; a tag added and removed again within the window cancels out. */
export function mergeChanges(earlier: EditSummary, later: EditSummary): EditSummary {
  const fields = [...new Set([...earlier.fields, ...later.fields])];
  const added = new Set(earlier.tagsAdded);
  const removed = new Set(earlier.tagsRemoved);
  for (const tag of later.tagsAdded) {
    if (removed.has(tag)) removed.delete(tag);
    else added.add(tag);
  }
  for (const tag of later.tagsRemoved) {
    if (added.has(tag)) added.delete(tag);
    else removed.add(tag);
  }
  // The later value of a field wins ("Fällig" moved twice shows the final date).
  const values = { ...earlier.values, ...later.values };
  return { fields, tagsAdded: [...added], tagsRemoved: [...removed], ...(Object.keys(values).length ? { values } : {}) };
}

export type ActivityRepository = ReturnType<typeof createActivityRepository>;

export function createActivityRepository(db: Db) {
  const insert = db.prepare<[number, EntityType, number | null, ActionType, string, string, string]>(
    `INSERT INTO activities (project_id, entity_type, entity_id, action_type, description, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const selectLatestForEntity = db.prepare<[EntityType, number], ActivityRow>(
    `SELECT * FROM activities WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC LIMIT 1`,
  );
  const deleteActivity = db.prepare<[number]>(`DELETE FROM activities WHERE id = ?`);

  function record(input: ActivityInput, now = new Date()): void {
    insert.run(
      input.projectId,
      input.entityType,
      input.entityId,
      input.actionType,
      input.description,
      JSON.stringify(input.metadata ?? {}),
      now.toISOString(),
    );
  }

  return {
    record,

    /**
     * Logs an edit of a note or task. Within AGGREGATE_WINDOW_MS of the entity's last "create" or "update"
     * entry, that entry is replaced by one with the combined changes (and a new id and time, so it moves
     * to the top). Edits that change nothing are not logged.
     */
    recordEdit(input: EditInput, now = new Date()): void {
      if (isEmpty(input.changes)) return;
      const latest = selectLatestForEntity.get(input.entityType, input.entityId);
      // Only "created" entries and other edit entries take further edits; "update" entries of other kinds
      // (links, attachments) carry no change summary to merge into and stay as they are.
      const recent =
        latest &&
        (latest.action_type === 'create' ||
          (latest.action_type === 'update' && (JSON.parse(latest.metadata) as { changes?: unknown }).changes !== undefined)) &&
        now.getTime() - new Date(latest.created_at).getTime() <= AGGREGATE_WINDOW_MS;

      if (!recent) {
        record(
          {
            projectId: input.projectId,
            entityType: input.entityType,
            entityId: input.entityId,
            actionType: 'update',
            description: input.describeUpdate(input.title, input.changes),
            metadata: { title: input.title, changes: input.changes },
          },
          now,
        );
        return;
      }

      const previous = JSON.parse(latest.metadata) as Record<string, unknown>;
      deleteActivity.run(latest.id);
      if (latest.action_type === 'create') {
        // Still "created", now with its current title; the edits are kept in the metadata.
        const metadata = { ...previous, title: input.title };
        record({ ...input, actionType: 'create', description: input.describeCreate(input.title, metadata), metadata }, now);
      } else {
        const changes = mergeChanges(previous.changes as EditSummary, input.changes);
        record(
          {
            ...input,
            actionType: 'update',
            description: input.describeUpdate(input.title, changes),
            metadata: { ...previous, title: input.title, changes },
          },
          now,
        );
      }
    },

    /** Newest first; `before` is the id of the last entry of the previous page. */
    list(projectId: number, options: { type?: EntityType; before?: number; limit: number }) {
      const params: (string | number)[] = [projectId];
      if (options.type) params.push(options.type);
      if (options.before) params.push(options.before);
      params.push(options.limit + 1); // one more than needed tells whether there is a next page

      const rows = db
        .prepare<(string | number)[], ActivityRow>(
          `SELECT a.*,
             CASE a.entity_type
               WHEN 'note' THEN EXISTS (SELECT 1 FROM live_notes WHERE id = a.entity_id)
               WHEN 'task' THEN EXISTS (SELECT 1 FROM live_tasks WHERE id = a.entity_id)
               ELSE 1
             END AS entity_exists,
             CASE a.entity_type
               WHEN 'note' THEN EXISTS (SELECT 1 FROM notes WHERE id = a.entity_id AND deleted_at IS NOT NULL)
               WHEN 'task' THEN EXISTS (SELECT 1 FROM tasks WHERE id = a.entity_id AND deleted_at IS NOT NULL)
               ELSE 0
             END AS entity_trashed
           FROM activities a
           WHERE a.project_id = ?
             ${options.type ? 'AND a.entity_type = ?' : ''}
             ${options.before ? 'AND a.id < ?' : ''}
           ORDER BY a.id DESC
           LIMIT ?`,
        )
        .all(...params);

      const page = rows.slice(0, options.limit);
      const items: Activity[] = page.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        actionType: row.action_type,
        description: row.description,
        metadata: JSON.parse(row.metadata) as Record<string, unknown>,
        createdAt: row.created_at,
        exists: row.entity_exists === 1,
        trashed: row.entity_trashed === 1,
      }));
      return { items, nextCursor: rows.length > options.limit ? page.at(-1)!.id : null };
    },
  };
}

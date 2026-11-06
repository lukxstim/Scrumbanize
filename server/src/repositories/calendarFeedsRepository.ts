import type { Db } from '../database.js';
import type { TaskPriority } from '../validation.js';
import { isDoneSql } from './doneColumn.js';
import { hashToken, newToken } from './usersRepository.js';

export type CalendarFeedsRepository = ReturnType<typeof createCalendarFeedsRepository>;

/** A task with a start or due date, for the calendar subscription. */
export interface FeedTask {
  id: number;
  projectId: number;
  projectName: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  priority: TaskPriority | null;
  done: boolean;
  updatedAt: string;
}

/**
 * Calendar subscriptions (US-33): one secret link per user. Only the token's SHA-256 hash is stored, like session
 * tokens, so the link is shown once when it is made; making a new one ends the old.
 */
export function createCalendarFeedsRepository(db: Db) {
  const selectFeed = db.prepare<[number], { created_at: string }>(`SELECT created_at FROM calendar_feeds WHERE user_id = ?`);
  const upsertFeed = db.prepare<[number, string, string]>(
    `INSERT INTO calendar_feeds (user_id, token_hash, created_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at`,
  );
  const deleteFeed = db.prepare<[number]>(`DELETE FROM calendar_feeds WHERE user_id = ?`);
  const selectOwner = db.prepare<[string], { user_id: number; password_hash: string | null }>(
    `SELECT f.user_id, u.password_hash FROM calendar_feeds f JOIN users u ON u.id = f.user_id
     WHERE f.token_hash = ? AND u.disabled_at IS NULL`,
  );
  const selectTasks = db.prepare<
    [],
    {
      id: number;
      project_id: number;
      project_name: string;
      title: string;
      start_date: string | null;
      due_date: string | null;
      priority: TaskPriority | null;
      done: number;
      updated_at: string;
    }
  >(
    `SELECT t.id, t.project_id, p.name AS project_name, t.title, t.start_date, t.due_date, t.priority, t.updated_at,
       ${isDoneSql('t')} AS done
     FROM live_tasks t JOIN live_projects p ON p.id = t.project_id
     WHERE t.start_date IS NOT NULL OR t.due_date IS NOT NULL
     ORDER BY COALESCE(t.start_date, t.due_date), t.id`,
  );

  return {
    /** Whether the user has a link, and since when. */
    status(userId: number): { createdAt: string } | null {
      const row = selectFeed.get(userId);
      return row ? { createdAt: row.created_at } : null;
    },

    /** A new link for the user; an older one stops working. Returns the token, which is not stored. */
    renew(userId: number, now = new Date()): { token: string; createdAt: string } {
      const token = newToken();
      const createdAt = now.toISOString();
      upsertFeed.run(userId, hashToken(token), createdAt);
      return { token, createdAt };
    },

    /** Ends the user's link; false if there was none. */
    revoke: (userId: number): boolean => deleteFeed.run(userId).changes === 1,

    /**
     * The user a token belongs to, unless they were disabled. With logins (`withPassword`), only real accounts
     * count: the local user of a desktop database must not open a server's data.
     */
    ownerOf(token: string, withPassword: boolean): number | undefined {
      const row = selectOwner.get(hashToken(token));
      if (!row || (withPassword && !row.password_hash)) return undefined;
      return row.user_id;
    },

    /** Tasks with a start or due date in the given projects; null: in all. */
    tasks(projectIds: Set<number> | null): FeedTask[] {
      return selectTasks
        .all()
        .filter((row) => projectIds === null || projectIds.has(row.project_id))
        .map((row) => ({
          id: row.id,
          projectId: row.project_id,
          projectName: row.project_name,
          title: row.title,
          startDate: row.start_date,
          dueDate: row.due_date,
          priority: row.priority,
          done: row.done === 1,
          updatedAt: row.updated_at,
        }));
    },
  };
}

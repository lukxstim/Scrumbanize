import type { RequestHandler, Response } from 'express';
import { userOf } from '../auth/middleware.js';
import type { ProjectColor } from '../repositories/projectsRepository.js';

/**
 * What changed in a project (US-24). Only ids: every viewer loads the new state through the API, with their own
 * role and visibility, so an event never shows anyone something from a project they cannot see (US-22).
 */
export type ChangeEvent =
  | { type: 'task.created' | 'task.updated' | 'task.moved' | 'task.deleted' | 'task.restored' | 'task.purged'; taskId: number }
  /** Linking changes both tasks. */
  | { type: 'task.linked'; taskIds: number[] }
  | { type: 'board.changed'; what: 'columns' | 'lanes' | 'labels' }
  | { type: 'note.created' | 'note.updated' | 'note.moved' | 'note.deleted' | 'note.restored' | 'note.purged'; noteId: number }
  /** Tasks were made from the note (its list of tasks), not an edit of its text. */
  | { type: 'note.tasks'; noteId: number }
  | { type: 'notes.imported' }
  | { type: 'folder.changed' }
  | { type: 'attachment.changed'; owner: 'task' | 'note'; ownerId: number }
  | { type: 'project.updated' | 'project.deleted' | 'project.restored' | 'project.purged' }
  | { type: 'members.changed' }
  | { type: 'trash.emptied' };

/** Who made a change, for "von Lukas verschoben". */
export interface Actor {
  id: number;
  name: string;
  avatarColor: ProjectColor;
  avatarUrl: string | null;
}

export type RealtimeMessage =
  | {
      kind: 'change';
      projectId: number;
      event: ChangeEvent;
      actor: Actor | null;
      /** The browser tab that made the change (X-Client-Id), so it can skip its own echo. */
      originId: string | null;
      at: string;
    }
  /** The projects these users may see changed (membership, account disabled, logout): their connections are checked again. */
  | { kind: 'access'; userIds: number[] | 'all' }
  /** A backup was restored: everything may have changed. */
  | { kind: 'restored' };

export type RealtimeListener = (message: RealtimeMessage) => void;

/** Passes messages from the API to the live connections (realtime/server.ts). Without listeners, it does nothing. */
export function createRealtimeHub() {
  const listeners = new Set<RealtimeListener>();
  return {
    dispatch(message: RealtimeMessage): void {
      for (const listener of listeners) listener(message);
    },
    subscribe(listener: RealtimeListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type RealtimeHub = ReturnType<typeof createRealtimeHub>;

type Queued = { kind: 'change'; projectId: number; event: ChangeEvent } | Extract<RealtimeMessage, { kind: 'access' }>;

const queueOf = (res: Response) => res.locals.realtime as Queued[] | undefined;

/** Announces a change once the response went out successfully; a failed request (and its rolled-back transaction) announces nothing. */
export function changed(res: Response, projectId: number, event: ChangeEvent): void {
  queueOf(res)?.push({ kind: 'change', projectId, event });
}

/** These users' connections join or leave project rooms (or end) once the response went out successfully. */
export function accessChanged(res: Response, userIds: number[] | 'all'): void {
  queueOf(res)?.push({ kind: 'access', userIds });
}

const CLIENT_ID = /^[\w-]{1,64}$/;

/** Collects the request's announcements and sends them, in order, after a successful response. */
export function realtimeQueue(hub: RealtimeHub): RequestHandler {
  return (req, res, next) => {
    const queue: Queued[] = [];
    res.locals.realtime = queue;
    res.on('finish', () => {
      if (queue.length === 0 || res.statusCode >= 400) return;
      const user = userOf(res);
      const actor = user ? { id: user.id, name: user.name, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl } : null;
      const clientId = req.get('x-client-id');
      const originId = clientId && CLIENT_ID.test(clientId) ? clientId : null;
      const at = new Date().toISOString();
      for (const item of queue) hub.dispatch(item.kind === 'change' ? { ...item, actor, originId, at } : item);
    });
    next();
  };
}

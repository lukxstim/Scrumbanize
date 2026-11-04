import type { ProjectColor } from './project';

/** Who made a change elsewhere (US-24); null without login (desktop app, AUTH=off), where names are not shown. */
export interface RealtimeActor {
  id: number;
  name: string;
  avatarColor: ProjectColor;
  avatarUrl: string | null;
}

/** A change in a project, as the server announces it: ids only, the new state comes from the API. */
export type ChangeEvent =
  | { type: 'task.created' | 'task.updated' | 'task.moved' | 'task.deleted' | 'task.restored' | 'task.purged'; taskId: number }
  | { type: 'task.linked'; taskIds: number[] }
  | { type: 'board.changed'; what: 'columns' | 'lanes' | 'labels' }
  | { type: 'note.created' | 'note.updated' | 'note.moved' | 'note.deleted' | 'note.restored' | 'note.purged'; noteId: number }
  | { type: 'note.tasks'; noteId: number }
  | { type: 'notes.imported' }
  /** The pages of a section were put in an order (US-34). */
  | { type: 'notes.reordered' }
  | { type: 'folder.changed' }
  | { type: 'attachment.changed'; owner: 'task' | 'note'; ownerId: number }
  | { type: 'project.updated' | 'project.deleted' | 'project.restored' | 'project.purged' }
  | { type: 'members.changed' }
  | { type: 'trash.emptied' };

export type RealtimeChange = ChangeEvent & { projectId: number; actor: RealtimeActor | null; originId: string | null; at: string };

/**
 * What the hooks receive: changes made elsewhere, and `resync` after the connection came back, when changes may
 * have been missed and the data should be loaded again.
 */
export type RealtimeEvent = RealtimeChange | { type: 'resync' };

/** A note, or a task's title and description, that someone looks at or edits. */
export interface ItemRef {
  type: 'note' | 'task';
  id: number;
}

/** Someone in a project right now, with the notes and tasks open in their pages (US-24). */
export interface Viewer {
  user: RealtimeActor;
  items: ItemRef[];
}

/** Someone edits an item (soft lock): others see it read-only, with "Trotzdem bearbeiten". */
export interface LockInfo {
  item: ItemRef;
  user: RealtimeActor;
  /** The browser tab holding it; compared with this tab's clientId. */
  clientId: string;
  since: string;
}

/** The server's answer to taking a lock; `holder` null: the user may not edit the item, or it is gone. */
export type LockAnswer = { ok: true } | { ok: false; holder: LockInfo | null };

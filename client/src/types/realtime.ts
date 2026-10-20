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

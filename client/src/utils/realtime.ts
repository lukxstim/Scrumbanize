import type { RealtimeActor, RealtimeEvent } from '../types/realtime';

/**
 * Identifies this browser tab (sent as X-Client-Id), so it skips the announcements of its own changes (US-24); other
 * tabs of the same person still get them. crypto.randomUUID only exists on HTTPS and localhost, and Scrumbanize may
 * also be opened over plain HTTP in the local network.
 */
export const clientId: string =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const TASK_VERBS = {
  'task.created': 'angelegt',
  'task.updated': 'geändert',
  'task.moved': 'verschoben',
  'task.restored': 'wiederhergestellt',
  'task.linked': 'verknüpft',
  'attachment.changed': 'geändert',
} as const;

/** "von Lukas verschoben"; null without a name (no login), where the card only lights up. */
export function remoteLabel(type: keyof typeof TASK_VERBS, actor: RealtimeActor | null): string | null {
  return actor ? `von ${actor.name} ${TASK_VERBS[type]}` : null;
}

export interface BoardPlan {
  /** Columns, lanes or labels changed, or changes may have been missed: load the whole board. */
  reload: boolean;
  /** Tasks to load again (new, changed, moved, restored). */
  refetch: number[];
  /** Tasks that are gone (trash, purged). */
  remove: number[];
  /** Cards to highlight, with what to say on them. */
  marks: Map<number, string | null>;
}

/** What the board does with a batch of changes from elsewhere. A task that is gone is not loaded again. */
export function planBoard(events: RealtimeEvent[]): BoardPlan {
  let reload = false;
  const refetch = new Set<number>();
  const remove = new Set<number>();
  const marks = new Map<number, string | null>();
  const touch = (id: number, type: keyof typeof TASK_VERBS, actor: RealtimeActor | null) => {
    refetch.add(id);
    remove.delete(id);
    marks.set(id, remoteLabel(type, actor));
  };
  for (const event of events) {
    switch (event.type) {
      case 'resync':
      case 'board.changed':
        reload = true;
        break;
      case 'task.created':
      case 'task.updated':
      case 'task.moved':
      case 'task.restored':
        touch(event.taskId, event.type, event.actor);
        break;
      case 'task.linked':
        for (const id of event.taskIds) touch(id, event.type, event.actor);
        break;
      case 'attachment.changed':
        if (event.owner === 'task') touch(event.ownerId, event.type, event.actor);
        break;
      case 'task.deleted':
      case 'task.purged':
        remove.add(event.taskId);
        refetch.delete(event.taskId);
        marks.delete(event.taskId);
        break;
    }
  }
  return { reload, refetch: [...refetch], remove: [...remove], marks };
}

export interface NotesPlan {
  /** Load the whole list again (imports, missed changes, and new notes in "Alle Notizen", whose places are not known here). */
  reload: boolean;
  refetch: number[];
  remove: number[];
  /** Notes whose text someone else changed: an open editor takes it over or offers to (see NoteEditor). */
  edited: Map<number, RealtimeActor | null>;
  /** Folders changed, so notes may sit elsewhere now. */
  folders: boolean;
}

/** What a list of notes does with a batch of changes; `all`: "Alle Notizen" in Wissen (US-22). */
export function planNotes(events: RealtimeEvent[], all: boolean): NotesPlan {
  let reload = false;
  let folders = false;
  const refetch = new Set<number>();
  const remove = new Set<number>();
  const edited = new Map<number, RealtimeActor | null>();
  for (const event of events) {
    switch (event.type) {
      case 'resync':
      case 'notes.imported':
        reload = true;
        folders = true;
        break;
      case 'folder.changed':
        folders = true;
        break;
      case 'note.created':
      case 'note.restored':
        if (all) reload = true;
        else refetch.add(event.noteId);
        remove.delete(event.noteId);
        break;
      case 'note.updated':
        edited.set(event.noteId, event.actor);
        refetch.add(event.noteId);
        break;
      case 'note.moved':
      case 'note.tasks':
        refetch.add(event.noteId);
        break;
      case 'attachment.changed':
        if (event.owner === 'note') refetch.add(event.ownerId);
        break;
      case 'note.deleted':
      case 'note.purged':
        remove.add(event.noteId);
        refetch.delete(event.noteId);
        edited.delete(event.noteId);
        break;
    }
  }
  return { reload, refetch: [...refetch], remove: [...remove], edited, folders };
}

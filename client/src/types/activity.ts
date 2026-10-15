export type ActivityEntity = 'note' | 'task' | 'board' | 'project';
/** "delete" moved something to the trash, "purge" deleted it for good. */
export type ActivityAction = 'create' | 'update' | 'move' | 'delete' | 'restore' | 'purge';

export interface Activity {
  id: number;
  projectId: number;
  entityType: ActivityEntity;
  /** Note, task, column or lane id; for board entries `metadata.kind` says which. */
  entityId: number | null;
  actionType: ActivityAction;
  /** Ready-made German text, written when the action happened. */
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  /** Whether the note or task can be opened (always true for board and project entries). */
  exists: boolean;
  /** The note or task is in the trash. */
  trashed: boolean;
}

export interface ActivityPage {
  items: Activity[];
  /** Pass as `before` to load the next (older) page; null on the last page. */
  nextCursor: number | null;
}

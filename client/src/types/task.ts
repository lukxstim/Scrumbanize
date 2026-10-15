export interface Task {
  id: number;
  projectId: number;
  columnId: number;
  laneId: number;
  title: string;
  /** Markdown, copied from the source note when the task was created. */
  description: string;
  /** Order within the task's cell (column × lane), ascending. */
  position: number;
  /** The note the task was created from, with its tags; null if it was created elsewhere or the note was deleted. */
  sourceNote: { id: number; title: string; tags: string[] } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  description: string;
  sourceNoteId?: number;
  /** The lane to create the task in; the first lane if omitted. New tasks always start in the first column. */
  laneId?: number;
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'description'>>;

export interface BoardColumn {
  id: number;
  name: string;
  position: number;
  /** Counts the column's tasks across all lanes; null means unlimited. */
  wipLimit: number | null;
}

export interface Lane {
  id: number;
  name: string;
  position: number;
}

/** The short form of a task that notes carry. */
export interface LinkedTask {
  id: number;
  title: string;
  column: { id: number; name: string };
}

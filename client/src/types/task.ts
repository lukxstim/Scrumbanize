export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';

export interface Task {
  id: number;
  title: string;
  /** Markdown, copied from the source note when the task was created. */
  description: string;
  status: TaskStatus;
  /** Order within the task's column, ascending. */
  position: number;
  /** The note the task was created from; null if it was created elsewhere or the note was deleted. */
  sourceNote: { id: number; title: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  description: string;
  sourceNoteId?: number;
}

/** The short form of a task that notes carry. */
export type LinkedTask = Pick<Task, 'id' | 'title' | 'status'>;

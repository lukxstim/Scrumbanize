import type { Attachment } from './attachment';
import type { ProjectColor, ProjectKind } from './project';

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** A link as seen from the task carrying it: it relates to, blocks, or is blocked by the other task. */
export type LinkKind = 'relates' | 'blocks' | 'blocked_by';

export interface TaskLink {
  id: number;
  kind: LinkKind;
  /** `done`: the other task is in the project's last column. */
  task: { id: number; title: string; columnId: number; columnName: string; done: boolean };
}

/** A colored label of the project's tasks. */
export interface Label {
  id: number;
  name: string;
  color: ProjectColor;
}

/** A note linked with a task in Markdown (US-22), either way; it may live in a notebook. */
export interface LinkedNote {
  id: number;
  title: string;
  projectId: number;
  projectName: string;
  projectKind: ProjectKind;
}

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
  /** May live in another project or notebook (US-22); `restricted`: the user may not see it (no title, no tags). */
  sourceNote: { id: number; projectId: number; title: string; tags: string[]; restricted: boolean } | null;
  /** Notes named in the description or naming this task, also from notebooks; not the source note. By title. */
  linkedNotes: LinkedNote[];
  priority: TaskPriority | null;
  /** Links to other tasks of the project, oldest first. */
  links: TaskLink[];
  /** Attached files, oldest first. */
  attachments: Attachment[];
  /** In the project's label order. */
  labels: Label[];
  /** Calendar dates YYYY-MM-DD; a start date always comes with a due date on or after it. */
  startDate: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInput {
  title: string;
  description: string;
  sourceNoteId?: number;
  /** The lane to create the task in; the first lane if omitted. */
  laneId?: number;
  /** The column to create the task in; the first column if omitted. */
  columnId?: number;
  labelIds?: number[];
  priority?: TaskPriority | null;
  startDate?: string | null;
  dueDate?: string | null;
}

/** Undefined keeps a value, null removes priority or a date; `labelIds` replaces the labels. */
export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'priority' | 'startDate' | 'dueDate'>> & { labelIds?: number[] };

export interface BoardColumn {
  id: number;
  name: string;
  position: number;
  /** Counts the column's tasks across all lanes; null means unlimited. */
  wipLimit: number | null;
  /** Width in pixels (200–600), the same on every device; null means the default width (see columnWidths.ts). */
  width: number | null;
}

export interface Lane {
  id: number;
  name: string;
  position: number;
}

/** The short form of a task that notes carry. */
export interface LinkedTask {
  id: number;
  /** May differ from the note's project (US-22: converted into another project). */
  projectId: number;
  title: string;
  column: { id: number; name: string };
  /** In a project the user may not see: no title, no column. */
  restricted: boolean;
}

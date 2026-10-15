import type { Note } from './note';
import type { Project, ProjectColor } from './project';
import type { Task } from './task';

export type TrashType = 'note' | 'task' | 'project';

/** One entry of the trash. Notes and tasks of a trashed project are not listed; they come back with it. */
export interface TrashItem {
  type: TrashType;
  id: number;
  /** For a project its own id. */
  projectId: number;
  projectName: string;
  projectColor: ProjectColor;
  title: string;
  deletedAt: string;
  /** Notes: the start of the content. */
  snippet?: string;
  /** Tasks: the column they come back to. */
  columnName?: string;
  /** Projects: the notes and tasks that come back with them. */
  noteCount?: number;
  taskCount?: number;
}

export type RestoreResult =
  | { type: 'note'; item: Note }
  | { type: 'task'; item: Task }
  /** `renamedFrom` is set when the project's name was taken and it got a free one like "Studium (2)". */
  | { type: 'project'; item: Project; renamedFrom?: string };

export interface EmptyResult {
  notes: number;
  tasks: number;
  projects: number;
}

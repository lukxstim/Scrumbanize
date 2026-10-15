import type { LinkedTask } from './task';

export interface Note {
  id: number;
  projectId: number;
  title: string;
  /** Markdown source. */
  content: string;
  /** Normalized tag names, sorted alphabetically. */
  tags: string[];
  /** Tasks created from this note, oldest first. */
  tasks: LinkedTask[];
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

export type NoteInput = Pick<Note, 'title' | 'content' | 'tags'>;

export interface TagCount {
  name: string;
  count: number;
}

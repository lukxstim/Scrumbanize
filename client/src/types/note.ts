import type { Attachment } from './attachment';
import type { LinkedTask } from './task';

/** The colors a note can have (US-26), like the Windows Sticky Notes. */
export const NOTE_COLORS = ['yellow', 'green', 'pink', 'purple', 'blue', 'gray'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export interface Note {
  id: number;
  projectId: number;
  /** The folder (US-22); null at the top level. */
  folderId: number | null;
  /** Its place among the pages of its folder (US-34); null while not put in order. */
  position: number | null;
  /** Its own color (US-26); null: the quick notes pick one from its id. */
  color: NoteColor | null;
  title: string;
  /** Markdown source. */
  content: string;
  /** Normalized tag names, sorted alphabetically. */
  tags: string[];
  /** Tasks created from this note, oldest first. */
  tasks: LinkedTask[];
  /** Attached files, oldest first. */
  attachments: Attachment[];
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

export type NoteInput = Pick<Note, 'title' | 'content' | 'tags'>;

/** A folder of notes (US-22), in projects and notebooks; at most five levels deep. */
export interface Folder {
  id: number;
  projectId: number;
  /** null: at the top level. */
  parentId: number | null;
  name: string;
  position: number;
}

export interface TagCount {
  name: string;
  count: number;
}

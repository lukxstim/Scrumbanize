export interface Note {
  id: number;
  title: string;
  /** Markdown source. */
  content: string;
  /** Normalized tag names, sorted alphabetically. */
  tags: string[];
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

export type NoteInput = Pick<Note, 'title' | 'content' | 'tags'>;

export interface TagCount {
  name: string;
  count: number;
}

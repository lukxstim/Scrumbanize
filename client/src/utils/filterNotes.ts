import type { Note } from '../types/note';

/**
 * Keeps notes that carry every selected tag and match every word of `query`.
 * A word matches if it appears in the title, the content or a tag name (case-insensitive).
 */
export function filterNotes(notes: Note[], query: string, selectedTags: string[]): Note[] {
  const words = query.toLocaleLowerCase('de').split(/\s+/).filter(Boolean);

  return notes.filter((note) => {
    if (!selectedTags.every((tag) => note.tags.includes(tag))) return false;
    if (words.length === 0) return true;

    const haystack = [note.title, note.content, ...note.tags].join('\n').toLocaleLowerCase('de');
    return words.every((word) => haystack.includes(word));
  });
}

/** Newest first. */
export function sortByUpdated(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id);
}

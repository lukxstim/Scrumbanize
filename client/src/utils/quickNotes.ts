import type { Note, NoteInput } from '../types/note';

/**
 * Quick notes (US-26), like the Windows Sticky Notes: short notes typed into a panel at the right edge of the screen.
 * They are notes of their own notebook, so search, links and backups include them. In the panel a note is one text:
 * its first line is the title, the rest the content.
 */
export const QUICK_NOTEBOOK_NAME = 'Kurznotizen';

/** The text of a quick note as one piece, for editing. */
export function quickText(note: Pick<Note, 'title' | 'content'>): string {
  return note.content ? `${note.title}\n${note.content}` : note.title;
}

/** Title and content from the text: the first line (at most 200 characters) and everything after it. */
export function fromQuickText(text: string, tags: string[] = []): NoteInput {
  const trimmed = text.replace(/^\s*\n/, '').trimEnd();
  const newline = trimmed.indexOf('\n');
  const first = (newline === -1 ? trimmed : trimmed.slice(0, newline)).trim();
  const rest = newline === -1 ? '' : trimmed.slice(newline + 1);
  return { title: first.slice(0, 200), content: first.length > 200 ? `${first.slice(200)}\n${rest}`.trim() : rest, tags };
}

/** A line of a card: list items (`- `, `* `, `1. `, `- [ ]`) as bullets; Markdown marks dropped. */
export interface PreviewLine {
  text: string;
  bullet: boolean;
}

const MARKS = /(\*\*|__|~~|`|==)/g;

export function previewLines(content: string, max = 8): PreviewLine[] {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !/^(-{3,}|\|[-: |]+\|)$/.test(line))
    .slice(0, max)
    .map((line) => {
      const item = /^(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)(.*)$/.exec(line);
      const text = (item ? item[1]! : line.replace(/^#{1,6}\s+/, '')).replace(MARKS, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
      return { text, bullet: item !== null };
    });
}

/** The colors of the cards, like the Windows Sticky Notes; every note keeps its own. */
export const QUICK_COLORS = [
  { bar: 'bg-amber-300 dark:bg-amber-400', card: 'bg-amber-50 dark:bg-amber-950/60' },
  { bar: 'bg-green-400 dark:bg-green-500', card: 'bg-green-50 dark:bg-green-950/60' },
  { bar: 'bg-fuchsia-300 dark:bg-fuchsia-400', card: 'bg-fuchsia-50 dark:bg-fuchsia-950/60' },
  { bar: 'bg-violet-300 dark:bg-violet-400', card: 'bg-violet-50 dark:bg-violet-950/60' },
  { bar: 'bg-sky-300 dark:bg-sky-400', card: 'bg-sky-50 dark:bg-sky-950/60' },
  { bar: 'bg-zinc-300 dark:bg-zinc-500', card: 'bg-zinc-100 dark:bg-zinc-800/80' },
] as const;

export const quickColor = (noteId: number) => QUICK_COLORS[noteId % QUICK_COLORS.length]!;

/** The cards in the panel: matching the search (every word somewhere), most recently changed first. */
export function quickCards(notes: Note[], query: string): Note[] {
  const words = query.toLocaleLowerCase('de').split(/\s+/).filter(Boolean);
  return notes
    .filter((note) => {
      const text = quickText(note).toLocaleLowerCase('de');
      return words.every((word) => text.includes(word));
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id - a.id);
}

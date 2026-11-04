import { NOTE_COLORS, type Note, type NoteColor, type NoteInput } from '../types/note';

/**
 * Quick notes (US-26), like the Windows Sticky Notes: short notes typed into a panel at the right edge of the screen.
 * They are notes of their own notebook, so search, links and backups include them. In the panel a note is one
 * formatted text: its first paragraph is the title (shown in bold), the rest the content.
 */
export const QUICK_NOTEBOOK_NAME = 'Kurznotizen';

/** The text of a quick note as one plain piece, for the search. */
export function quickText(note: Pick<Note, 'title' | 'content'>): string {
  return note.content ? `${note.title}\n${note.content}` : note.title;
}

// Characters that could start Markdown syntax inside a line, and at the start of one.
const INLINE_SYNTAX = /[\\*_~`[\]<=]/g;
const LINE_START_SYNTAX = /^(#|>|[-+]\s|\d+[.)]\s)/;

/** The title as the first paragraph of Markdown: its characters stay text, nothing becomes formatting. */
function escapeTitle(title: string): string {
  const inline = title.replace(INLINE_SYNTAX, '\\$&');
  return LINE_START_SYNTAX.test(inline) ? `\\${inline}` : inline;
}

/** The whole note as Markdown for the editor of its card: the title as the first paragraph, then the content. */
export function quickMarkdown(note: Pick<Note, 'title' | 'content'>): string {
  if (!note.title) return note.content;
  return note.content ? `${escapeTitle(note.title)}\n\n${note.content}` : escapeTitle(note.title);
}

/** A line of Markdown as plain text: formatting, highlights and link targets dropped, escapes undone. */
function plainLine(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/<\/?mark[^>]*>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|==)(.+?)\1/g, '$2')
    .replace(/(^|[^\\\w])([*_])(\S(?:.*?\S)?)\2(?!\w)/g, '$1$3')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([!-/:-@[-`{-~])/g, '$1')
    .trim();
}

// The first block is a list, a quote, a code block, a table or HTML: no title, it all stays content.
const STRUCTURED_START = /^(\s*([-*+]|\d+[.)])\s|>|```|~~~|\||<(?!mark))/;

/**
 * Title and content from the Markdown of a card: the first line of a leading paragraph (as plain text, at most 200
 * characters, the end of a longer one goes into the content) and everything after it. A card that starts with a list
 * (say a checklist) has no title.
 */
export function fromQuickMarkdown(markdown: string, tags: string[] = []): NoteInput {
  const text = markdown.replace(/^\s*\n/, '').trimEnd();
  if (!text || STRUCTURED_START.test(text)) return { title: '', content: text.trim(), tags };
  const newline = text.indexOf('\n');
  // A hard line break ends the title line, too.
  const first = plainLine((newline === -1 ? text : text.slice(0, newline)).replace(/(\\| {2,})$/, ''));
  const rest = newline === -1 ? '' : text.slice(newline + 1).replace(/^\n+/, '');
  if (first.length <= 200) return { title: first, content: rest, tags };
  return { title: first.slice(0, 200), content: `${first.slice(200)}\n\n${rest}`.trim(), tags };
}

/** The colors of the cards, like the Windows Sticky Notes. */
export const QUICK_COLORS: Record<NoteColor, { label: string; bar: string; card: string }> = {
  yellow: { label: 'Gelb', bar: 'bg-amber-300 dark:bg-amber-400', card: 'bg-amber-50 dark:bg-amber-950/60' },
  green: { label: 'Grün', bar: 'bg-green-400 dark:bg-green-500', card: 'bg-green-50 dark:bg-green-950/60' },
  pink: { label: 'Pink', bar: 'bg-fuchsia-300 dark:bg-fuchsia-400', card: 'bg-fuchsia-50 dark:bg-fuchsia-950/60' },
  purple: { label: 'Lila', bar: 'bg-violet-300 dark:bg-violet-400', card: 'bg-violet-50 dark:bg-violet-950/60' },
  blue: { label: 'Blau', bar: 'bg-sky-300 dark:bg-sky-400', card: 'bg-sky-50 dark:bg-sky-950/60' },
  gray: { label: 'Grau', bar: 'bg-zinc-300 dark:bg-zinc-500', card: 'bg-zinc-100 dark:bg-zinc-800/80' },
};

/** A note's color: its own, or else one picked from its id, so every note keeps the same. */
export const quickColorOf = (note: Pick<Note, 'id' | 'color'> | null): NoteColor =>
  note?.color ?? NOTE_COLORS[(note?.id ?? 0) % NOTE_COLORS.length]!;

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

import type { TaskPriority } from '../types/task';

export const UNTITLED_NOTE = 'Unbenannte Notiz';
const MAX_TITLE_LENGTH = 120;

export interface TaskDraft {
  title: string;
  description: string;
  priority?: TaskPriority | null;
  dueDate?: string | null;
}

/**
 * Suggests a task for a note: the whole note, or only `selection` if it contains text.
 * For a selection, the title is its first non-empty line without Markdown syntax.
 */
export function buildTaskDraft(note: { title: string; content: string }, selection = ''): TaskDraft {
  if (selection.trim()) {
    const firstLine = selection.split('\n').find((line) => line.trim()) ?? '';
    return {
      title: plainText(firstLine).slice(0, MAX_TITLE_LENGTH).trim() || note.title.trim() || UNTITLED_NOTE,
      description: selection.trim(),
    };
  }

  return {
    title: note.title.trim().slice(0, MAX_TITLE_LENGTH) || UNTITLED_NOTE,
    description: note.content.trim(),
  };
}

/** Strips the Markdown syntax that commonly starts or decorates a single line. */
function plainText(line: string): string {
  return line
    .replace(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)*/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|\*|_|~~|`)(.+?)\1/g, '$2')
    .replace(/\s+/g, ' ')
    .trim();
}

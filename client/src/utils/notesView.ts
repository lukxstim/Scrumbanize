/**
 * How the notes are shown (US-34), chosen by each person and remembered in the browser: as a tree under the notebooks
 * in the sidebar (titles only, like OneNote) or as a list beside it (with preview and date, as before); and whether
 * tags appear on the notes and in the sidebar.
 */
export type NotesLayout = 'tree' | 'list';

export interface NotesView {
  layout: NotesLayout;
  showTags: boolean;
}

export const NOTES_VIEW_KEY = 'scrumbanize.notesView';
export const DEFAULT_NOTES_VIEW: NotesView = { layout: 'tree', showTags: false };

export function isNotesView(value: unknown): value is NotesView {
  if (typeof value !== 'object' || value === null) return false;
  const view = value as Record<string, unknown>;
  return (view.layout === 'tree' || view.layout === 'list') && typeof view.showTags === 'boolean';
}

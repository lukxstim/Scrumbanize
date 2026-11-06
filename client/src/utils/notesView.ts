/**
 * How the notes are shown (US-34), chosen by each person and remembered in the browser: as a tree under the notebooks
 * in the sidebar (titles only, like OneNote) or as a list beside it (with preview and date, as before); whether
 * tags appear on the notes and in the sidebar; and whether "Verlinkt von" under a note starts open or closed.
 */
export type NotesLayout = 'tree' | 'list';

export interface NotesView {
  layout: NotesLayout;
  showTags: boolean;
  backlinksOpen: boolean;
}

export const NOTES_VIEW_KEY = 'scrumbanize.notesView';
export const DEFAULT_NOTES_VIEW: NotesView = { layout: 'tree', showTags: false, backlinksOpen: true };

/** A stored view; `backlinksOpen` came later, so a view stored without it still counts (see `withDefaults`). */
export function isNotesView(value: unknown): value is NotesView {
  if (typeof value !== 'object' || value === null) return false;
  const view = value as Record<string, unknown>;
  return (
    (view.layout === 'tree' || view.layout === 'list') &&
    typeof view.showTags === 'boolean' &&
    (view.backlinksOpen === undefined || typeof view.backlinksOpen === 'boolean')
  );
}

/** Fills in the choices a view stored by an older version does not have yet. */
export function withDefaults(view: NotesView): NotesView {
  return { ...DEFAULT_NOTES_VIEW, ...view, backlinksOpen: view.backlinksOpen ?? DEFAULT_NOTES_VIEW.backlinksOpen };
}

/** App-wide requests between components that are far apart, e.g. from the command palette. */

const NEW_PROJECT = 'scrumbanize:new-project';

/** Asks the project switcher to open its "Neues Projekt" dialog. */
export function requestNewProject(): void {
  window.dispatchEvent(new Event(NEW_PROJECT));
}

export function onNewProjectRequest(handler: () => void): () => void {
  window.addEventListener(NEW_PROJECT, handler);
  return () => window.removeEventListener(NEW_PROJECT, handler);
}

/**
 * Navigation state that asks the notes page or the board to create something once it has loaded.
 * The palette passes it along with the navigation, so the page's own data stays in sync.
 */
export type CreateRequest = { create: 'note' | 'task'; title: string; /** Start from this template. */ templateId?: number };

export function isCreateRequest(state: unknown): state is CreateRequest {
  const s = state as CreateRequest | null;
  return !!s && (s.create === 'note' || s.create === 'task') && typeof s.title === 'string';
}

const START_TOUR = 'scrumbanize:start-tour';

/** Starts the onboarding tour again (from the command palette). */
export function requestTourStart(): void {
  window.dispatchEvent(new Event(START_TOUR));
}

export function onTourStartRequest(handler: () => void): () => void {
  window.addEventListener(START_TOUR, handler);
  return () => window.removeEventListener(START_TOUR, handler);
}

const TRASH_CHANGED = 'scrumbanize:trash-changed';

/** Something went into or out of the trash, so the trash tab updates its count. */
export function notifyTrashChanged(): void {
  window.dispatchEvent(new Event(TRASH_CHANGED));
}

export function onTrashChanged(handler: () => void): () => void {
  window.addEventListener(TRASH_CHANGED, handler);
  return () => window.removeEventListener(TRASH_CHANGED, handler);
}

const DIALOG_OPENED = 'scrumbanize:dialog-opened';

/** Announces that a modal dialog opened, so the toasts can move above it (see useToast). */
export function notifyDialogOpened(): void {
  window.dispatchEvent(new Event(DIALOG_OPENED));
}

export function onDialogOpened(handler: () => void): () => void {
  window.addEventListener(DIALOG_OPENED, handler);
  return () => window.removeEventListener(DIALOG_OPENED, handler);
}

import { DEFAULT_NOTES_VIEW, isNotesView, NOTES_VIEW_KEY } from '../utils/notesView';
import { useStoredState } from './useStoredState';

/** The chosen view of the notes (US-34); every component using it changes together. */
export function useNotesView() {
  return useStoredState(NOTES_VIEW_KEY, DEFAULT_NOTES_VIEW, isNotesView);
}

import { DEFAULT_NOTES_VIEW, isNotesView, NOTES_VIEW_KEY, withDefaults } from '../utils/notesView';
import { useStoredState } from './useStoredState';

/** The chosen view of the notes (US-34); every component using it changes together. */
export function useNotesView() {
  const [view, setView] = useStoredState(NOTES_VIEW_KEY, DEFAULT_NOTES_VIEW, isNotesView);
  return [withDefaults(view), setView] as const;
}

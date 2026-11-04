import { createContext, useContext } from 'react';

/**
 * The place under the open notebook in the sidebar (US-34). In the tree view the notes page renders its folders and
 * notes there (as a portal), so they hang under their notebook like pages in OneNote. Null on phones and while the
 * sidebar is not shown.
 */
export const NotebookTreeSlot = createContext<HTMLElement | null>(null);

export const useNotebookTreeSlot = () => useContext(NotebookTreeSlot);

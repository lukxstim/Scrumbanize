import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useFolders } from '../../hooks/useFolders';
import { useStoredState } from '../../hooks/useStoredState';
import type { Note } from '../../types/note';
import { notesApi } from '../../utils/api';
import { onNotesChanged } from '../../utils/appEvents';
import { paths } from '../../utils/paths';
import { DEFAULT_PAGE_SORT, isPageSort, PAGE_SORT_KEY, pagesOf, SECTION_PARAM, sectionParam, type PageSort, type SectionId } from '../../utils/sections';
import NotebookSections from '../notes/NotebookSections';

/**
 * The sections of a notebook that is open in the sidebar beside the one shown (US-34): a click opens the section's
 * first page there, and pages dragged from the list beside the sidebar can be dropped on its sections.
 */
export default function NotebookSectionsPreview({ projectId }: { projectId: number }) {
  const { folders } = useFolders(projectId);
  const [notes, setNotes] = useState<Note[]>([]);
  const [pageSort] = useStoredState<PageSort>(PAGE_SORT_KEY, DEFAULT_PAGE_SORT, isPageSort);
  const navigate = useNavigate();

  useEffect(() => {
    const load = () =>
      notesApi.list(projectId).then(setNotes, () => {
        // Without notes, the sections still show.
      });
    void load();
    return onNotesChanged(() => void load());
  }, [projectId]);

  function open(section: SectionId) {
    const first = pagesOf(notes, section, pageSort)[0];
    navigate(first ? paths.notes(projectId, first.id) : `${paths.notes(projectId)}?${SECTION_PARAM}=${sectionParam(section)}`);
  }

  return <NotebookSections projectId={projectId} folders={folders} notes={notes} current={undefined} onSelect={open} />;
}

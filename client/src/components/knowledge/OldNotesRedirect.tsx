import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router';
import { notesApi } from '../../utils/api';
import { paths } from '../../utils/paths';
import RedirectToProject, { ProjectsLoading } from '../projects/RedirectToProject';

/**
 * Addresses of the old "Alle Notizen" (/wissen, /wissen/notizen/:id; removed with US-34): a note opens in its
 * notebook; anything else, or a note that is gone, leads to the last notebook used.
 */
export default function OldNotesRedirect() {
  const noteId = Number(useParams().noteId);
  const [target, setTarget] = useState<string | null | undefined>(Number.isInteger(noteId) ? undefined : null);

  useEffect(() => {
    if (!Number.isInteger(noteId)) return;
    notesApi.get(noteId).then(
      (note) => setTarget(paths.notes(note.projectId, note.id)),
      () => setTarget(null),
    );
  }, [noteId]);

  if (target === undefined) return <ProjectsLoading />;
  return target ? <Navigate to={target} replace /> : <RedirectToProject />;
}

import { useEffect, useState } from 'react';
import { useProjects } from '../../hooks/useProjects';
import type { Project } from '../../types/project';
import { countLabel, KIND_WORDS } from '../../utils/projects';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';

interface DeleteProjectDialogProps {
  /** The dialog is open while it is mounted. */
  project: Project;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** The project goes to the trash with everything in it and can be restored from there, so a simple question is enough. */
export default function DeleteProjectDialog({ project, onConfirm, onClose }: DeleteProjectDialogProps) {
  const { projects, reload } = useProjects();
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  // Fresh counts, so the message matches what goes to the trash.
  const current = projects.find((p) => p.id === project.id) ?? project;
  const word = KIND_WORDS[project.kind];
  const notebook = project.kind === 'notebook';
  useEffect(() => {
    void reload();
  }, [reload]);

  async function confirm() {
    setDeleting(true);
    setFailed(false);
    try {
      await onConfirm();
    } catch {
      setFailed(true);
      setDeleting(false);
    }
  }

  return (
    <Dialog onClose={onClose} dismissible={!deleting} labelledBy="delete-project-title" mobile="compact" className="max-w-md p-6">
      <h2 id="delete-project-title" className="text-base font-semibold text-fg">
        {word.one} löschen?
      </h2>
      <p className="mt-2 text-sm text-fg-muted">
        „{current.name}“ kommt mit{' '}
        <strong className="font-semibold text-fg">
          {countLabel(current.noteCount, 'Notiz', 'Notizen')}
          {!notebook && <> und {countLabel(current.taskCount, 'Task', 'Tasks')}</>}
        </strong>{' '}
        in den Papierkorb. Von dort lässt es sich vollständig wiederherstellen.
      </p>

      {failed && (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          {notebook ? 'Das Notizbuch' : 'Das Projekt'} konnte nicht gelöscht werden. Bitte versuche es erneut.
        </p>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" disabled={deleting} onClick={onClose} data-autofocus>
          Abbrechen
        </Button>
        <Button variant="danger" disabled={deleting} onClick={() => void confirm()}>
          {deleting ? 'Wird gelöscht …' : 'In den Papierkorb'}
        </Button>
      </div>
    </Dialog>
  );
}

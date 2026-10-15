import { useEffect, useState } from 'react';
import { useProjects } from '../../hooks/useProjects';
import type { Project } from '../../types/project';
import { countLabel } from '../../utils/projects';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { fieldClass } from '../ui/styles';

interface DeleteProjectDialogProps {
  /** The dialog is open while it is mounted. */
  project: Project;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Deleting removes all notes and tasks, so the project name has to be typed to confirm. */
export default function DeleteProjectDialog({ project, onConfirm, onClose }: DeleteProjectDialogProps) {
  const { projects, reload } = useProjects();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  // Fresh counts, so the warning matches what will actually be deleted.
  const current = projects.find((p) => p.id === project.id) ?? project;
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
    <Dialog onClose={onClose} dismissible={!deleting} labelledBy="delete-project-title" className="max-w-md p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (typed === current.name) void confirm();
        }}
      >
        <h2 id="delete-project-title" className="text-base font-semibold text-fg">
          Projekt löschen?
        </h2>
        <p className="mt-2 text-sm text-fg-muted">
          „{current.name}“ wird mit allen Inhalten dauerhaft gelöscht:{' '}
          <strong className="font-semibold text-fg">
            {countLabel(current.noteCount, 'Notiz', 'Notizen')} und {countLabel(current.taskCount, 'Task', 'Tasks')}
          </strong>
          . Das lässt sich nicht rückgängig machen.
        </p>

        <label className="mt-5 block text-sm text-fg-muted">
          Gib zur Bestätigung den Projektnamen ein:
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            data-autofocus
            autoComplete="off"
            spellCheck={false}
            placeholder={current.name}
            className={`mt-1 focus:border-danger focus:ring-danger/20 ${fieldClass}`}
          />
        </label>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-danger-text">
            Das Projekt konnte nicht gelöscht werden. Bitte versuche es erneut.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" disabled={deleting} onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" variant="danger" disabled={deleting || typed !== current.name}>
            {deleting ? 'Wird gelöscht …' : 'Endgültig löschen'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useProjects } from '../../hooks/useProjects';
import type { Project } from '../../types/project';
import { countLabel } from '../../utils/projects';

interface DeleteProjectDialogProps {
  /** The dialog is open while it is mounted. */
  project: Project;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

/** Deleting removes all notes and tasks, so the project name has to be typed to confirm. */
export default function DeleteProjectDialog({ project, onConfirm, onClose }: DeleteProjectDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { projects, reload } = useProjects();
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [failed, setFailed] = useState(false);

  // Fresh counts, so the warning matches what will actually be deleted.
  const current = projects.find((p) => p.id === project.id) ?? project;
  useEffect(() => {
    ref.current?.showModal();
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
    <dialog
      ref={ref}
      aria-labelledby="delete-project-title"
      className="m-auto w-full max-w-md rounded-lg bg-white p-6 shadow-xl backdrop:bg-slate-900/40"
      onCancel={(event) => {
        event.preventDefault();
        if (!deleting) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (typed === current.name) void confirm();
        }}
      >
        <h2 id="delete-project-title" className="text-lg font-semibold text-slate-900">
          Projekt löschen?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          „{current.name}“ wird mit allen Inhalten dauerhaft gelöscht:{' '}
          <strong className="font-semibold text-slate-900">
            {countLabel(current.noteCount, 'Notiz', 'Notizen')} und {countLabel(current.taskCount, 'Task', 'Tasks')}
          </strong>
          . Das lässt sich nicht rückgängig machen.
        </p>

        <label className="mt-5 block text-sm text-slate-700">
          Gib zur Bestätigung den Projektnamen ein:
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder={current.name}
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </label>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            Das Projekt konnte nicht gelöscht werden. Bitte versuche es erneut.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={deleting || typed !== current.name}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? 'Wird gelöscht …' : 'Endgültig löschen'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

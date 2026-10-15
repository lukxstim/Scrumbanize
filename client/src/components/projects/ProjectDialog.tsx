import { useEffect, useRef, useState } from 'react';
import type { ProjectInput } from '../../types/project';
import { ApiError } from '../../utils/api';
import { PROJECT_COLORS } from '../../utils/projects';

interface ProjectDialogProps {
  mode: 'create' | 'edit';
  /** Pre-filled values; the dialog is open while it is mounted. */
  initial: ProjectInput;
  onSubmit: (input: ProjectInput) => Promise<void>;
  onClose: () => void;
  /** Edit mode: opens the delete confirmation. Undefined hides the button. */
  onDelete?: () => void;
  /** Why deleting is not possible, e.g. for the last project. */
  deleteDisabledReason?: string;
}

export default function ProjectDialog({
  mode,
  initial,
  onSubmit,
  onClose,
  onDelete,
  deleteDisabledReason,
}: ProjectDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), color });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'name_taken'
          ? 'Es gibt bereits ein Projekt mit diesem Namen.'
          : 'Das Projekt konnte nicht gespeichert werden.',
      );
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="project-dialog-title"
      className="m-auto w-full max-w-md rounded-lg bg-white p-6 shadow-xl backdrop:bg-slate-900/40"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 id="project-dialog-title" className="text-lg font-semibold text-slate-900">
          {mode === 'create' ? 'Neues Projekt' : 'Projekt bearbeiten'}
        </h2>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            autoFocus
            placeholder="z. B. Studium"
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-normal focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-slate-700">Farbe</legend>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {PROJECT_COLORS.map((option) => (
              <label
                key={option.value}
                title={option.label}
                className="grid size-8 cursor-pointer place-items-center rounded-full ring-offset-2 has-checked:ring-2 has-checked:ring-slate-900 has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-indigo-500"
              >
                <input
                  type="radio"
                  name="project-color"
                  value={option.value}
                  checked={color === option.value}
                  onChange={() => setColor(option.value)}
                  className="sr-only"
                />
                <span className={`size-6 rounded-full ${option.dot}`} />
                <span className="sr-only">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mt-7 flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={saving || deleteDisabledReason !== undefined}
              title={deleteDisabledReason}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent"
            >
              Projekt löschen …
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {mode === 'create' ? 'Projekt anlegen' : 'Speichern'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

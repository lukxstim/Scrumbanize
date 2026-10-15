import { useState } from 'react';
import type { ProjectInput } from '../../types/project';
import { ApiError } from '../../utils/api';
import { PROJECT_COLORS } from '../../utils/projects';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { fieldClass, labelClass } from '../ui/styles';

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
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <Dialog onClose={onClose} dismissible={!saving} labelledBy="project-dialog-title" className="max-w-md p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 id="project-dialog-title" className="text-base font-semibold text-fg">
          {mode === 'create' ? 'Neues Projekt' : 'Projekt bearbeiten'}
        </h2>

        <label className={`mt-5 ${labelClass}`}>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            data-autofocus
            placeholder="z. B. Studium"
            className={`mt-1 font-normal ${fieldClass}`}
          />
        </label>

        <fieldset className="mt-5">
          <legend className={labelClass}>Farbe</legend>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {PROJECT_COLORS.map((option) => (
              <label
                key={option.value}
                title={option.label}
                className="grid size-8 cursor-pointer place-items-center rounded-full ring-offset-2 ring-offset-surface transition-shadow has-checked:ring-2 has-checked:ring-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-4 has-focus-visible:outline-accent"
              >
                <input
                  type="radio"
                  name="project-color"
                  value={option.value}
                  checked={color === option.value}
                  onChange={() => setColor(option.value)}
                  className="sr-only"
                />
                <span className={`size-6 rounded-full transition-transform hover:scale-110 ${option.dot}`} />
                <span className="sr-only">{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger-text">
            {error}
          </p>
        )}

        <div className="mt-7 flex items-center gap-2">
          {onDelete && (
            // The wrapper shows the reason as tooltip; disabled buttons do not receive hover.
            <span title={deleteDisabledReason}>
              <Button variant="danger-ghost" onClick={onDelete} disabled={saving || deleteDisabledReason !== undefined}>
                Projekt löschen …
              </Button>
            </span>
          )}
          <div className="flex-1" />
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
            {mode === 'create' ? 'Projekt anlegen' : 'Speichern'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

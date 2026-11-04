import { useState } from 'react';
import { NOTEBOOK_ICONS, type NotebookIcon, type ProjectColor } from '../../types/project';
import { ApiError } from '../../utils/api';
import { colorDot, countLabel, PROJECT_COLORS } from '../../utils/projects';
import NotebookSymbol, { NOTEBOOK_ICON_LABELS } from './NotebookSymbol';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { dialogTitleClass, fieldClass, labelClass, stickyDialogActionsClass } from '../ui/styles';

/** What the dialog edits. Since US-26 every project is a notebook, with its board switched on or off. */
export interface NotebookValues {
  name: string;
  color: ProjectColor;
  /** Null shows the color dot. */
  icon: NotebookIcon | null;
  board: boolean;
}

interface ProjectDialogProps {
  mode: 'create' | 'edit';
  /** Pre-filled values; the dialog is open while it is mounted. */
  initial: NotebookValues;
  /** Edit mode: the tasks of the board, so switching it off can say how many it hides. */
  taskCount?: number;
  onSubmit: (values: NotebookValues) => Promise<void>;
  onClose: () => void;
  /** Edit mode: opens the delete confirmation. Undefined hides the button. */
  onDelete?: () => void;
  /** Why deleting is not possible, e.g. for the last notebook with a board. */
  deleteDisabledReason?: string;
}

export default function ProjectDialog({
  mode,
  initial,
  taskCount = 0,
  onSubmit,
  onClose,
  onDelete,
  deleteDisabledReason,
}: ProjectDialogProps) {
  const [name, setName] = useState(initial.name);
  const [color, setColor] = useState(initial.color);
  const [icon, setIcon] = useState(initial.icon);
  const [board, setBoard] = useState(initial.board);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Switching off hides the tasks (US-26); they come back with the board.
  const hidesTasks = mode === 'edit' && initial.board && !board && taskCount > 0;

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name: name.trim(), color, icon, board });
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'name_taken'
          ? 'Es gibt bereits ein Notizbuch mit diesem Namen.'
          : err instanceof ApiError && err.code === 'last_project'
            ? 'Das letzte Board kann nicht ausgeschaltet werden – Aufgaben brauchen einen Platz.'
            : 'Das Notizbuch konnte nicht gespeichert werden.',
      );
      setSaving(false);
    }
  }

  const iconOption = (value: NotebookIcon | null, label: string) => (
    <label
      key={value ?? 'none'}
      title={label}
      className="grid size-9 cursor-pointer place-items-center rounded-md ring-offset-2 ring-offset-surface transition-shadow hover:bg-surface-hover has-checked:ring-2 has-checked:ring-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent"
    >
      <input type="radio" name="notebook-icon" checked={icon === value} onChange={() => setIcon(value)} className="sr-only" />
      {value ? <NotebookSymbol icon={value} color={color} /> : <span className={`size-2.5 rounded-full ${colorDot(color)}`} aria-hidden="true" />}
      <span className="sr-only">{label}</span>
    </label>
  );

  return (
    <Dialog onClose={onClose} dismissible={!saving} labelledBy="project-dialog-title" className="max-w-md p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 id="project-dialog-title" className={dialogTitleClass}>
          {mode === 'create' ? 'Neues Notizbuch' : 'Notizbuch bearbeiten'}
        </h2>

        <label className={`mt-5 ${labelClass}`}>
          Name
          <input
            autoComplete="off"
            enterKeyHint="done"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            data-autofocus
            placeholder="z. B. Studium oder Rezepte"
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

        <fieldset className="mt-5">
          <legend className={labelClass}>Symbol</legend>
          <div className="mt-2 grid grid-cols-9 gap-1">
            {iconOption(null, 'Kein Symbol (Farbpunkt)')}
            {NOTEBOOK_ICONS.map((value) => iconOption(value, NOTEBOOK_ICON_LABELS[value]))}
          </div>
        </fieldset>

        {/* The board (US-26): a notebook with board is what used to be a project. */}
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-lg border border-line p-3 has-focus-visible:outline-2 has-focus-visible:outline-accent">
          <input type="checkbox" checked={board} onChange={(event) => setBoard(event.target.checked)} className="mt-0.5 size-4 accent-accent" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-fg">Board verwenden</span>
            <span className="block text-xs text-fg-subtle">Mit Scrumban-Board, Kalender und Statistiken für die Aufgaben dieses Notizbuchs.</span>
          </span>
        </label>
        {hidesTasks && (
          <p role="status" className="mt-2 rounded-md bg-warning-muted px-3 py-2 text-sm text-warning-text">
            Dieses Board hat {countLabel(taskCount, 'Aufgabe', 'Aufgaben')}; sie werden ausgeblendet, nicht gelöscht. Schaltest du das
            Board wieder ein, sind sie wieder da.
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger-text">
            {error}
          </p>
        )}

        <div className={`mt-7 flex items-center gap-2 ${stickyDialogActionsClass}`}>
          {onDelete && (
            // The wrapper shows the reason as tooltip; disabled buttons do not receive hover.
            <span title={deleteDisabledReason}>
              <Button variant="danger-ghost" onClick={onDelete} disabled={saving || deleteDisabledReason !== undefined}>
                Notizbuch löschen …
              </Button>
            </span>
          )}
          <div className="flex-1" />
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
            {mode === 'create' ? 'Notizbuch anlegen' : 'Speichern'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import { useState } from 'react';
import type { TaskDraft } from '../../utils/taskFromNote';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { fieldClass, labelClass } from '../ui/styles';

interface ConvertToTaskDialogProps {
  /** Pre-filled values; the dialog is open while it is mounted. */
  initial: TaskDraft;
  fromSelection: boolean;
  onSubmit: (draft: TaskDraft) => Promise<void>;
  onCancel: () => void;
}

export default function ConvertToTaskDialog({ initial, fromSelection, onSubmit, onCancel }: ConvertToTaskDialogProps) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit() {
    setSubmitting(true);
    setFailed(false);
    try {
      await onSubmit({ title: title.trim(), description });
    } catch {
      setFailed(true);
      setSubmitting(false);
    }
  }

  return (
    <Dialog onClose={onCancel} dismissible={!submitting} labelledBy="convert-to-task-title" className="max-w-xl p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 id="convert-to-task-title" className="text-base font-semibold text-fg">
          {fromSelection ? 'Auswahl in Task umwandeln' : 'Notiz in Task umwandeln'}
        </h2>
        <p className="mt-1 text-sm text-fg-subtle">
          Der Task wird in der ersten Spalte angelegt und mit dieser Notiz verknüpft. Änderungen an der Notiz werden
          nicht übernommen.
        </p>

        <label className={`mt-5 ${labelClass}`}>
          Titel
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={200}
            data-autofocus
            className={`mt-1 font-normal ${fieldClass}`}
          />
        </label>

        <label className={`mt-4 ${labelClass}`}>
          Beschreibung <span className="font-normal text-fg-subtle">(Markdown)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={10}
            className={`mt-1 resize-y font-mono font-normal leading-relaxed ${fieldClass}`}
          />
        </label>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-danger-text">
            Der Task konnte nicht angelegt werden. Bitte versuche es erneut.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" disabled={submitting} onClick={onCancel}>
            Abbrechen
          </Button>
          <Button type="submit" variant="primary" disabled={submitting || !title.trim()}>
            {submitting ? 'Wird angelegt …' : 'Task anlegen'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

import { useEffect, useRef, useState } from 'react';
import type { TaskDraft } from '../../utils/taskFromNote';

interface ConvertToTaskDialogProps {
  /** Pre-filled values; the dialog is open while it is mounted. */
  initial: TaskDraft;
  fromSelection: boolean;
  onSubmit: (draft: TaskDraft) => Promise<void>;
  onCancel: () => void;
}

export default function ConvertToTaskDialog({ initial, fromSelection, onSubmit, onCancel }: ConvertToTaskDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []);

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
    <dialog
      ref={ref}
      aria-labelledby="convert-to-task-title"
      className="m-auto w-full max-w-xl rounded-lg bg-white p-6 shadow-xl backdrop:bg-slate-900/40"
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting) onCancel();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 id="convert-to-task-title" className="text-lg font-semibold text-slate-900">
          {fromSelection ? 'Auswahl in Task umwandeln' : 'Notiz in Task umwandeln'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Der Task wird im Backlog angelegt und mit dieser Notiz verknüpft. Änderungen an der Notiz werden nicht übernommen.
        </p>

        <label className="mt-5 block text-sm font-medium text-slate-700">
          Titel
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={200}
            autoFocus
            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm font-normal focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Beschreibung <span className="font-normal text-slate-400">(Markdown)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={10}
            className="mt-1 block w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-sm font-normal leading-relaxed focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </label>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-red-600">
            Der Task konnte nicht angelegt werden. Bitte versuche es erneut.
          </p>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={submitting || !title.trim()}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Wird angelegt …' : 'Task anlegen'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

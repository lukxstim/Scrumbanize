import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave';
import type { Task, TaskPatch, TaskStatus } from '../../types/task';
import { formatDate } from '../../utils/format';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';
import { TASK_STATUSES, TASK_STATUS_LABELS } from '../../utils/taskStatus';
import ConfirmDialog from '../ConfirmDialog';
import MarkdownPreview from '../notes/MarkdownPreview';

interface TaskDetailDialogProps {
  /** The dialog keeps its own draft; remount it (via `key`) for another task. It is open while mounted. */
  task: Task;
  onClose: () => void;
  onSave: (id: number, patch: TaskPatch) => Promise<void>;
  onChangeStatus: (id: number, status: TaskStatus) => void;
  onDelete: (id: number) => Promise<void>;
}

export default function TaskDetailDialog({ task, onClose, onSave, onChangeStatus, onDelete }: TaskDetailDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [mode, setMode] = useState<'edit' | 'preview'>(task.description ? 'preview' : 'edit');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const { status, schedule, flush, cancel } = useAutosave<TaskPatch>((patch) => onSave(task.id, patch));

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  function change(next: { title?: string; description?: string }) {
    const nextTitle = next.title ?? title;
    const nextDescription = next.description ?? description;
    setTitle(nextTitle);
    setDescription(nextDescription);
    // A task needs a title; keep editing locally until there is one again.
    if (nextTitle.trim()) schedule({ title: nextTitle, description: nextDescription });
    else cancel();
  }

  async function confirmDelete() {
    setConfirmingDelete(false);
    cancel();
    await flush();
    try {
      await onDelete(task.id);
    } catch {
      setDeleteFailed(true);
    }
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="task-detail-title"
      className="m-auto flex max-h-[90vh] w-full max-w-2xl flex-col rounded-lg bg-white shadow-xl backdrop:bg-slate-900/40 [&:not([open])]:hidden"
      onCancel={(event) => {
        event.preventDefault();
        if (!confirmingDelete) onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="flex items-center gap-3 border-b border-slate-200 px-6 py-3">
        <span className="font-mono text-sm text-slate-400">#{task.id}</span>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Status
          <select
            value={task.status}
            onChange={(event) => onChangeStatus(task.id, event.target.value as TaskStatus)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none"
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        <SaveIndicator status={status} titleMissing={!title.trim()} onRetry={() => void flush()} />
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="rounded-md px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        >
          ×
        </button>
      </div>

      {deleteFailed && (
        <p role="alert" className="bg-red-50 px-6 py-2 text-sm text-red-700">
          Der Task konnte nicht gelöscht werden. Bitte versuche es erneut.
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        <input
          id="task-detail-title"
          value={title}
          onChange={(event) => change({ title: event.target.value })}
          maxLength={200}
          placeholder="Titel"
          aria-label="Titel"
          aria-invalid={!title.trim()}
          className="bg-transparent text-xl font-semibold placeholder:text-slate-300 focus:outline-none"
        />

        {task.sourceNote && (
          <p className="text-sm text-slate-500">
            Aus Notiz:{' '}
            <Link to={`/notes/${task.sourceNote.id}`} className="font-medium text-indigo-600 hover:underline">
              {task.sourceNote.title || UNTITLED_NOTE}
            </Link>
          </p>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Beschreibung</span>
            <div className="flex rounded-md bg-slate-100 p-0.5 text-xs" role="group" aria-label="Ansicht der Beschreibung">
              {(['edit', 'preview'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                  className={`rounded px-2.5 py-0.5 ${mode === value ? 'bg-white font-medium shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {value === 'edit' ? 'Bearbeiten' : 'Vorschau'}
                </button>
              ))}
            </div>
          </div>
          {mode === 'edit' ? (
            <textarea
              value={description}
              onChange={(event) => change({ description: event.target.value })}
              rows={12}
              placeholder="Beschreibung in Markdown …"
              aria-label="Beschreibung"
              className="block w-full resize-y rounded-md border border-slate-300 px-3 py-2 font-mono text-sm leading-relaxed focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          ) : (
            <div className="min-h-24 rounded-md border border-slate-200 px-4 py-3">
              <MarkdownPreview content={description} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-slate-200 px-6 py-3 text-xs text-slate-400">
        <span>Erstellt {formatDate(task.createdAt)}</span>
        <span>Geändert {formatDate(task.updatedAt)}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="rounded-md px-3 py-1 text-sm text-red-600 hover:bg-red-50"
        >
          Löschen
        </button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Task löschen?"
        message={`„${title.trim() || task.title}“ wird dauerhaft gelöscht.`}
        confirmLabel="Löschen"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </dialog>
  );
}

function SaveIndicator({ status, titleMissing, onRetry }: { status: SaveStatus; titleMissing: boolean; onRetry: () => void }) {
  if (titleMissing) {
    return <span className="text-xs text-amber-700">Titel fehlt – nicht gespeichert</span>;
  }
  return (
    <span aria-live="polite" className="text-xs text-slate-400">
      {status === 'saved' && 'Gespeichert'}
      {(status === 'pending' || status === 'saving') && 'Speichert …'}
      {status === 'error' && (
        <span className="text-red-600">
          Speichern fehlgeschlagen ·{' '}
          <button type="button" className="underline" onClick={onRetry}>
            Erneut versuchen
          </button>
        </span>
      )}
    </span>
  );
}

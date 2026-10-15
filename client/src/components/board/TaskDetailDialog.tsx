import { useState } from 'react';
import { Link } from 'react-router';
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave';
import type { BoardColumn, Lane, Task, TaskPatch } from '../../types/task';
import { formatDate } from '../../utils/format';
import { paths } from '../../utils/paths';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';
import ConfirmDialog from '../ConfirmDialog';
import MarkdownPreview from '../notes/LazyMarkdownPreview';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import SegmentedControl from '../ui/SegmentedControl';
import { fieldClass, iconButtonClass } from '../ui/styles';

interface TaskDetailDialogProps {
  /** The dialog keeps its own draft; remount it (via `key`) for another task. It is open while mounted. */
  task: Task;
  columns: BoardColumn[];
  lanes: Lane[];
  onClose: () => void;
  onSave: (id: number, patch: TaskPatch) => Promise<void>;
  /** Moves the task to the end of the given cell. */
  onMove: (id: number, columnId: number, laneId: number) => void;
  onDelete: (id: number) => Promise<void>;
}

const selectClass = `!w-auto !py-1 ${fieldClass}`;

export default function TaskDetailDialog({ task, columns, lanes, onClose, onSave, onMove, onDelete }: TaskDetailDialogProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [mode, setMode] = useState<'edit' | 'preview'>(task.description ? 'preview' : 'edit');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const { status, schedule, flush, cancel } = useAutosave<TaskPatch>((patch) => onSave(task.id, patch));

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
    <Dialog
      onClose={onClose}
      dismissible={!confirmingDelete}
      closeOnBackdrop
      labelledBy="task-detail-title"
      className="max-h-[90vh] max-w-2xl open:flex open:flex-col"
    >
      <div className="flex items-center gap-3 border-b border-line px-6 py-3">
        <span className="font-mono text-xs text-fg-subtle">#{task.id}</span>
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          Spalte
          <select
            value={task.columnId}
            onChange={(event) => onMove(task.id, Number(event.target.value), task.laneId)}
            className={selectClass}
          >
            {columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        {lanes.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            Swimlane
            <select
              value={task.laneId}
              onChange={(event) => onMove(task.id, task.columnId, Number(event.target.value))}
              className={selectClass}
            >
              {lanes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex-1" />
        <SaveIndicator status={status} titleMissing={!title.trim()} onRetry={() => void flush()} />
        <button type="button" onClick={onClose} aria-label="Schließen" className={`text-lg leading-none ${iconButtonClass}`}>
          ×
        </button>
      </div>

      {deleteFailed && (
        <p role="alert" className="bg-danger-muted px-6 py-2 text-sm text-danger-text">
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
          className="bg-transparent text-xl font-semibold placeholder:text-fg-faint focus:outline-none"
        />

        {task.sourceNote && (
          <p className="text-sm text-fg-subtle">
            Aus Notiz:{' '}
            <Link to={paths.notes(task.projectId, task.sourceNote.id)} className="font-medium text-accent-text hover:underline">
              {task.sourceNote.title || UNTITLED_NOTE}
            </Link>
          </p>
        )}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-fg-muted">Beschreibung</span>
            <SegmentedControl
              label="Ansicht der Beschreibung"
              size="sm"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'edit', label: 'Bearbeiten' },
                { value: 'preview', label: 'Vorschau' },
              ]}
            />
          </div>
          {mode === 'edit' ? (
            <textarea
              value={description}
              onChange={(event) => change({ description: event.target.value })}
              rows={12}
              placeholder="Beschreibung in Markdown …"
              aria-label="Beschreibung"
              className={`resize-y py-2 font-mono leading-relaxed ${fieldClass}`}
            />
          ) : (
            <div className="min-h-24 rounded-md border border-line px-4 py-3">
              <MarkdownPreview content={description} />
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-line px-6 py-3 text-xs text-fg-subtle">
        <span>Erstellt {formatDate(task.createdAt)}</span>
        <span>Geändert {formatDate(task.updatedAt)}</span>
        <div className="flex-1" />
        <Button variant="danger-ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
          Löschen
        </Button>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Task löschen?"
        message={`„${title.trim() || task.title}“ wird dauerhaft gelöscht.`}
        confirmLabel="Löschen"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </Dialog>
  );
}

function SaveIndicator({ status, titleMissing, onRetry }: { status: SaveStatus; titleMissing: boolean; onRetry: () => void }) {
  if (titleMissing) {
    return <span className="text-xs text-warning-text">Titel fehlt – nicht gespeichert</span>;
  }
  return (
    <span aria-live="polite" className="text-xs text-fg-subtle">
      {status === 'saved' && 'Gespeichert'}
      {(status === 'pending' || status === 'saving') && 'Speichert …'}
      {status === 'error' && (
        <span className="text-danger-text">
          Speichern fehlgeschlagen ·{' '}
          <button type="button" className="underline" onClick={onRetry}>
            Erneut versuchen
          </button>
        </span>
      )}
    </span>
  );
}

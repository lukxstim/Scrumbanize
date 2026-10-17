import { useState } from 'react';
import { Link } from 'react-router';
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave';
import type { ProjectColor } from '../../types/project';
import type { BoardColumn, Label, Lane, LinkKind, Task, TaskPatch } from '../../types/task';
import LabelPicker from '../tasks/LabelPicker';
import { formatDate } from '../../utils/format';
import { paths } from '../../utils/paths';
import type { Schedule } from '../../utils/schedule';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';
import ScheduleFields from '../tasks/ScheduleFields';
import TaskLinks from '../tasks/TaskLinks';
import AttachmentsPanel from '../attachments/AttachmentsPanel';
import type { Attachment } from '../../types/attachment';
import { linkCandidates } from '../../utils/links';
import MarkdownEditor from '../editor/MarkdownEditor';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
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
  /** The project's tasks, to pick links from. */
  allTasks: Task[];
  onAddLink: (id: number, targetId: number, kind: LinkKind) => Promise<void>;
  onRemoveLink: (id: number, linkId: number) => Promise<void>;
  /** Shows another task's details, e.g. a linked one. */
  onOpenTask: (id: number) => void;
  onUpdateAttachments: (id: number, update: (attachments: Attachment[]) => Attachment[]) => void;
  /** The project's labels, and creating one from the picker. */
  labels: Label[];
  onCreateLabel: (name: string, color: ProjectColor) => Promise<Label | undefined>;
  /** Opens the template editor with this task as starting point; without it, the button is not shown. */
  onSaveAsTemplate?: (task: Task) => void;
}

const selectClass = `!w-auto !py-1 ${fieldClass}`;

export default function TaskDetailDialog({
  task,
  columns,
  lanes,
  onClose,
  onSave,
  onMove,
  onDelete,
  allTasks,
  onAddLink,
  onRemoveLink,
  onOpenTask,
  onUpdateAttachments,
  labels,
  onCreateLabel,
  onSaveAsTemplate,
}: TaskDetailDialogProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [deleteFailed, setDeleteFailed] = useState(false);
  // Priority and dates are saved right away (no typing involved); a failed save puts the old values back.
  const [dates, setDates] = useState<Schedule>({ priority: task.priority, startDate: task.startDate, dueDate: task.dueDate });
  const [scheduleFailed, setScheduleFailed] = useState(false);
  // Labels are saved right away, too.
  const [labelIds, setLabelIds] = useState(task.labels.map((l) => l.id));
  const [labelsFailed, setLabelsFailed] = useState(false);

  async function changeLabels(next: number[]) {
    const previous = labelIds;
    setLabelIds(next);
    setLabelsFailed(false);
    try {
      await onSave(task.id, { labelIds: next });
    } catch {
      setLabelIds(previous);
      setLabelsFailed(true);
    }
  }
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

  async function changeSchedule(next: Schedule) {
    const previous = dates;
    setDates(next);
    setScheduleFailed(false);
    try {
      await onSave(task.id, next);
    } catch {
      setDates(previous);
      setScheduleFailed(true);
    }
  }

  // No confirmation: the task goes to the trash, and the toast offers "Rückgängig" (see onDelete).
  async function moveToTrash() {
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

        <section aria-label="Priorität und Termine" className="rounded-lg border border-line bg-surface-muted/50 px-4 py-3">
          <ScheduleFields value={dates} onChange={(next) => void changeSchedule(next)} />
          {scheduleFailed && (
            <p role="alert" className="mt-2 text-sm text-danger-text">
              Priorität oder Termin konnten nicht gespeichert werden.
            </p>
          )}
        </section>

        <div>
          <LabelPicker labels={labels} selected={labelIds} onChange={(next) => void changeLabels(next)} onCreate={onCreateLabel} />
          {labelsFailed && (
            <p role="alert" className="mt-1 text-xs text-danger-text">
              Die Labels konnten nicht gespeichert werden.
            </p>
          )}
        </div>

        <TaskLinks
          task={task}
          candidates={linkCandidates(task, allTasks)}
          onAdd={(kind, targetId) => onAddLink(task.id, targetId, kind)}
          onRemove={(linkId) => onRemoveLink(task.id, linkId)}
          onOpen={onOpenTask}
        />

        <div>
          <span className="mb-1 block text-sm font-medium text-fg-muted">Beschreibung</span>
          <div className="rounded-md border border-line px-3 pb-3">
            <MarkdownEditor
              value={description}
              onChange={(next) => change({ description: next })}
              label="Beschreibung"
              placeholder="Beschreibung …"
              minHeightClass="min-h-40"
            />
          </div>
        </div>

        <AttachmentsPanel
          owner={{ type: 'task', id: task.id }}
          attachments={task.attachments}
          onUpdate={(update) => onUpdateAttachments(task.id, update)}
        />
      </div>

      <div className="flex items-center gap-3 border-t border-line px-6 py-3 text-xs text-fg-subtle">
        <span>Erstellt {formatDate(task.createdAt)}</span>
        <span>Geändert {formatDate(task.updatedAt)}</span>
        <div className="flex-1" />
        {onSaveAsTemplate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void flush();
              onSaveAsTemplate({ ...task, title, description, priority: dates.priority, labels: labels.filter((l) => labelIds.includes(l.id)) });
            }}
          >
            Als Vorlage speichern
          </Button>
        )}
        <Button variant="danger-ghost" size="sm" onClick={() => void moveToTrash()}>
          Löschen
        </Button>
      </div>

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

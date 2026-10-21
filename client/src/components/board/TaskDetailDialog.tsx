import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave';
import { useShowItem, useSoftLock } from '../../hooks/useCollaboration';
import { useProjects } from '../../hooks/useProjects';
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
import Backlinks from '../notes/Backlinks';
import type { Attachment } from '../../types/attachment';
import { ApiError } from '../../utils/api';
import { linkCandidates } from '../../utils/links';
import LockNotice, { isTextField } from '../LockNotice';
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
  /** Resolves to the saved task; a title or description changed elsewhere meanwhile fails with 409 (US-24). */
  onSave: (id: number, patch: TaskPatch) => Promise<Task>;
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
  /** Viewers (US-21): everything visible, links and files open, nothing changes. */
  readOnly?: boolean;
}

const selectClass = `!w-auto !py-1 disabled:opacity-60 ${fieldClass}`;

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
  readOnly = false,
}: TaskDetailDialogProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [deleteFailed, setDeleteFailed] = useState(false);
  // Priority and dates are saved right away (no typing involved); a failed save puts the old values back.
  const { projects } = useProjects();
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
  // Title and description as the server had them when the draft started (US-24): saved with it, so a change made
  // elsewhere in between is refused (409) instead of overwritten.
  const base = useRef({ title: task.title, description: task.description });
  const [conflict, setConflict] = useState<{ latest: Task } | null>(null);
  // What this dialog sent last: the board shows it once saved, which is no change from elsewhere.
  const sent = useRef<TaskPatch>({});
  const { status, schedule, flush, cancel } = useAutosave<TaskPatch>(async (patch) => {
    sent.current = patch;
    try {
      const saved = await onSave(task.id, { ...patch, base: base.current });
      base.current = { title: saved.title, description: saved.description };
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setConflict({ latest: error.details.task as Task });
      throw error;
    }
  });
  // Others see who has the task open; while someone else edits title or description, they are read-only here.
  useShowItem(task.projectId, { type: 'task', id: task.id });
  const lock = useSoftLock(task.projectId, { type: 'task', id: task.id }, !readOnly);
  const lockedBy = readOnly ? null : lock.holder;
  const textEditable = !readOnly && !lockedBy;
  const textRef = useRef<HTMLDivElement>(null);
  const [editorKey, setEditorKey] = useState(0);

  /** Shows the given version of title and description and builds on it. */
  function adopt(source: Pick<Task, 'title' | 'description'>) {
    cancel();
    base.current = { title: source.title, description: source.description };
    setTitle(source.title);
    setDescription(source.description);
    setEditorKey((key) => key + 1);
    setConflict(null);
  }

  // Title or description changed elsewhere (live update): taken over unless the user is working on them here.
  useEffect(() => {
    if (task.title === base.current.title && task.description === base.current.description) return;
    const ownSave = task.title === sent.current.title && task.description === sent.current.description;
    if (ownSave || (title === task.title && description === task.description)) {
      base.current = { title: task.title, description: task.description };
      return;
    }
    const untouched = title === base.current.title && description === base.current.description;
    const working = textRef.current?.contains(document.activeElement);
    if (untouched && !working && status === 'saved') adopt(task);
    else setConflict({ latest: task });
    // Only a new version from elsewhere decides; the draft is read as it is at that moment.
  }, [task.title, task.description]);

  // Someone else took over editing: what was typed here is saved first, then the dialog follows their changes.
  useEffect(() => {
    if (lockedBy) void flush();
  }, [lockedBy, flush]);

  /** The newest version known: the board's (live updates) or the one from a refused save. */
  const latest = () => (conflict && conflict.latest.updatedAt > task.updatedAt ? conflict.latest : task);

  function keepMine() {
    const source = latest();
    base.current = { title: source.title, description: source.description };
    setConflict(null);
    if (title.trim()) {
      schedule({ title, description });
      void flush();
    }
  }

  function change(next: { title?: string; description?: string }) {
    lock.touch();
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
            disabled={readOnly}
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
              disabled={readOnly}
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
        {readOnly ? (
          <span className="text-xs text-fg-subtle">Nur lesen</span>
        ) : (
          <SaveIndicator status={status} titleMissing={!title.trim()} conflict={conflict !== null} onRetry={() => void flush()} />
        )}
        <button type="button" onClick={onClose} aria-label="Schließen" className={`text-lg leading-none ${iconButtonClass}`}>
          ×
        </button>
      </div>

      {lockedBy && <LockNotice holder={lockedBy.user.name} what="Titel und Beschreibung" onTakeOver={() => void lock.takeOver()} />}

      {conflict && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-muted px-6 py-2 text-sm text-fg-muted">
          <span className="min-w-0 flex-1">Titel oder Beschreibung wurden gerade anderswo geändert.</span>
          <Button size="sm" onClick={() => adopt(latest())}>
            Übernehmen
          </Button>
          <Button size="sm" variant="ghost" onClick={keepMine}>
            Meine Fassung behalten
          </Button>
        </div>
      )}

      {deleteFailed && (
        <p role="alert" className="bg-danger-muted px-6 py-2 text-sm text-danger-text">
          Der Task konnte nicht gelöscht werden. Bitte versuche es erneut.
        </p>
      )}

      <div
        ref={textRef}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5"
        // Title and description are locked from the focus on, and given free a moment after it left them (US-24).
        onFocus={(event) => {
          if (isTextField(event.target) && event.target.closest('[data-locked-text]')) lock.touch();
        }}
        onBlur={() => lock.blur(() => !!document.activeElement?.closest('[data-locked-text]'), flush)}
      >
        <input
          id="task-detail-title"
          data-locked-text
          value={title}
          readOnly={!textEditable}
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
            {/* The note may be in another project or notebook (US-22), maybe one the user cannot open. */}
            {task.sourceNote.restricted ? (
              <span className="rounded-full border border-line px-2 py-0.5 text-xs">Kein Zugriff</span>
            ) : (
              <Link to={paths.notes(task.sourceNote.projectId, task.sourceNote.id)} className="font-medium text-accent-text hover:underline">
                {task.sourceNote.title || UNTITLED_NOTE}
              </Link>
            )}
            {!task.sourceNote.restricted && task.sourceNote.projectId !== task.projectId && (
              <span> in „{projects.find((p) => p.id === task.sourceNote?.projectId)?.name ?? 'anderem Projekt'}“</span>
            )}
          </p>
        )}

        <section aria-label="Priorität und Termine" className="rounded-lg border border-line bg-surface-muted/50 px-4 py-3">
          {/* A disabled fieldset turns every field inside read-only at once. */}
          <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-60">
            <ScheduleFields value={dates} onChange={(next) => void changeSchedule(next)} />
          </fieldset>
          {scheduleFailed && (
            <p role="alert" className="mt-2 text-sm text-danger-text">
              Priorität oder Termin konnten nicht gespeichert werden.
            </p>
          )}
        </section>

        <fieldset disabled={readOnly} className="min-w-0 disabled:opacity-60">
          <LabelPicker labels={labels} selected={labelIds} onChange={(next) => void changeLabels(next)} onCreate={onCreateLabel} />
          {labelsFailed && (
            <p role="alert" className="mt-1 text-xs text-danger-text">
              Die Labels konnten nicht gespeichert werden.
            </p>
          )}
        </fieldset>

        <TaskLinks
          task={task}
          candidates={linkCandidates(task, allTasks)}
          onAdd={(kind, targetId) => onAddLink(task.id, targetId, kind)}
          onRemove={(linkId) => onRemoveLink(task.id, linkId)}
          onOpen={onOpenTask}
          readOnly={readOnly}
        />

        <div data-locked-text>
          <span className="mb-1 block text-sm font-medium text-fg-muted">Beschreibung</span>
          <div className="rounded-md border border-line px-3 pb-3">
            <MarkdownEditor
              // Anew for a version from elsewhere, and when someone else's lock starts or ends (`readOnly` counts once).
              key={`${editorKey}-${textEditable}`}
              value={description}
              onChange={(next) => change({ description: next })}
              label="Beschreibung"
              placeholder="Beschreibung … ([[ verlinkt Notizen und Tasks)"
              minHeightClass="min-h-40"
              readOnly={!textEditable}
              links={{ projectId: task.projectId }}
            />
          </div>
        </div>

        <AttachmentsPanel
          owner={{ type: 'task', id: task.id }}
          attachments={task.attachments}
          onUpdate={(update) => onUpdateAttachments(task.id, update)}
          readOnly={readOnly}
        />

        <Backlinks target={{ type: 'task', id: task.id }} projectId={task.projectId} />
      </div>

      <div className="flex items-center gap-3 border-t border-line px-6 py-3 text-xs text-fg-subtle">
        <span>Erstellt {formatDate(task.createdAt)}</span>
        <span>Geändert {formatDate(task.updatedAt)}</span>
        <div className="flex-1" />
        {onSaveAsTemplate && !readOnly && (
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
        {!readOnly && (
          <Button variant="danger-ghost" size="sm" onClick={() => void moveToTrash()}>
            Löschen
          </Button>
        )}
      </div>

    </Dialog>
  );
}

function SaveIndicator({
  status,
  titleMissing,
  conflict,
  onRetry,
}: {
  status: SaveStatus;
  titleMissing: boolean;
  conflict: boolean;
  onRetry: () => void;
}) {
  if (titleMissing) {
    return <span className="text-xs text-warning-text">Titel fehlt – nicht gespeichert</span>;
  }
  if (conflict && status !== 'saved') {
    return <span className="text-xs text-warning-text">Nicht gespeichert</span>;
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

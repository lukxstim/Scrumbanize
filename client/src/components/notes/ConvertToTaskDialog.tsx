import { useState } from 'react';
import type { Project } from '../../types/project';
import type { TaskPriority } from '../../types/task';
import type { TaskDraft } from '../../utils/taskFromNote';
import { adjustSchedule } from '../../utils/schedule';
import { DateField, PriorityPicker } from '../tasks/ScheduleFields';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { dialogActionsClass, dialogTitleClass, fieldClass, labelClass } from '../ui/styles';

interface ConvertToTaskDialogProps {
  /** Pre-filled values; the dialog is open while it is mounted. */
  initial: TaskDraft;
  fromSelection: boolean;
  /** Where the task may go (US-22): every project the user may add tasks to; notebooks have no board. */
  projects: Project[];
  initialProjectId: number;
  onSubmit: (draft: TaskDraft, projectId: number) => Promise<void>;
  onCancel: () => void;
}

export default function ConvertToTaskDialog({ initial, fromSelection, projects, initialProjectId, onSubmit, onCancel }: ConvertToTaskDialogProps) {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [priority, setPriority] = useState<TaskPriority | null>(initial.priority ?? null);
  // Start and due date (US-27), kept to the rules of the API: a start needs a due date, start ≤ due.
  const [dates, setDates] = useState({ startDate: initial.startDate ?? null, dueDate: initial.dueDate ?? null });
  const changeDates = (change: { startDate?: string | null; dueDate?: string | null }) =>
    setDates((current) => {
      const next = adjustSchedule({ ...current, priority: null }, change);
      return { startDate: next.startDate, dueDate: next.dueDate };
    });
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit() {
    setSubmitting(true);
    setFailed(false);
    try {
      await onSubmit({ title: title.trim(), description, priority, ...dates }, projectId);
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
        <h2 id="convert-to-task-title" className={dialogTitleClass}>
          {fromSelection ? 'Auswahl in Task umwandeln' : 'Notiz in Task umwandeln'}
        </h2>
        <p className="mt-1 text-sm text-fg-subtle">
          Der Task wird in der ersten Spalte angelegt und mit dieser Notiz verknüpft. Änderungen an der Notiz werden
          nicht übernommen.
        </p>

        <label className={`mt-5 ${labelClass}`}>
          Projekt
          <select value={projectId} onChange={(event) => setProjectId(Number(event.target.value))} className={`mt-1 font-normal ${fieldClass}`}>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        <label className={`mt-4 ${labelClass}`}>
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

        <div className="mt-4 flex flex-col gap-1">
          <span className={labelClass}>
            Priorität <span className="font-normal text-fg-subtle">(optional)</span>
          </span>
          <div>
            <PriorityPicker value={priority} onChange={setPriority} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-x-6 gap-y-3">
          <DateField label="Startdatum (optional)" value={dates.startDate} quick={false} onChange={(startDate) => changeDates({ startDate })} />
          <DateField label="Fälligkeitsdatum (optional)" value={dates.dueDate} onChange={(dueDate) => changeDates({ dueDate })} />
        </div>
        {dates.startDate && (
          <p className="mt-1.5 text-xs text-fg-subtle">Mit Startdatum erscheint der Task im Kalender als Zeitraum bis zum Fälligkeitsdatum.</p>
        )}

        {failed && (
          <p role="alert" className="mt-3 text-sm text-danger-text">
            Der Task konnte nicht angelegt werden. Bitte versuche es erneut.
          </p>
        )}

        <div className={dialogActionsClass}>
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

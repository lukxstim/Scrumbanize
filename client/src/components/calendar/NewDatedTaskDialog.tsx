import { useState } from 'react';
import type { Lane, TaskPriority } from '../../types/task';
import { formatDateLong } from '../../utils/dates';
import { PriorityPicker } from '../tasks/ScheduleFields';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { dialogActionsClass, dialogTitleClass, fieldClass, labelClass } from '../ui/styles';

interface NewDatedTaskDialogProps {
  day: string;
  lanes: Lane[];
  onCreate: (title: string, laneId: number, priority: TaskPriority | null) => Promise<void>;
  onClose: () => void;
}

/** "+" on a calendar day: a task due that day, created in the first column. */
export default function NewDatedTaskDialog({ day, lanes, onCreate, onClose }: NewDatedTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [laneId, setLaneId] = useState(lanes[0]?.id ?? 0);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit() {
    setSubmitting(true);
    setFailed(false);
    try {
      await onCreate(title.trim(), laneId, priority);
    } catch {
      setFailed(true);
      setSubmitting(false);
    }
  }

  return (
    <Dialog onClose={onClose} dismissible={!submitting} closeOnBackdrop labelledBy="new-dated-task-title" className="max-w-md p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 id="new-dated-task-title" className={dialogTitleClass}>
          Neuer Task
        </h2>
        <p className="mt-1 text-sm text-fg-subtle">Fällig am {formatDateLong(day)}, angelegt in der ersten Spalte.</p>

        <label className={`mt-5 ${labelClass}`}>
          Titel
          <input
            autoComplete="off"
            enterKeyHint="done"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={200}
            data-autofocus
            className={`mt-1 font-normal ${fieldClass}`}
          />
        </label>

        <div className="mt-4 flex flex-col gap-1">
          <span className={labelClass}>Priorität</span>
          <div>
            <PriorityPicker value={priority} onChange={setPriority} />
          </div>
        </div>

        {lanes.length > 1 && (
          <label className={`mt-4 ${labelClass}`}>
            Swimlane
            <select value={laneId} onChange={(event) => setLaneId(Number(event.target.value))} className={`mt-1 font-normal ${fieldClass}`}>
              {lanes.map((lane) => (
                <option key={lane.id} value={lane.id}>
                  {lane.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {failed && (
          <p role="alert" className="mt-3 text-sm text-danger-text">
            Der Task konnte nicht angelegt werden. Bitte versuche es erneut.
          </p>
        )}

        <div className={dialogActionsClass}>
          <Button variant="ghost" disabled={submitting} onClick={onClose}>
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

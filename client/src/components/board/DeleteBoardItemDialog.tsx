import { useState } from 'react';
import { countLabel } from '../../utils/projects';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { fieldClass, labelClass } from '../ui/styles';

interface DeleteBoardItemDialogProps {
  kind: 'column' | 'lane';
  name: string;
  taskCount: number;
  /** The other columns or lanes the tasks can move to. */
  targets: { id: number; name: string }[];
  /** Resolves to true when deleted. */
  onConfirm: (moveTasksTo?: number) => Promise<boolean>;
  onClose: () => void;
}

/** Confirms deleting a column or lane; when it has tasks, asks where they should go. Open while mounted. */
export default function DeleteBoardItemDialog({ kind, name, taskCount, targets, onConfirm, onClose }: DeleteBoardItemDialogProps) {
  const [target, setTarget] = useState(targets[0]?.id);
  const [deleting, setDeleting] = useState(false);
  const label = kind === 'column' ? 'Spalte' : 'Swimlane';

  async function confirm() {
    setDeleting(true);
    const deleted = await onConfirm(taskCount > 0 ? target : undefined);
    if (deleted) onClose();
    else setDeleting(false);
  }

  return (
    <Dialog onClose={onClose} dismissible={!deleting} labelledBy="delete-board-item-title" mobile="compact" className="max-w-sm p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void confirm();
        }}
      >
        <h2 id="delete-board-item-title" className="text-base font-semibold text-fg">
          {label} löschen?
        </h2>
        {taskCount === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">
            Die leere {label} „{name}“ wird gelöscht.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-fg-muted">
              „{name}“ enthält {countLabel(taskCount, 'Task', 'Tasks')}. Sie werden verschoben, nicht gelöscht.
            </p>
            <label className={`mt-4 ${labelClass}`}>
              Verschieben nach
              <select
                value={target}
                onChange={(event) => setTarget(Number(event.target.value))}
                data-autofocus
                className={`mt-1 ${fieldClass}`}
              >
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" disabled={deleting} onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" variant="danger" disabled={deleting} data-autofocus={taskCount === 0 || undefined}>
            {label} löschen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

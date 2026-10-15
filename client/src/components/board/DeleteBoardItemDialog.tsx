import { useEffect, useRef, useState } from 'react';
import { countLabel } from '../../utils/projects';

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
  const ref = useRef<HTMLDialogElement>(null);
  const [target, setTarget] = useState(targets[0]?.id);
  const [deleting, setDeleting] = useState(false);
  const label = kind === 'column' ? 'Spalte' : 'Swimlane';

  useEffect(() => {
    ref.current?.showModal();
  }, []);

  async function confirm() {
    setDeleting(true);
    const deleted = await onConfirm(taskCount > 0 ? target : undefined);
    if (deleted) onClose();
    else setDeleting(false);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="delete-board-item-title"
      className="m-auto w-full max-w-sm rounded-lg bg-white p-6 shadow-xl backdrop:bg-slate-900/40"
      onCancel={(event) => {
        event.preventDefault();
        if (!deleting) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void confirm();
        }}
      >
        <h2 id="delete-board-item-title" className="text-lg font-semibold text-slate-900">
          {label} löschen?
        </h2>
        {taskCount === 0 ? (
          <p className="mt-2 text-sm text-slate-600">
            Die leere {label} „{name}“ wird gelöscht.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              „{name}“ enthält {countLabel(taskCount, 'Task', 'Tasks')}. Sie werden verschoben, nicht gelöscht.
            </p>
            <label className="mt-4 block text-sm text-slate-700">
              Verschieben nach
              <select
                value={target}
                onChange={(event) => setTarget(Number(event.target.value))}
                autoFocus
                className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none"
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
          <button
            type="button"
            disabled={deleting}
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={deleting}
            autoFocus={taskCount === 0}
            className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {label} löschen
          </button>
        </div>
      </form>
    </dialog>
  );
}

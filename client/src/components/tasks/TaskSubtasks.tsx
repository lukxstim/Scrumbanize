import { useState } from 'react';
import type { BoardColumn, Task } from '../../types/task';
import { CheckIcon, PlusIcon } from '../icons';
import { fieldClass, labelClass } from '../ui/styles';

interface TaskSubtasksProps {
  task: Task;
  /** The project's tasks on the board. */
  allTasks: Task[];
  columns: BoardColumn[];
  /** Makes this task a subtask of another one, or (null) an ordinary task again. */
  onSetParent: (parentId: number | null) => Promise<unknown>;
  /** Creates a subtask of this task; without it, there is no field to add one. */
  onCreate?: (title: string) => Promise<unknown>;
  onOpen: (id: number) => void;
  /** Viewers (US-21): subtasks can be opened, nothing changes. */
  readOnly?: boolean;
}

/**
 * "Unteraufgaben" in the task details (US-28), one level deep: a task lists its subtasks (ticked once they are in the
 * last column) and adds new ones; a subtask shows the task it belongs to and can be let go; an ordinary task without
 * subtasks can be put under another one.
 */
export default function TaskSubtasks({ task, allTasks, columns, onSetParent, onCreate, onOpen, readOnly = false }: TaskSubtasksProps) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doneColumnId = columns.at(-1)?.id;
  const columnName = (id: number) => columns.find((c) => c.id === id)?.name ?? '';
  const onBoard = new Set(allTasks.map((t) => t.id));
  const parent = task.parentId === null ? undefined : allTasks.find((t) => t.id === task.parentId);
  const subtasks = allTasks.filter((t) => t.parentId === task.id).sort((a, b) => a.id - b.id);
  // Possible parents: ordinary tasks, not this one.
  const parents = allTasks.filter((t) => t.id !== task.id && (t.parentId === null || !onBoard.has(t.parentId)));

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch {
      setError(failure);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (parent) {
    return (
      <section aria-labelledby="task-subtasks-heading">
        <h3 id="task-subtasks-heading" className={`mb-2 ${labelClass}`}>
          Unteraufgabe von
        </h3>
        <div className="flex items-center gap-2 text-sm">
          <button type="button" onClick={() => onOpen(parent.id)} className="min-w-0 truncate text-left text-accent-text hover:underline">
            <span className="font-mono text-xs text-fg-subtle">#{parent.id}</span> {parent.title}
          </button>
          {!readOnly && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => onSetParent(null), 'Die Unteraufgabe konnte nicht gelöst werden.')}
              className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium text-fg-subtle hover:bg-surface-hover hover:text-fg disabled:opacity-50"
            >
              Lösen
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-1 text-xs text-danger-text">
            {error}
          </p>
        )}
      </section>
    );
  }

  const done = subtasks.filter((t) => t.columnId === doneColumnId).length;
  return (
    <section aria-labelledby="task-subtasks-heading">
      <h3 id="task-subtasks-heading" className={`mb-2 ${labelClass}`}>
        Unteraufgaben{subtasks.length > 0 && <span className="font-normal text-fg-subtle"> · {done} von {subtasks.length} erledigt</span>}
      </h3>
      {subtasks.length > 0 && (
        <ul className="mb-2 flex flex-col gap-1">
          {subtasks.map((sub) => {
            const isDone = sub.columnId === doneColumnId;
            return (
              <li key={sub.id} className="flex items-center gap-2 text-sm">
                <span
                  aria-hidden="true"
                  className={`grid size-4 shrink-0 place-items-center rounded border ${isDone ? 'border-success-text bg-success-text text-white' : 'border-line-strong'}`}
                >
                  {isDone && <CheckIcon className="size-3" />}
                </span>
                <button
                  type="button"
                  onClick={() => onOpen(sub.id)}
                  className={`min-w-0 truncate text-left hover:underline ${isDone ? 'text-fg-subtle line-through' : 'text-fg'}`}
                >
                  <span className="font-mono text-xs text-fg-subtle">#{sub.id}</span> {sub.title}
                </button>
                <span className="ml-auto shrink-0 text-xs text-fg-subtle">
                  {isDone ? <span className="sr-only">erledigt, </span> : null}
                  {columnName(sub.columnId)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && onCreate && (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const name = title.trim();
            if (!name) return;
            void run(() => onCreate(name), 'Die Unteraufgabe konnte nicht angelegt werden.').then((ok) => ok && setTitle(''));
          }}
        >
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            placeholder="Unteraufgabe hinzufügen …"
            aria-label="Neue Unteraufgabe"
            className={`!py-1 text-sm ${fieldClass}`}
          />
          <button
            type="submit"
            disabled={busy || !title.trim()}
            aria-label="Unteraufgabe anlegen"
            className="grid size-8 shrink-0 place-items-center rounded-md text-accent-text hover:bg-accent-muted disabled:opacity-40"
          >
            <PlusIcon className="size-4" />
          </button>
        </form>
      )}
      {!readOnly && subtasks.length === 0 && parents.length > 0 && (
        <label className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
          Oder unterordnen:
          <select
            value=""
            disabled={busy}
            onChange={(event) => {
              const id = Number(event.target.value);
              if (id) void run(() => onSetParent(id), 'Der Task konnte nicht untergeordnet werden.');
            }}
            className={`!w-auto max-w-64 !py-0.5 !text-xs ${fieldClass}`}
          >
            <option value="">Übergeordneten Task wählen …</option>
            {parents.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.id} {t.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger-text">
          {error}
        </p>
      )}
    </section>
  );
}

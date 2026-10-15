import { useState } from 'react';
import { PlusIcon } from '../icons';
import { fieldClass } from '../ui/styles';

interface NewTaskFormProps {
  onCreate: (title: string) => Promise<unknown>;
  /** Starts with the field open, e.g. for "Neuer Task" from the command palette. */
  defaultOpen?: boolean;
}

/** "+ Task" in the first column of each lane: Enter creates the task and keeps the field open for the next one. */
export default function NewTaskForm({ onCreate, defaultOpen = false }: NewTaskFormProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    setFailed(false);
    try {
      await onCreate(title.trim());
      setTitle('');
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-fg-subtle transition-colors duration-150 hover:bg-surface-strong hover:text-fg"
      >
        <PlusIcon />
        Task
      </button>
    );
  }

  return (
    <form
      className="animate-pop-in"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            setTitle('');
          }
        }}
        onBlur={() => {
          if (!title.trim()) setOpen(false);
        }}
        disabled={saving}
        autoFocus
        maxLength={200}
        placeholder="Titel des Tasks …"
        aria-label="Titel des neuen Tasks"
        className={`px-2 ${fieldClass}`}
      />
      <p className="mt-1 text-[11px] text-fg-subtle">Enter zum Anlegen, Esc zum Abbrechen</p>
      {failed && (
        <p role="alert" className="mt-1 text-xs text-danger-text">
          Der Task konnte nicht angelegt werden.
        </p>
      )}
    </form>
  );
}

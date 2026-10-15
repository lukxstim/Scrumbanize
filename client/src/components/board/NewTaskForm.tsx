import { useState } from 'react';
import { PlusIcon } from '../icons';

/** "+ Task" at the bottom of the Backlog: Enter creates the task and keeps the field open for the next one. */
export default function NewTaskForm({ onCreate }: { onCreate: (title: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
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
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-sm font-medium text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
      >
        <PlusIcon />
        Task
      </button>
    );
  }

  return (
    <form
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
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <p className="mt-1 text-[11px] text-slate-400">Enter zum Anlegen, Esc zum Abbrechen</p>
      {failed && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          Der Task konnte nicht angelegt werden.
        </p>
      )}
    </form>
  );
}

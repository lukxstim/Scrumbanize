import { useState } from 'react';
import { PlusIcon } from '../icons';

interface AddItemButtonProps {
  /** "Spalte" or "Swimlane". */
  label: string;
  placeholder: string;
  /** Resolves to true when the item was added. */
  onAdd: (name: string) => Promise<boolean>;
  className?: string;
}

/** "+ Spalte" / "+ Swimlane": turns into a name field; Enter adds, Escape cancels. */
export default function AddItemButton({ label, placeholder, onAdd, className = '' }: AddItemButtonProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    const added = await onAdd(name.trim());
    setSaving(false);
    if (added) {
      setName('');
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 ${className}`}
      >
        <PlusIcon />
        {label}
      </button>
    );
  }

  return (
    <form
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <input
        value={name}
        autoFocus
        maxLength={40}
        disabled={saving}
        placeholder={placeholder}
        aria-label={`Name der neuen ${label}`}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            setName('');
          }
        }}
        onBlur={() => {
          if (!name.trim()) setOpen(false);
        }}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <p className="mt-1 text-[11px] text-slate-400">Enter zum Anlegen, Esc zum Abbrechen</p>
    </form>
  );
}

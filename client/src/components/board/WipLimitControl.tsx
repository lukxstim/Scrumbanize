import { useState } from 'react';
import { wipState } from '../../utils/board';
import { isolate } from './isolate';

interface WipLimitControlProps {
  count: number;
  limit: number | null;
  columnLabel: string;
  onChange: (limit: number | null) => void;
  /** Lets the column menu open the editor. */
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
}

const STATE_CLASSES = {
  none: 'text-slate-500',
  ok: 'text-slate-500',
  'at-limit': 'bg-amber-100 text-amber-800',
  'over-limit': 'bg-red-600 text-white',
};

/** Shows "count / limit"; click to edit, empty means unlimited. */
export default function WipLimitControl({ count, limit, columnLabel, onChange, editing, onEditingChange }: WipLimitControlProps) {
  const [text, setText] = useState('');
  const [wasEditing, setWasEditing] = useState(editing);
  const state = wipState(count, limit);

  // Fill the field with the current limit whenever editing starts.
  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) setText(limit === null ? '' : String(limit));
  }

  function commit() {
    onEditingChange(false);
    const value = text.trim() === '' ? null : Number(text);
    if (value === null || (Number.isInteger(value) && value >= 1 && value <= 999)) {
      if (value !== limit) onChange(value);
    }
  }

  if (editing) {
    return (
      <input
        type="number"
        min={1}
        max={999}
        value={text}
        autoFocus
        {...isolate}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') onEditingChange(false);
        }}
        placeholder="∞"
        aria-label={`WIP-Limit für „${columnLabel}“ (leer = kein Limit)`}
        className="w-14 rounded border border-indigo-400 px-1.5 py-0.5 text-xs focus:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      {...isolate}
      onClick={(event) => {
        event.stopPropagation();
        onEditingChange(true);
      }}
      title={
        state === 'over-limit'
          ? `WIP-Limit überschritten (${count} von max. ${limit}). Klicken zum Ändern.`
          : 'WIP-Limit ändern'
      }
      aria-label={`${count} Tasks, WIP-Limit ${limit ?? 'keins'}. Limit ändern`}
      className={`rounded px-1.5 py-0.5 text-xs font-medium tabular-nums ${STATE_CLASSES[state]} hover:ring-1 hover:ring-slate-300`}
    >
      {limit === null ? `${count} / ∞` : `${count} / ${limit}`}
    </button>
  );
}

import { useState } from 'react';
import { wipState } from '../../utils/board';

interface WipLimitControlProps {
  count: number;
  limit: number | null;
  columnLabel: string;
  onChange: (limit: number | null) => void;
}

const STATE_CLASSES = {
  none: 'text-slate-500',
  ok: 'text-slate-500',
  'at-limit': 'bg-amber-100 text-amber-800',
  'over-limit': 'bg-red-600 text-white',
};

/** Shows "count / limit" for columns that support a WIP limit; click to edit, empty means unlimited. */
export default function WipLimitControl({ count, limit, columnLabel, onChange }: WipLimitControlProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const state = wipState(count, limit);

  function commit() {
    setEditing(false);
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
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') setEditing(false);
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
      onClick={() => {
        setText(limit === null ? '' : String(limit));
        setEditing(true);
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

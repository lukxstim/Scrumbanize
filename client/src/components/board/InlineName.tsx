import { useState } from 'react';
import { isolate } from './isolate';

interface InlineNameProps {
  name: string;
  /** Accessible name of the input, e.g. "Name der Spalte". */
  label: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onRename: (name: string) => void;
  className?: string;
}

/** A name that turns into an input on double-click (or when `editing` is set, e.g. from a menu). */
export default function InlineName({ name, label, editing, onEditingChange, onRename, className = '' }: InlineNameProps) {
  const [text, setText] = useState(name);
  const [wasEditing, setWasEditing] = useState(editing);

  if (editing !== wasEditing) {
    setWasEditing(editing);
    if (editing) setText(name);
  }

  function commit() {
    onEditingChange(false);
    const trimmed = text.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
  }

  if (editing) {
    return (
      <input
        value={text}
        autoFocus
        maxLength={40}
        aria-label={label}
        {...isolate}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') onEditingChange(false);
        }}
        className={`min-w-0 flex-1 rounded border border-accent-line bg-surface px-1.5 py-0.5 focus:outline-none ${className}`}
      />
    );
  }

  return (
    <span
      title="Doppelklick zum Umbenennen"
      onDoubleClick={(event) => {
        event.stopPropagation();
        onEditingChange(true);
      }}
      className={`min-w-0 truncate ${className}`}
    >
      {name}
    </span>
  );
}

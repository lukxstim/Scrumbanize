import { useState } from 'react';
import type { TagCount } from '../../types/note';
import Popover from '../ui/Popover';
import { fieldClass, iconButtonClass } from '../ui/styles';

interface TagFilterProps {
  tags: TagCount[];
  selected: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}

const FunnelIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-none stroke-current stroke-[1.5]">
    <path d="M2.5 3h11l-4.25 5v4.5l-2.5 1V8z" strokeLinejoin="round" />
  </svg>
);

/**
 * Filtering by tags (US-34): one button that opens the tags to tick, instead of every tag always in sight. The number
 * on the button tells how many are active; `ActiveTags` shows them as chips to take off again.
 */
export function TagFilterButton({ tags, selected, onToggle, onClear }: TagFilterProps) {
  const [query, setQuery] = useState('');
  if (tags.length === 0) return null;
  const shown = tags.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <Popover
      label={selected.length > 0 ? `Nach Tags filtern (${selected.length} aktiv)` : 'Nach Tags filtern'}
      title="Nach Tags filtern"
      align="right"
      trigger={
        <>
          <FunnelIcon />
          {selected.length > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-accent text-[9px] font-semibold text-white tabular-nums">
              {selected.length}
            </span>
          )}
        </>
      }
      triggerClassName={`relative ${iconButtonClass} ${selected.length > 0 ? '!text-accent-text' : ''}`}
    >
      <div className="flex items-center justify-between px-3 pt-1 pb-1.5">
        <span className="text-xs font-medium text-fg-subtle">Nach Tags filtern</span>
        {selected.length > 0 && (
          <button type="button" className="text-xs text-accent-text hover:underline" onClick={onClear}>
            Zurücksetzen
          </button>
        )}
      </div>
      {tags.length > 8 && (
        <div className="px-2 pb-1.5">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tag suchen …"
            aria-label="Tag suchen"
            autoComplete="off"
            className={`!h-7 !text-xs ${fieldClass}`}
          />
        </div>
      )}
      <ul className="max-h-64 overflow-y-auto">
        {shown.map(({ name, count }) => (
          <li key={name}>
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1 text-sm text-fg-muted hover:bg-surface-hover hover:text-fg pointer-coarse:min-h-11">
              <input type="checkbox" checked={selected.includes(name)} onChange={() => onToggle(name)} className="size-3.5 accent-accent" />
              <span className="flex-1 truncate">{name}</span>
              <span className="text-xs text-fg-subtle tabular-nums">{count}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="px-3 py-2 text-xs text-fg-subtle">Kein Tag gefunden.</li>}
      </ul>
    </Popover>
  );
}

/** The active tag filter as chips; a click takes one off. Nothing while no tag is active. */
export function ActiveTags({ selected, onRemove }: { selected: string[]; onRemove: (tag: string) => void }) {
  if (selected.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
      Mit Tag
      {selected.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onRemove(tag)}
          title="Filter aufheben"
          className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-white transition-opacity hover:opacity-85"
        >
          {tag}
          <span aria-hidden="true">×</span>
          <span className="sr-only">entfernen</span>
        </button>
      ))}
    </div>
  );
}

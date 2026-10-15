import type { TagCount } from '../../types/note';

interface TagFilterProps {
  tags: TagCount[];
  selected: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}

export default function TagFilter({ tags, selected, onToggle, onClear }: TagFilterProps) {
  if (tags.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-fg-subtle">Nach Tags filtern</span>
        {selected.length > 0 && (
          <button type="button" className="text-xs text-accent-text hover:underline" onClick={onClear}>
            Zurücksetzen
          </button>
        )}
      </div>
      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {tags.map(({ name, count }) => {
          const active = selected.includes(name);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(name)}
              className={`rounded-full border px-2 py-0.5 text-xs transition-colors duration-150 ${
                active
                  ? 'border-accent bg-accent text-white'
                  : 'border-line bg-surface text-fg-muted hover:border-accent-line hover:text-fg'
              }`}
            >
              {name} <span className={active ? 'text-accent-fg/70' : 'text-fg-subtle'}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

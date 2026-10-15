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
        <span className="text-xs font-medium text-slate-500">Nach Tags filtern</span>
        {selected.length > 0 && (
          <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={onClear}>
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
              className={`rounded-full border px-2 py-0.5 text-xs ${
                active
                  ? 'border-indigo-600 bg-indigo-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-400'
              }`}
            >
              {name} <span className={active ? 'text-indigo-200' : 'text-slate-400'}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { PRIORITIES_DESC, PRIORITY_LABELS, PRIORITY_STYLES } from '../../utils/priority';
import {
  DEFAULT_VIEW,
  DUE_FILTER_LABELS,
  isFiltered,
  SORT_LABELS,
  type DueFilter,
  type PriorityFilter,
  type TaskSort,
  type TaskView,
} from '../../utils/taskView';
import { fieldClass } from '../ui/styles';

interface BoardViewBarProps {
  view: TaskView;
  onChange: (view: TaskView) => void;
  /** Tasks shown and in total, for the "x von y" hint while filtering. */
  shown: number;
  total: number;
}

const selectClass = `!w-auto !py-0.5 !pl-2 !text-xs ${fieldClass}`;

const PRIORITY_CHIPS: { value: PriorityFilter; label: string; dot?: string }[] = [
  ...PRIORITIES_DESC.map((p) => ({ value: p, label: PRIORITY_LABELS[p], dot: PRIORITY_STYLES[p].dot })),
  { value: 'none', label: 'Ohne' },
];

/** Sorting and filters of the board. They only change what is shown, never the saved order. */
export default function BoardViewBar({ view, onChange, shown, total }: BoardViewBarProps) {
  function togglePriority(value: PriorityFilter) {
    const priorities = view.priorities.includes(value) ? view.priorities.filter((p) => p !== value) : [...view.priorities, value];
    onChange({ ...view, priorities });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-fg-muted">
      <div className="flex items-center gap-1.5">
        <label htmlFor="board-sort">Sortierung</label>
        <select
          id="board-sort"
          value={view.sort}
          onChange={(event) => onChange({ ...view, sort: event.target.value as TaskSort })}
          className={selectClass}
          title={view.sort === 'manual' ? undefined : 'Solange sortiert wird, lässt sich die Reihenfolge in einer Zelle nicht per Drag & Drop ändern.'}
        >
          {Object.entries(SORT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div role="group" aria-label="Nach Priorität filtern" className="flex items-center gap-1">
        <span aria-hidden="true">Priorität</span>
        {PRIORITY_CHIPS.map((chip) => {
          const active = view.priorities.includes(chip.value);
          return (
            <button
              key={chip.value}
              type="button"
              aria-pressed={active}
              onClick={() => togglePriority(chip.value)}
              className={`flex h-6 items-center gap-1 rounded-full px-2 font-medium ring-1 ring-inset transition-colors ${
                active ? 'bg-accent-muted text-accent-text ring-accent-line' : 'text-fg-subtle ring-line hover:bg-surface-hover hover:text-fg'
              }`}
            >
              {chip.dot && <span aria-hidden="true" className={`size-2 rounded-full ${chip.dot}`} />}
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <label htmlFor="board-due-filter">Fälligkeit</label>
        <select
          id="board-due-filter"
          value={view.due}
          onChange={(event) => onChange({ ...view, due: event.target.value as DueFilter })}
          className={selectClass}
        >
          {Object.entries(DUE_FILTER_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {(isFiltered(view) || view.sort !== 'manual') && (
        <div className="flex items-center gap-2">
          {isFiltered(view) && (
            <span aria-live="polite">
              {shown} von {total} Tasks
            </span>
          )}
          <button type="button" onClick={() => onChange(DEFAULT_VIEW)} className="font-medium text-accent-text hover:underline">
            Zurücksetzen
          </button>
        </div>
      )}
    </div>
  );
}

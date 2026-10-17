import { useEffect, useRef, useState } from 'react';
import type { Label } from '../../types/task';
import { LABEL_STYLES } from '../../utils/labels';
import type { LabelFilter } from '../../utils/taskView';
import { ChevronDownIcon } from '../icons';
import { popoverClass } from '../ui/styles';
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
  /** The project's labels, to filter by. */
  labels: Label[];
  onManageLabels: () => void;
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
export default function BoardViewBar({ view, onChange, labels, onManageLabels, shown, total }: BoardViewBarProps) {
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

      <LabelFilter labels={labels} selected={view.labels ?? []} onChange={(next) => onChange({ ...view, labels: next })} onManage={onManageLabels} />

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

/** "Labels ▾": tasks with at least one of the ticked labels (or without any, for "Ohne Label"). */
function LabelFilter({
  labels,
  selected,
  onChange,
  onManage,
}: {
  labels: Label[];
  selected: LabelFilter[];
  onChange: (next: LabelFilter[]) => void;
  onManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Labels deleted meanwhile do not count.
  const active = selected.filter((id) => id === 'none' || labels.some((l) => l.id === id));
  const toggle = (id: LabelFilter) => onChange(active.includes(id) ? active.filter((a) => a !== id) : [...active, id]);
  const options: { id: LabelFilter; name: string; dot?: string }[] = [
    ...labels.map((l) => ({ id: l.id, name: l.name, dot: LABEL_STYLES[l.color].dot })),
    { id: 'none', name: 'Ohne Label' },
  ];

  return (
    <div
      ref={containerRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-6 items-center gap-1 rounded-full px-2 font-medium ring-1 ring-inset transition-colors ${
          active.length ? 'bg-accent-muted text-accent-text ring-accent-line' : 'text-fg-subtle ring-line hover:bg-surface-hover hover:text-fg'
        }`}
      >
        Labels{active.length ? ` (${active.length})` : ''}
        <ChevronDownIcon className="size-3" />
      </button>
      {open && (
        <div role="group" aria-label="Nach Labels filtern" className={`absolute left-0 z-30 mt-1 w-56 p-1 ${popoverClass}`}>
          {options.map((option) => (
            <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-fg hover:bg-surface-hover">
              <input type="checkbox" checked={active.includes(option.id)} onChange={() => toggle(option.id)} />
              {option.dot ? <span aria-hidden="true" className={`size-2 rounded-full ${option.dot}`} /> : <span className="size-2" />}
              <span className="truncate">{option.name}</span>
            </label>
          ))}
          <div className="mt-1 border-t border-line pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              className="w-full rounded px-2 py-1.5 text-left text-sm text-accent-text hover:bg-surface-hover"
            >
              Labels verwalten …
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import type { Lane } from '../../types/task';
import { countLabel } from '../../utils/projects';
import { ChevronDownIcon } from '../icons';
import Menu from '../Menu';
import InlineName from './InlineName';

interface LaneHeaderProps {
  lane: Lane;
  /** Tasks in the lane across all columns. */
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  isFirst: boolean;
  isLast: boolean;
  onRename: (name: string) => void;
  /** -1 moves up, 1 moves down. */
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

/** Shown above each lane once a project has two or more. Stays visible while scrolling sideways. */
export default function LaneHeader({ lane, count, collapsed, onToggle, isFirst, isLast, onRename, onMove, onDelete }: LaneHeaderProps) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="sticky left-4 flex w-fit max-w-[calc(100vw-4rem)] items-center gap-1.5 pt-1">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        aria-label={`Swimlane „${lane.name}“ ${collapsed ? 'ausklappen' : 'einklappen'}`}
        className="grid size-6 place-items-center rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
      >
        <ChevronDownIcon className={`size-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
      </button>
      <InlineName
        name={lane.name}
        label={`Name der Swimlane „${lane.name}“`}
        editing={renaming}
        onEditingChange={setRenaming}
        onRename={onRename}
        className="text-sm font-semibold text-slate-700"
      />
      <span className="whitespace-nowrap text-xs text-slate-500">· {countLabel(count, 'Task', 'Tasks')}</span>
      <Menu
        label={`Swimlane „${lane.name}“: Aktionen`}
        trigger={<span aria-hidden="true">⋯</span>}
        align="left"
        triggerClassName="grid size-6 place-items-center rounded-md text-base leading-none text-slate-500 hover:bg-slate-200/70 hover:text-slate-800"
        items={[
          { label: 'Umbenennen', onSelect: () => setRenaming(true) },
          { label: 'Nach oben', onSelect: () => onMove(-1), disabledReason: isFirst ? 'Schon ganz oben' : undefined },
          { label: 'Nach unten', onSelect: () => onMove(1), disabledReason: isLast ? 'Schon ganz unten' : undefined },
          { label: 'Swimlane löschen …', onSelect: onDelete, danger: true },
        ]}
      />
    </div>
  );
}

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
  /** Owners (US-21): rename, move, delete. */
  manage?: boolean;
}

/**
 * Shown above each lane once a project has two or more. Stays visible while scrolling sideways, and while scrolling
 * through the lane it sticks below the column headers (`--board-header-height`, measured by the board). The bar
 * spans the board, so cards scroll away underneath it.
 */
export default function LaneHeader({ lane, count, collapsed, onToggle, isFirst, isLast, onRename, onMove, onDelete, manage = true }: LaneHeaderProps) {
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="sticky top-(--board-header-height) z-[5] -mx-4 bg-canvas px-4 py-1">
      <div className="sticky left-4 flex w-fit max-w-[calc(100vw-4rem)] items-center gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-label={`Swimlane „${lane.name}“ ${collapsed ? 'ausklappen' : 'einklappen'}`}
          className="grid size-6 place-items-center rounded-md text-fg-subtle hover:bg-surface-strong hover:text-fg"
        >
          <ChevronDownIcon className={`size-4 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
        <InlineName
          name={lane.name}
          label={`Name der Swimlane „${lane.name}“`}
          editing={renaming}
          onEditingChange={setRenaming}
          onRename={onRename}
          className="text-sm font-semibold text-fg-muted"
          readOnly={!manage}
        />
        <span className="whitespace-nowrap text-xs text-fg-subtle">· {countLabel(count, 'Task', 'Tasks')}</span>
        {manage && (
          <Menu
            label={`Swimlane „${lane.name}“: Aktionen`}
            trigger={<span aria-hidden="true">⋯</span>}
            align="left"
            triggerClassName="grid size-6 place-items-center rounded-md text-base leading-none text-fg-subtle hover:bg-surface-strong hover:text-fg"
            items={[
              { label: 'Umbenennen', onSelect: () => setRenaming(true) },
              { label: 'Nach oben', onSelect: () => onMove(-1), disabledReason: isFirst ? 'Schon ganz oben' : undefined },
              { label: 'Nach unten', onSelect: () => onMove(1), disabledReason: isLast ? 'Schon ganz unten' : undefined },
              { label: 'Swimlane löschen …', onSelect: onDelete, danger: true },
            ]}
          />
        )}
      </div>
    </div>
  );
}

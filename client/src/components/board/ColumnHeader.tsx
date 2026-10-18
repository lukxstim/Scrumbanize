import { useDraggable } from '@dnd-kit/core';
import { useState } from 'react';
import type { BoardColumn } from '../../types/task';
import { wipState } from '../../utils/board';
import { columnWidthVar } from '../../utils/columnWidths';
import Menu from '../Menu';
import ColumnResizeHandle from './ColumnResizeHandle';
import InlineName from './InlineName';
import { isolate } from './isolate';
import WipLimitControl from './WipLimitControl';

export const columnDragId = (columnId: number) => `column:${columnId}`;

interface ColumnHeaderProps {
  column: BoardColumn;
  /** Tasks in the column across all lanes. */
  count: number;
  /** The width shown now, saved or default. */
  width: number;
  isFirst: boolean;
  isLast: boolean;
  /** Why the column cannot be deleted (the last one), if so. */
  deleteDisabledReason?: string;
  onRename: (name: string) => void;
  onWipLimitChange: (limit: number | null) => void;
  /** A new width, or null for the default. */
  onResize: (width: number | null) => void;
  /** -1 moves left, 1 moves right. */
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

/** Drag the header (or press Space on it) to reorder columns. `data-column-header` is measured while dragging. */
export default function ColumnHeader({
  column,
  count,
  width,
  isFirst,
  isLast,
  deleteDisabledReason,
  onRename,
  onWipLimitChange,
  onResize,
  onMove,
  onDelete,
}: ColumnHeaderProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: columnDragId(column.id),
    data: { type: 'column' },
  });
  const [renaming, setRenaming] = useState(false);
  const [editingWip, setEditingWip] = useState(false);
  const overLimit = wipState(count, column.wipLimit) === 'over-limit';

  return (
    <div
      ref={setNodeRef}
      data-column-header={column.id}
      {...attributes}
      {...listeners}
      aria-roledescription="verschiebbare Spalte"
      aria-label={`Spalte „${column.name}“`}
      // The board sets the variable from the saved widths; a resize handle changes it while dragging.
      style={{ width: `var(${columnWidthVar(column.id)}, ${width}px)` }}
      className={`relative flex shrink-0 cursor-grab touch-manipulation select-none items-center gap-2 rounded-lg px-3 py-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        isDragging
          ? 'border border-dashed border-accent-line bg-accent-muted [&>*]:invisible'
          : overLimit
            ? 'bg-danger-muted text-danger-text ring-1 ring-danger-line'
            : 'bg-surface-strong text-fg-muted'
      }`}
    >
      <InlineName
        name={column.name}
        label={`Name der Spalte „${column.name}“`}
        editing={renaming}
        onEditingChange={setRenaming}
        onRename={onRename}
        className="text-sm font-semibold"
      />
      <div className="flex-1" />
      <WipLimitControl
        count={count}
        limit={column.wipLimit}
        columnLabel={column.name}
        onChange={onWipLimitChange}
        editing={editingWip}
        onEditingChange={setEditingWip}
      />
      <div {...isolate}>
        <Menu
          label={`Spalte „${column.name}“: Aktionen`}
          trigger={<span aria-hidden="true">⋯</span>}
          triggerClassName="grid size-6 place-items-center rounded-md text-base leading-none text-fg-subtle hover:bg-surface/70 hover:text-fg"
          items={[
            { label: 'Umbenennen', onSelect: () => setRenaming(true) },
            { label: 'WIP-Limit ändern', onSelect: () => setEditingWip(true) },
            {
              label: 'Breite zurücksetzen',
              onSelect: () => onResize(null),
              disabledReason: column.width === null ? 'Die Spalte hat schon die Standardbreite' : undefined,
            },
            { label: 'Nach links', onSelect: () => onMove(-1), disabledReason: isFirst ? 'Schon ganz links' : undefined },
            { label: 'Nach rechts', onSelect: () => onMove(1), disabledReason: isLast ? 'Schon ganz rechts' : undefined },
            { label: 'Spalte löschen …', onSelect: onDelete, danger: true, disabledReason: deleteDisabledReason },
          ]}
        />
      </div>
      <ColumnResizeHandle columnId={column.id} columnName={column.name} width={width} onResize={onResize} />
    </div>
  );
}

/** The header that follows the pointer while a column is dragged. */
export function ColumnHeaderGhost({ column, width }: { column: BoardColumn; width: number }) {
  return (
    <div
      style={{ width }}
      className="flex cursor-grabbing items-center rounded-lg bg-surface px-3 py-2 text-sm font-semibold text-fg shadow-popover ring-1 ring-accent-line"
    >
      {column.name}
    </div>
  );
}

import { useDraggable } from '@dnd-kit/core';
import { useState } from 'react';
import type { BoardColumn } from '../../types/task';
import { wipState } from '../../utils/board';
import Menu from '../Menu';
import InlineName from './InlineName';
import { isolate } from './isolate';
import WipLimitControl from './WipLimitControl';

export const columnDragId = (columnId: number) => `column:${columnId}`;

interface ColumnHeaderProps {
  column: BoardColumn;
  /** Tasks in the column across all lanes. */
  count: number;
  widthClass: string;
  isFirst: boolean;
  isLast: boolean;
  /** Why the column cannot be deleted (the last one), if so. */
  deleteDisabledReason?: string;
  onRename: (name: string) => void;
  onWipLimitChange: (limit: number | null) => void;
  /** -1 moves left, 1 moves right. */
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}

/** Drag the header (or press Space on it) to reorder columns. `data-column-header` is measured while dragging. */
export default function ColumnHeader({
  column,
  count,
  widthClass,
  isFirst,
  isLast,
  deleteDisabledReason,
  onRename,
  onWipLimitChange,
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
      className={`flex shrink-0 cursor-grab touch-manipulation select-none items-center gap-2 rounded-lg px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${widthClass} ${
        isDragging
          ? 'border border-dashed border-indigo-300 bg-indigo-50/60 [&>*]:invisible'
          : overLimit
            ? 'bg-red-100 text-red-800 ring-1 ring-red-300'
            : 'bg-slate-200/70 text-slate-700'
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
          triggerClassName="grid size-6 place-items-center rounded-md text-base leading-none text-slate-500 hover:bg-white/70 hover:text-slate-800"
          items={[
            { label: 'Umbenennen', onSelect: () => setRenaming(true) },
            { label: 'WIP-Limit ändern', onSelect: () => setEditingWip(true) },
            { label: 'Nach links', onSelect: () => onMove(-1), disabledReason: isFirst ? 'Schon ganz links' : undefined },
            { label: 'Nach rechts', onSelect: () => onMove(1), disabledReason: isLast ? 'Schon ganz rechts' : undefined },
            { label: 'Spalte löschen …', onSelect: onDelete, danger: true, disabledReason: deleteDisabledReason },
          ]}
        />
      </div>
    </div>
  );
}

/** The header that follows the pointer while a column is dragged. */
export function ColumnHeaderGhost({ column, widthClass }: { column: BoardColumn; widthClass: string }) {
  return (
    <div
      className={`flex cursor-grabbing items-center rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-xl ring-1 ring-indigo-300 ${widthClass}`}
    >
      {column.name}
    </div>
  );
}

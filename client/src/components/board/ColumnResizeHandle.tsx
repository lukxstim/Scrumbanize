import type { KeyboardEvent, PointerEvent } from 'react';
import { clampWidth, columnWidthVar, MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, widthForKey } from '../../utils/columnWidths';
import { isolate } from './isolate';

interface ColumnResizeHandleProps {
  columnId: number;
  columnName: string;
  /** The width shown now (saved or default). */
  width: number;
  /** A new width, or null for the default (double-click, Enter). */
  onResize: (width: number | null) => void;
}

/**
 * The right edge of a column header (US-19): drag to change the column's width, double-click to reset it; also by
 * keyboard (←/→, with Shift in bigger steps, Home/End, Enter resets). It sits in the gap to the next column and
 * keeps its presses to itself, so it never starts a column drag. While dragging, only the board's CSS variable for
 * the column changes; the width is saved once on release.
 */
export default function ColumnResizeHandle({ columnId, columnName, width, onResize }: ColumnResizeHandleProps) {
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const board = handle.closest<HTMLElement>('[data-board]');
    const startX = event.clientX;
    let current = width;
    const show = (px: number) => board?.style.setProperty(columnWidthVar(columnId), `${px}px`);

    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('cursor-col-resize', 'select-none');

    const onMove = (move: globalThis.PointerEvent) => {
      current = clampWidth(width + move.clientX - startX);
      show(current);
    };
    const finish = (save: boolean) => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onCancel);
      document.body.classList.remove('cursor-col-resize', 'select-none');
      if (save && current !== width) onResize(current);
      // Unchanged or cancelled: back to what React knows, since the variable was changed behind its back.
      else show(width);
    };
    const onUp = () => finish(true);
    const onCancel = () => finish(false);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onCancel);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Space and arrow keys must not reach the column header, which would start a drag.
    event.stopPropagation();
    const next = widthForKey(width, event.key, event.shiftKey);
    if (next === undefined) return;
    event.preventDefault();
    if (next !== width) onResize(next);
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Breite der Spalte „${columnName}“`}
      aria-valuemin={MIN_COLUMN_WIDTH}
      aria-valuemax={MAX_COLUMN_WIDTH}
      aria-valuenow={width}
      aria-valuetext={`${width} Pixel`}
      tabIndex={0}
      title="Ziehen ändert die Breite, Doppelklick setzt sie zurück"
      {...isolate}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onResize(null);
      }}
      className="group/resize absolute inset-y-0 -right-3 z-10 flex w-3 cursor-col-resize touch-none justify-center focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className="my-1 w-0.5 rounded-full bg-accent opacity-0 transition-opacity duration-150 group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100 group-active/resize:opacity-100"
      />
    </div>
  );
}

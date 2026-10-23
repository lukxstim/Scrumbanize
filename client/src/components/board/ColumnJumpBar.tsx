import { useEffect, useRef, useState, type RefObject } from 'react';
import type { BoardColumn } from '../../types/task';
import { BOARD_PADDING_X } from '../../utils/columnWidths';

interface ColumnJumpBarProps {
  columns: BoardColumn[];
  /** While a card is dragged: the column it would land in, highlighted; a chip under the finger is a drop target. */
  dropColumnId?: number;
  /** Tasks per column, across all lanes, in the order of `columns`. */
  counts: number[];
  /** The scrolling board; its column headers carry `data-column-header`. */
  boardRef: RefObject<HTMLDivElement | null>;
}

/** Index of the column whose header is nearest to the board's left edge (where the board snaps to). */
function currentIndex(board: HTMLElement): number {
  const left = board.getBoundingClientRect().left + BOARD_PADDING_X;
  const headers = [...board.querySelectorAll<HTMLElement>('[data-column-header]')];
  let best = 0;
  headers.forEach((header, i) => {
    const distance = Math.abs(header.getBoundingClientRect().left - left);
    if (distance < Math.abs(headers[best]!.getBoundingClientRect().left - left)) best = i;
  });
  return best;
}

/** Scrolls the board so the column's header is at its left edge, where the board snaps to. */
export function scrollToColumn(board: HTMLElement, columnId: number): void {
  const header = board.querySelector<HTMLElement>(`[data-column-header="${columnId}"]`);
  if (!header) return;
  const left = board.scrollLeft + header.getBoundingClientRect().left - board.getBoundingClientRect().left - BOARD_PADDING_X;
  board.scrollTo({ left, behavior: 'smooth' });
}

/** The column of the jump bar chip at a point of the screen, if any: dragging a card onto a chip moves it there. */
export function jumpColumnAt(x: number, y: number): number | null {
  const chip = document.elementsFromPoint(x, y).find((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.jumpColumn !== undefined);
  return chip ? Number(chip.dataset.jumpColumn) : null;
}

/**
 * Phones (US-25): the board shows one column at a time; this bar names every column with its task count, marks the
 * one on screen and jumps to another with a tap.
 */
export default function ColumnJumpBar({ columns, dropColumnId, counts, boardRef }: ColumnJumpBarProps) {
  const [active, setActive] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setActive(currentIndex(board)));
    };
    board.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      board.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [boardRef]);

  // The chip of the column on screen stays visible in the bar.
  useEffect(() => {
    barRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  function jumpTo(columnId: number) {
    if (boardRef.current) scrollToColumn(boardRef.current, columnId);
  }

  return (
    <div ref={barRef} role="navigation" aria-label="Spalten" className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pt-2 pb-1 [scrollbar-width:none]">
      {columns.map((column, i) => (
        <button
          key={column.id}
          type="button"
          data-jump-column={column.id}
          aria-current={i === active ? 'true' : undefined}
          onClick={() => jumpTo(column.id)}
          className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-full pointer-coarse:min-h-11 px-3 text-xs font-medium transition-colors ${
            column.id === dropColumnId
              ? 'bg-accent-muted text-accent-text ring-2 ring-accent'
              : i === active
                ? 'bg-accent text-accent-fg'
                : 'bg-surface-strong text-fg-muted'
          }`}
        >
          {column.name}
          <span className={`tabular-nums ${i === active ? 'opacity-80' : 'text-fg-subtle'}`}>{counts[i]}</span>
        </button>
      ))}
    </div>
  );
}

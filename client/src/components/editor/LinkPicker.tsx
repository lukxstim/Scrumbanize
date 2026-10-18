import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LinkCandidate } from '../../types/link';
import { BoardIcon, NoteIcon } from '../icons';

interface LinkPickerProps {
  /** Where the typed "[[" is on screen (viewport coordinates); the list opens below it, or above near the bottom. */
  anchor: DOMRect;
  items: LinkCandidate[];
  active: number;
  loading: boolean;
  query: string;
  /** The project the user is in: other places are named next to the title. */
  projectId: number;
  onPick: (item: LinkCandidate) => void;
  onHover: (index: number) => void;
}

const WIDTH = 352;

/**
 * The list of the [[ picker (US-22), shared by the formatted editor and the Markdown source view. Keys are handled
 * by the editor (↑ ↓ Enter Tab Escape), so the focus stays in the text. Rendered into the open dialog, if the editor
 * is in one, because a modal dialog covers everything else.
 */
export default function LinkPicker({ anchor, items, active, loading, query, projectId, onPick, onHover }: LinkPickerProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [height, setHeight] = useState(0);
  const container = useRef<HTMLElement>(document.querySelector<HTMLElement>('dialog[open]') ?? document.body);

  useLayoutEffect(() => setHeight(listRef.current?.parentElement?.offsetHeight ?? 0));
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const below = anchor.bottom + 6 + height <= window.innerHeight - 8 || anchor.top < height + 14;
  const style = {
    left: Math.max(8, Math.min(anchor.left, window.innerWidth - WIDTH - 8)),
    top: below ? anchor.bottom + 6 : anchor.top - 6 - height,
    width: WIDTH,
  };

  return createPortal(
    <div
      style={style}
      // Clicking the list must not take the focus (and the caret) out of the text.
      onMouseDown={(event) => event.preventDefault()}
      className="fixed z-50 overflow-hidden rounded-lg border border-line bg-surface shadow-popover animate-pop-in"
    >
      <div className="border-b border-line px-3 py-1.5 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">
        {query ? `Verlinken: „${query}“` : 'Notiz oder Task verlinken'}
      </div>
      <ul ref={listRef} role="listbox" aria-label="Notizen und Tasks" className="max-h-64 overflow-y-auto py-1">
        {items.map((item, index) => (
          <li
            key={`${item.type}:${item.id}`}
            role="option"
            aria-selected={index === active}
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(item)}
            className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-fg-muted aria-selected:bg-surface-hover aria-selected:text-fg"
          >
            {item.type === 'note' ? <NoteIcon className="size-3.5 shrink-0 text-fg-subtle" /> : <BoardIcon className="size-3.5 shrink-0 text-fg-subtle" />}
            {item.type === 'task' && <span className="shrink-0 font-mono text-xs text-fg-subtle">#{item.id}</span>}
            <span className="min-w-0 flex-1 truncate">{item.title || (item.type === 'note' ? 'Unbenannte Notiz' : 'Ohne Titel')}</span>
            {item.projectId !== projectId && <span className="max-w-28 shrink-0 truncate text-xs text-fg-subtle">{item.projectName}</span>}
          </li>
        ))}
        {items.length === 0 && (
          <li className="px-3 py-2 text-sm text-fg-subtle">{loading ? 'Suche …' : 'Nichts gefunden.'}</li>
        )}
      </ul>
    </div>,
    container.current,
  );
}

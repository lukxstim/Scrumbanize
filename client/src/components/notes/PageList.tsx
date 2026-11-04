import { useDraggable, useDroppable } from '@dnd-kit/core';
import { Fragment, type ReactNode } from 'react';
import { useItemViewers } from '../../hooks/useCollaboration';
import type { Note } from '../../types/note';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';
import PresenceAvatars from '../PresenceAvatars';

/** The droppable of the page list: a page dropped here takes the place under the pointer (US-34). */
export const PAGE_LIST_DROP = 'pages';

interface PageListProps {
  pages: Note[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Viewers (US-21) cannot move pages. */
  canEdit: boolean;
  showTags: boolean;
  /** While a page is dragged over the list: the page it would go before, or 'end'. */
  insertBefore: number | 'end' | null;
  /** Shown instead of the list while the section has no pages. */
  empty: ReactNode;
}

const InsertLine = () => <li aria-hidden="true" className="mx-1 h-0.5 rounded-full bg-accent" />;

/**
 * The pages of one section (US-34, like OneNote): one line per page with its title. Dragged within the list, a page
 * takes a new place; dragged onto a section, it moves there.
 */
export default function PageList({ pages, selectedId, onSelect, canEdit, showTags, insertBefore, empty }: PageListProps) {
  const { setNodeRef } = useDroppable({ id: PAGE_LIST_DROP, data: { pageList: true } });
  return (
    <div ref={setNodeRef} className="min-h-full pb-6">
      {pages.length === 0 ? (
        empty
      ) : (
        <ul aria-label="Seiten" className="space-y-0.5 px-2 py-1">
          {pages.map((page) => (
            <Fragment key={page.id}>
              {insertBefore === page.id && <InsertLine />}
              <PageRow page={page} selected={page.id === selectedId} onSelect={onSelect} canEdit={canEdit} showTags={showTags} />
            </Fragment>
          ))}
          {insertBefore === 'end' && <InsertLine />}
        </ul>
      )}
    </div>
  );
}

function PageRow({ page, selected, onSelect, canEdit, showTags }: { page: Note; selected: boolean; onSelect: (id: number) => void; canEdit: boolean; showTags: boolean }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `page:${page.id}`, data: { noteId: page.id }, disabled: !canEdit });
  // Who has the page open right now (US-24).
  const viewers = useItemViewers(page.projectId, { type: 'note', id: page.id });
  return (
    <li data-page-row={page.id}>
      <button
        ref={setNodeRef}
        {...listeners}
        type="button"
        aria-current={selected || undefined}
        onClick={() => onSelect(page.id)}
        className={`flex w-full touch-manipulation items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-11 [-webkit-touch-callout:none] ${
          canEdit ? 'cursor-grab active:cursor-grabbing' : ''
        } ${selected ? 'bg-surface-strong font-semibold text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'} ${isDragging ? 'opacity-40' : ''}`}
      >
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${page.title ? '' : 'italic text-fg-subtle'}`}>{page.title || UNTITLED_NOTE}</span>
          {showTags && page.tags.length > 0 && (
            <span className="block truncate text-[11px] font-normal text-fg-subtle">{page.tags.map((t) => `#${t}`).join(' ')}</span>
          )}
        </span>
        <PresenceAvatars people={viewers} what="hat die Seite gerade offen" size="sm" />
      </button>
    </li>
  );
}

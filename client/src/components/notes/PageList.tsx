import { useDraggable } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import { useItemViewers } from '../../hooks/useCollaboration';
import type { Note } from '../../types/note';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';
import PresenceAvatars from '../PresenceAvatars';

interface PageListProps {
  pages: Note[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Viewers (US-21) cannot move pages. */
  canEdit: boolean;
  showTags: boolean;
  /** Shown instead of the list while the section has no pages. */
  empty: ReactNode;
}

/** The pages of one section (US-34, like OneNote): one line per page with its title; dragged onto a section, it moves there. */
export default function PageList({ pages, selectedId, onSelect, canEdit, showTags, empty }: PageListProps) {
  if (pages.length === 0) return <>{empty}</>;
  return (
    <ul aria-label="Seiten" className="space-y-0.5 px-2 py-1">
      {pages.map((page) => (
        <PageRow key={page.id} page={page} selected={page.id === selectedId} onSelect={onSelect} canEdit={canEdit} showTags={showTags} />
      ))}
    </ul>
  );
}

function PageRow({ page, selected, onSelect, canEdit, showTags }: { page: Note; selected: boolean; onSelect: (id: number) => void; canEdit: boolean; showTags: boolean }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `page:${page.id}`, data: { noteId: page.id }, disabled: !canEdit });
  // Who has the page open right now (US-24).
  const viewers = useItemViewers(page.projectId, { type: 'note', id: page.id });
  return (
    <li>
      <button
        ref={setNodeRef}
        {...listeners}
        type="button"
        aria-current={selected || undefined}
        onClick={() => onSelect(page.id)}
        className={`flex w-full touch-manipulation items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-150 select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent pointer-coarse:min-h-11 [-webkit-touch-callout:none] ${
          selected ? 'bg-surface-strong font-semibold text-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
        } ${isDragging ? 'opacity-50' : ''}`}
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

import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import type { ReactNode } from 'react';
import { useItemViewers } from '../../hooks/useCollaboration';
import type { Note } from '../../types/note';
import { formatDate, snippet } from '../../utils/format';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';
import PresenceAvatars from '../PresenceAvatars';

interface NoteListItemProps {
  note: Note;
  selected: boolean;
  onSelect: (id: number) => void;
  /** In the folder tree (US-22): the depth of its folder, for the indent. */
  depth?: number;
  /** Makes the note draggable onto folders (the folder tree's useDraggable). */
  drag?: { setNodeRef: (element: HTMLElement | null) => void; listeners: DraggableSyntheticListeners; isDragging: boolean; className: string };
  /** In "Alle Notizen" (US-22): the project or notebook the note belongs to. */
  place?: ReactNode;
}

export default function NoteListItem({ note, selected, onSelect, depth = 0, drag, place }: NoteListItemProps) {
  const preview = snippet(note.content);
  // Who has the note open right now (US-24).
  const viewers = useItemViewers(note.projectId, { type: 'note', id: note.id });

  return (
    <li>
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={() => onSelect(note.id)}
        ref={drag?.setNodeRef}
        {...drag?.listeners}
        style={depth > 0 ? { paddingLeft: `${2.25 + (depth - 1) * 0.875}rem` } : undefined}
        className={`block w-full border-l-2 px-4 ${depth > 0 ? 'py-2' : 'py-3'} text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
          selected ? 'border-accent bg-accent-muted' : 'border-transparent hover:bg-surface-hover'
        } ${drag?.className ?? ''} ${drag?.isDragging ? 'opacity-50' : ''}`}
      >
        <div className={`truncate text-sm font-medium ${note.title ? 'text-fg' : 'italic text-fg-subtle'}`}>
          {note.title || UNTITLED_NOTE}
        </div>
        {preview && <p className="mt-0.5 line-clamp-2 text-xs text-fg-subtle">{preview}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {place}
          {note.tags.map((tag) => (
            <span key={tag} className="rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-fg-muted">
              {tag}
            </span>
          ))}
          {note.tasks.length > 0 && (
            <span
              title={note.tasks.length === 1 ? '1 verknüpfter Task' : `${note.tasks.length} verknüpfte Tasks`}
              className="flex items-center gap-0.5 rounded bg-success-muted px-1.5 py-0.5 text-[11px] text-success-text"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3 fill-none stroke-current stroke-2">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <path d="m5 8 2 2 4-4" />
              </svg>
              {note.tasks.length}
              <span className="sr-only">{note.tasks.length === 1 ? ' verknüpfter Task' : ' verknüpfte Tasks'}</span>
            </span>
          )}
          <PresenceAvatars people={viewers} what="hat die Notiz gerade offen" size="sm" className="ml-auto" />
          <time dateTime={note.updatedAt} className={`${viewers.length ? '' : 'ml-auto '}text-[11px] text-fg-subtle`}>
            {formatDate(note.updatedAt)}
          </time>
        </div>
      </button>
    </li>
  );
}

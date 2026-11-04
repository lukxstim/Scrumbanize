import type { ReactNode } from 'react';
import type { Note } from '../../types/note';
import NoteListItem from './NoteListItem';

interface NoteListProps {
  notes: Note[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  emptyMessage: string;
  /** Where a note belongs, shown with it ("Alle Notizen", US-22). */
  placeOf?: (note: Note) => ReactNode;
  /** The tree view (US-34): titles only. */
  compact?: boolean;
  showTags?: boolean;
}

export default function NoteList({ notes, selectedId, onSelect, emptyMessage, placeOf, compact = false, showTags = true }: NoteListProps) {
  if (notes.length === 0) {
    return <p className={`text-center text-sm text-fg-subtle ${compact ? 'px-2 py-3 text-xs' : 'px-4 py-10'}`}>{emptyMessage}</p>;
  }

  return (
    <ul className={compact ? '' : 'divide-y divide-line'}>
      {notes.map((note) => (
        <NoteListItem
          key={note.id}
          note={note}
          selected={note.id === selectedId}
          onSelect={onSelect}
          place={placeOf?.(note)}
          compact={compact}
          showTags={showTags}
        />
      ))}
    </ul>
  );
}

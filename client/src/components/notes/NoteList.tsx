import type { Note } from '../../types/note';
import NoteListItem from './NoteListItem';

interface NoteListProps {
  notes: Note[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  emptyMessage: string;
}

export default function NoteList({ notes, selectedId, onSelect, emptyMessage }: NoteListProps) {
  if (notes.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <ul className="divide-y divide-slate-100">
      {notes.map((note) => (
        <NoteListItem key={note.id} note={note} selected={note.id === selectedId} onSelect={onSelect} />
      ))}
    </ul>
  );
}

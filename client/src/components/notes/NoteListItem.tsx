import type { Note } from '../../types/note';
import { formatDate, snippet } from '../../utils/format';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';

interface NoteListItemProps {
  note: Note;
  selected: boolean;
  onSelect: (id: number) => void;
}

export default function NoteListItem({ note, selected, onSelect }: NoteListItemProps) {
  const preview = snippet(note.content);

  return (
    <li>
      <button
        type="button"
        aria-current={selected || undefined}
        onClick={() => onSelect(note.id)}
        className={`block w-full border-l-2 px-4 py-3 text-left ${
          selected ? 'border-indigo-600 bg-indigo-50' : 'border-transparent hover:bg-slate-50'
        }`}
      >
        <div className={`truncate text-sm font-medium ${note.title ? 'text-slate-900' : 'italic text-slate-400'}`}>
          {note.title || UNTITLED_NOTE}
        </div>
        {preview && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{preview}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {note.tags.map((tag) => (
            <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
              {tag}
            </span>
          ))}
          {note.tasks.length > 0 && (
            <span
              title={note.tasks.length === 1 ? '1 verknüpfter Task' : `${note.tasks.length} verknüpfte Tasks`}
              className="flex items-center gap-0.5 rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700"
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3 fill-none stroke-current stroke-2">
                <rect x="2" y="2" width="12" height="12" rx="2" />
                <path d="m5 8 2 2 4-4" />
              </svg>
              {note.tasks.length}
              <span className="sr-only">{note.tasks.length === 1 ? ' verknüpfter Task' : ' verknüpfte Tasks'}</span>
            </span>
          )}
          <time dateTime={note.updatedAt} className="ml-auto text-[11px] text-slate-400">
            {formatDate(note.updatedAt)}
          </time>
        </div>
      </button>
    </li>
  );
}

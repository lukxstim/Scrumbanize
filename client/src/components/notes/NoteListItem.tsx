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
        className={`block w-full border-l-2 px-4 py-3 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
          selected ? 'border-accent bg-accent-muted' : 'border-transparent hover:bg-surface-hover'
        }`}
      >
        <div className={`truncate text-sm font-medium ${note.title ? 'text-fg' : 'italic text-fg-subtle'}`}>
          {note.title || UNTITLED_NOTE}
        </div>
        {preview && <p className="mt-0.5 line-clamp-2 text-xs text-fg-subtle">{preview}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
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
          <time dateTime={note.updatedAt} className="ml-auto text-[11px] text-fg-subtle">
            {formatDate(note.updatedAt)}
          </time>
        </div>
      </button>
    </li>
  );
}

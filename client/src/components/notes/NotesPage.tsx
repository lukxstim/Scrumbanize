import { useDeferredValue, useMemo, useState } from 'react';
import { useNotes } from '../../hooks/useNotes';
import { filterNotes, sortByUpdated } from '../../utils/filterNotes';
import { countTags } from '../../utils/tags';
import NoteEditor from './NoteEditor';
import NoteList from './NoteList';
import SearchBar from './SearchBar';
import TagFilter from './TagFilter';

export default function NotesPage() {
  const { notes, status, reload, createNote, saveNote, deleteNote } = useNotes();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newNoteId, setNewNoteId] = useState<number | null>(null);
  const [createFailed, setCreateFailed] = useState(false);

  const tagCounts = useMemo(() => countTags(notes), [notes]);
  // A selected tag disappears from the filter once no note uses it anymore.
  const activeTags = useMemo(
    () => selectedTags.filter((tag) => tagCounts.some((t) => t.name === tag)),
    [selectedTags, tagCounts],
  );
  const visibleNotes = useMemo(
    () => filterNotes(sortByUpdated(notes), deferredQuery, activeTags),
    [notes, deferredQuery, activeTags],
  );
  const selectedNote = notes.find((note) => note.id === selectedId);

  async function handleCreate() {
    setCreateFailed(false);
    try {
      const note = await createNote();
      setQuery('');
      setSelectedTags([]);
      setSelectedId(note.id);
      setNewNoteId(note.id);
    } catch {
      setCreateFailed(true);
    }
  }

  async function handleDelete(id: number) {
    await deleteNote(id);
    setSelectedId(null);
  }

  function toggleTag(tag: string) {
    setSelectedTags(activeTags.includes(tag) ? activeTags.filter((t) => t !== tag) : [...activeTags, tag]);
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="space-y-3 border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold text-slate-700">Notizen</h1>
            <button
              type="button"
              onClick={() => void handleCreate()}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
            >
              + Neue Notiz
            </button>
          </div>
          {createFailed && (
            <p role="alert" className="text-xs text-red-600">
              Die Notiz konnte nicht angelegt werden.
            </p>
          )}
          <SearchBar value={query} onChange={setQuery} />
          <TagFilter tags={tagCounts} selected={activeTags} onToggle={toggleTag} onClear={() => setSelectedTags([])} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {status === 'loading' && <p className="px-4 py-6 text-center text-sm text-slate-500">Lade Notizen …</p>}
          {status === 'error' && (
            <div className="px-4 py-6 text-center text-sm text-red-600">
              <p>Die Notizen konnten nicht geladen werden.</p>
              <button type="button" className="mt-2 underline" onClick={() => void reload()}>
                Erneut versuchen
              </button>
            </div>
          )}
          {status === 'ready' && (
            <NoteList
              notes={visibleNotes}
              selectedId={selectedId}
              onSelect={setSelectedId}
              emptyMessage={notes.length === 0 ? 'Noch keine Notizen vorhanden.' : 'Keine Notizen gefunden.'}
            />
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            tagSuggestions={tagCounts.map((t) => t.name)}
            autoFocusTitle={selectedNote.id === newNoteId}
            onSave={saveNote}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Wähle eine Notiz aus oder lege eine neue an.
          </div>
        )}
      </main>
    </div>
  );
}

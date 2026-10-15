import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useNotes } from '../../hooks/useNotes';
import { useToast } from '../../hooks/useToast';
import { isCreateRequest } from '../../utils/appEvents';
import { filterNotes, sortByUpdated } from '../../utils/filterNotes';
import { paths } from '../../utils/paths';
import { countTags } from '../../utils/tags';
import { NoteIcon, PlusIcon } from '../icons';
import Button from '../ui/Button';
import Kbd, { modKey } from '../ui/Kbd';
import Skeleton from '../ui/Skeleton';
import NoteEditor from './NoteEditor';
import NoteList from './NoteList';
import SearchBar from './SearchBar';
import TagFilter from './TagFilter';

export default function NotesPage() {
  const { projectId: projectParam, noteId } = useParams();
  const projectId = Number(projectParam);
  const { notes, status, reload, createNote, saveNote, deleteNote, createTaskFromNote, deleteTask } = useNotes(projectId);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const selectedId = noteId ? Number(noteId) : null;
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newNoteId, setNewNoteId] = useState<number | null>(null);

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

  async function handleCreate(title = '') {
    try {
      const note = await createNote(title);
      setQuery('');
      setSelectedTags([]);
      navigate(paths.notes(projectId, note.id), { replace: true });
      setNewNoteId(note.id);
    } catch {
      toast({ message: 'Die Notiz konnte nicht angelegt werden.', tone: 'error' });
    }
  }

  // "Neue Notiz" from the command palette arrives as navigation state; handle it once the notes are loaded.
  const handledRequest = useRef<unknown>(null);
  useEffect(() => {
    if (status !== 'ready' || !isCreateRequest(location.state) || location.state.create !== 'note') return;
    if (handledRequest.current === location.state) return;
    handledRequest.current = location.state;
    void handleCreate(location.state.title);
  });

  async function handleDelete(id: number) {
    await deleteNote(id);
    navigate(paths.notes(projectId), { replace: true });
    toast({ message: 'Notiz gelöscht.' });
  }

  function toggleTag(tag: string) {
    setSelectedTags(activeTags.includes(tag) ? activeTags.filter((t) => t !== tag) : [...activeTags, tag]);
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-surface">
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex items-center justify-between">
            <h1 className="text-sm font-semibold text-fg">Notizen</h1>
            <Button variant="primary" size="sm" onClick={() => void handleCreate()}>
              <PlusIcon className="size-3.5" />
              Neue Notiz
            </Button>
          </div>
          <SearchBar value={query} onChange={setQuery} />
          <TagFilter tags={tagCounts} selected={activeTags} onToggle={toggleTag} onClear={() => setSelectedTags([])} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {status === 'loading' && (
            <div className="space-y-4 p-4" aria-label="Lade Notizen …">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                </div>
              ))}
            </div>
          )}
          {status === 'error' && (
            <div className="px-4 py-6 text-center text-sm text-danger-text">
              <p>Die Notizen konnten nicht geladen werden.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => void reload()}>
                Erneut versuchen
              </Button>
            </div>
          )}
          {status === 'ready' && (
            <NoteList
              notes={visibleNotes}
              selectedId={selectedId}
              onSelect={(id) => navigate(paths.notes(projectId, id))}
              emptyMessage={notes.length === 0 ? 'Noch keine Notizen vorhanden.' : 'Keine Notizen gefunden.'}
            />
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 bg-surface">
        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            tagSuggestions={tagCounts.map((t) => t.name)}
            autoFocusTitle={selectedNote.id === newNoteId}
            onSave={saveNote}
            onDelete={handleDelete}
            onCreateTask={createTaskFromNote}
            onDeleteTask={deleteTask}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-surface-muted text-fg-subtle ring-1 ring-line">
              <NoteIcon className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-fg">Keine Notiz ausgewählt</p>
              <p className="mt-1 text-sm text-fg-subtle">Wähle links eine Notiz aus oder lege eine neue an.</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="sm" onClick={() => void handleCreate()}>
                <PlusIcon className="size-3.5" />
                Neue Notiz
              </Button>
              <span className="flex items-center gap-1 text-xs text-fg-subtle">
                oder <Kbd>{modKey}</Kbd>
                <Kbd>K</Kbd>
              </span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

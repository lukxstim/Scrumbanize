import { useDeferredValue, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useFolders } from '../../hooks/useFolders';
import { useNotes } from '../../hooks/useNotes';
import { useProjects } from '../../hooks/useProjects';
import { useToast } from '../../hooks/useToast';
import type { Project } from '../../types/project';
import { trashApi } from '../../utils/api';
import { filterNotes, sortByUpdated } from '../../utils/filterNotes';
import { allNotesPath, paths, TAG_PARAM } from '../../utils/paths';
import { can } from '../../utils/permissions';
import { colorDot } from '../../utils/projects';
import { countTags } from '../../utils/tags';
import { NoteIcon } from '../icons';
import NoteEditor from '../notes/NoteEditor';
import NoteList from '../notes/NoteList';
import SearchBar from '../notes/SearchBar';
import { NotebookGlyph } from '../projects/NotebookSymbol';
import Button from '../ui/Button';
import Skeleton from '../ui/Skeleton';

/** The project or notebook a note belongs to, as a small label. */
export function NotePlace({ project }: { project: Project | undefined }) {
  if (!project) return null;
  return (
    <span className="flex max-w-40 min-w-0 items-center gap-1 rounded bg-surface-muted px-1.5 py-0.5 text-[11px] text-fg-muted">
      {project.kind === 'notebook' ? (
        <NotebookGlyph icon={project.icon ?? 'book'} className="size-3 shrink-0" />
      ) : (
        <span className={`size-1.5 shrink-0 rounded-full ${colorDot(project.color)}`} aria-hidden="true" />
      )}
      <span className="truncate">{project.name}</span>
    </span>
  );
}

/**
 * /wissen, the start of Wissen (US-22): the notes of every notebook the user can see in one list, filtered by text and
 * by tags (`?tag=`, from the sidebar or the command palette). A note is edited right here, with the rights its notebook
 * gives; new notes are made in a notebook. Notes of projects stay with their project.
 */
export default function AllNotesPage() {
  const { noteId } = useParams();
  const selectedId = noteId ? Number(noteId) : null;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { projects } = useProjects();
  const { notes, status, reload, remoteEdits, updateAttachments, saveNote, moveNote, deleteNote, createTaskFromNote, discardTask } = useNotes(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const tagCounts = useMemo(() => countTags(notes), [notes]);
  // Tags from the address that no note (the user can see) carries are left out, like a tag that is no longer used.
  const requestedTags = searchParams.getAll(TAG_PARAM);
  const activeTags = useMemo(
    () => requestedTags.filter((tag) => tagCounts.some((t) => t.name === tag)),
    // The address's tags as one value, so a new array with the same tags does not count as a change.
    [requestedTags.join('\n'), tagCounts],
  );
  const visibleNotes = useMemo(
    () => filterNotes(sortByUpdated(notes), deferredQuery, activeTags),
    [notes, deferredQuery, activeTags],
  );
  const projectOf = (projectId: number) => projects.find((p) => p.id === projectId);
  const selectedNote = notes.find((note) => note.id === selectedId);
  const selectedProject = selectedNote && projectOf(selectedNote.projectId);
  // Viewers of the note's project read only (US-21).
  const canEdit = can(selectedProject?.role, 'edit');
  const { folders } = useFolders(selectedNote?.projectId);

  // The tag filter lives in the address, so it survives opening a note and can be linked to.
  function removeTag(tag: string) {
    navigate(allNotesPath(selectedId ?? undefined, activeTags.filter((t) => t !== tag)), { replace: true });
  }

  // Deleting moves the note to the trash of its project right away; the toast can take it back.
  async function handleDelete(id: number) {
    await deleteNote(id);
    navigate(allNotesPath(undefined, activeTags), { replace: true });
    toast({
      message: 'Notiz in den Papierkorb verschoben.',
      action: {
        label: 'Rückgängig',
        onClick: async () => {
          try {
            await trashApi.restore('note', id);
            await reload();
            navigate(allNotesPath(id, activeTags));
          } catch {
            toast({ message: 'Die Notiz konnte nicht wiederhergestellt werden.', tone: 'error' });
          }
        },
      },
    });
  }

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r border-line bg-surface xl:w-80">
        <div className="space-y-3 border-b border-line p-4">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-fg">Alle Notizen</h1>
            {status === 'ready' && (
              <span className="ml-auto text-xs text-fg-subtle tabular-nums">
                {visibleNotes.length === notes.length ? notes.length : `${visibleNotes.length} von ${notes.length}`}
              </span>
            )}
          </div>
          <SearchBar value={query} onChange={setQuery} placeholder="Notizen durchsuchen" />
          {activeTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-fg-subtle">
              Mit Tag
              {activeTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => removeTag(tag)}
                  title="Filter aufheben"
                  className="flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-white transition-opacity hover:opacity-85"
                >
                  {tag}
                  <span aria-hidden="true">×</span>
                  <span className="sr-only">entfernen</span>
                </button>
              ))}
            </div>
          )}
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
              onSelect={(id) => navigate(allNotesPath(id, activeTags))}
              emptyMessage={notes.length === 0 ? 'Noch keine Notizen in deinen Notizbüchern.' : 'Keine Notizen gefunden.'}
              placeOf={(note) => <NotePlace project={projectOf(note.projectId)} />}
            />
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col bg-surface">
        {selectedNote ? (
          <>
            {/* Where the note lives, and the way there (with its folders, templates and graph). */}
            <div className="flex items-center gap-2 border-b border-line px-6 py-1.5 text-xs text-fg-subtle">
              <span>Aus</span>
              <NotePlace project={selectedProject} />
              <Link to={paths.notes(selectedNote.projectId, selectedNote.id)} className="ml-auto text-accent-text hover:underline">
                {selectedProject?.kind === 'notebook' ? 'Im Notizbuch öffnen' : 'Im Projekt öffnen'}
              </Link>
            </div>
            <div className="min-h-0 flex-1">
              <NoteEditor
                key={selectedNote.id}
                note={selectedNote}
                remoteEdit={remoteEdits[selectedNote.id]}
                tagSuggestions={tagCounts.map((t) => t.name)}
                autoFocusTitle={false}
                onSave={saveNote}
                onDelete={handleDelete}
                onCreateTask={createTaskFromNote}
                onDiscardTask={discardTask}
                onUpdateAttachments={updateAttachments}
                readOnly={!canEdit}
                folders={folders}
                onMove={(folderId) => moveNote(selectedNote.id, folderId)}
              />
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-surface-muted text-fg-subtle ring-1 ring-line">
              <NoteIcon className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-fg">Keine Notiz ausgewählt</p>
              <p className="mt-1 max-w-xs text-sm text-fg-subtle">
                Hier stehen die Notizen all deiner Notizbücher. Neue Notizen legst du in einem Notizbuch an.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

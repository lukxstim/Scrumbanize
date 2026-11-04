import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { useGoneNotice } from '../../hooks/useCollaboration';
import { useFolders } from '../../hooks/useFolders';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useNotes } from '../../hooks/useNotes';
import { useNotesView } from '../../hooks/useNotesView';
import { useNotebookTreeSlot } from '../knowledge/notebookTreeSlot';
import { useStoredState } from '../../hooks/useStoredState';
import { useCan } from '../../hooks/useProjectRole';
import { useProjects } from '../../hooks/useProjects';
import { useTemplates } from '../../hooks/useTemplates';
import type { Folder, Note } from '../../types/note';
import type { NoteTemplate, TemplateInput } from '../../types/template';
import { canMoveFolder, buildFolderTree, folderPath, freeFolderName } from '../../utils/folders';
import ConfirmDialog from '../ConfirmDialog';
import { noteFromTemplate } from '../../utils/templates';
import Menu from '../Menu';
import TemplateDialog from '../templates/TemplateDialog';
import { buttonClass } from '../ui/Button';
import { useToast } from '../../hooks/useToast';
import { ApiError, trashApi } from '../../utils/api';
import { isCreateRequest } from '../../utils/appEvents';
import { filterNotes, sortByUpdated } from '../../utils/filterNotes';
import { paths } from '../../utils/paths';
import { countTags } from '../../utils/tags';
import { ChevronDownIcon, FolderPlusIcon, NoteIcon, PlusIcon } from '../icons';
import { iconButtonClass } from '../ui/styles';
import Button from '../ui/Button';
import Kbd, { modKey } from '../ui/Kbd';
import MobileBackLink from '../ui/MobileBackLink';
import Skeleton from '../ui/Skeleton';
import FolderTree, { type FolderActions } from './FolderTree';
import MoveToFolderDialog from './MoveToFolderDialog';
import NoteEditor from './NoteEditor';
import NoteList from './NoteList';
import NotesViewSwitch from './NotesViewSwitch';
import SearchBar from './SearchBar';
import { ActiveTags, TagFilterButton } from './TagFilter';
import NotebookSections from './NotebookSections';
import PageList from './PageList';
import { currentSection, isPageSort, PAGE_SORTS, pagesOf, SECTION_PARAM, sectionColor, sectionParam, type PageSort, type SectionId } from '../../utils/sections';
import { UNTITLED_NOTE } from '../../utils/taskFromNote';

const SortIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4 fill-none stroke-current stroke-[1.5]">
    <path d="M4 3v10m0 0-2-2m2 2 2-2M8.5 4h5.5M8.5 8h4M8.5 12h2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const isIdList =(value: unknown): value is number[] => Array.isArray(value) && value.every((v) => typeof v === 'number');

export default function NotesPage() {
  const { projectId: projectParam, noteId } = useParams();
  const projectId = Number(projectParam);
  // Viewers read notes only (US-21).
  const canEdit = useCan('edit');
  const { notes, status, reload, remoteEdits, updateAttachments, createNote, saveNote, moveNote, refreshFolders, deleteNote, createTaskFromNote, discardTask } =
    useNotes(projectId);
  // Folders (US-22): which are open is remembered per project in this browser.
  const { folders, createFolder, updateFolder, deleteFolder } = useFolders(projectId);
  const [expanded, setExpanded] = useStoredState<number[]>(`scrumbanize.openFolders.${projectId}`, [], isIdList);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [folderToMove, setFolderToMove] = useState<Folder | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const selectedId = noteId ? Number(noteId) : null;
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newNoteId, setNewNoteId] = useState<number | null>(null);
  const { projects } = useProjects();
  const project = projects.find((p) => p.id === projectId);
  const projectName = project?.name ?? '';
  const { noteTemplates, reload: reloadTemplates } = useTemplates(projectId);
  const [templateDraft, setTemplateDraft] = useState<TemplateInput | null>(null);
  // The tree view (US-34) puts the notes under their notebook in the sidebar; phones keep the list of US-25.
  const [notesView] = useNotesView();
  const slot = useNotebookTreeSlot();
  const isMobile = useIsMobile();
  const inTree = notesView.layout === 'tree' && !isMobile;

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
  useGoneNotice(projectId, 'note', selectedId);
  // While searching or filtering by tag, a flat list of the matches; otherwise the folder tree.
  const filtering = deferredQuery.trim() !== '' || activeTags.length > 0;
  const tree = useMemo(() => buildFolderTree(folders, visibleNotes), [folders, visibleNotes]);

  const openFolders = (ids: number[]) => {
    const missing = ids.filter((id) => !expanded.includes(id));
    if (missing.length > 0) setExpanded([...expanded, ...missing]);
  };
  // The selected note's folders open, e.g. when it was picked in the command palette.
  const selectedFolder = selectedNote?.folderId ?? null;
  const foldersLoaded = folders.length > 0;
  useEffect(() => {
    if (selectedFolder !== null && foldersLoaded) openFolders(folderPath(folders, selectedFolder).map((f) => f.id));
    // Only when another note (or its folder) is selected; closing a folder afterwards stays possible.
  }, [selectedFolder, foldersLoaded]);

  async function handleCreate(title = '', template?: NoteTemplate, folderId: number | null = null) {
    try {
      const filled = template ? noteFromTemplate(template, { now: new Date(), projectName }) : undefined;
      const note = await createNote(title || filled?.title || '', filled?.content, filled?.tags, folderId);
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
    if (status !== 'ready' || !canEdit || !isCreateRequest(location.state) || location.state.create !== 'note') return;
    if (handledRequest.current === location.state) return;
    const template = noteTemplates.find((t) => t.id === location.state.templateId);
    // A request for a template waits until the templates are loaded.
    if (location.state.templateId !== undefined && !template) return;
    handledRequest.current = location.state;
    void handleCreate(location.state.title, template);
  });

  // Deleting moves the note to the trash right away; the toast can take it back.
  async function handleDelete(id: number) {
    await deleteNote(id);
    navigate(paths.notes(projectId), { replace: true });
    toast({
      message: 'Notiz in den Papierkorb verschoben.',
      action: {
        label: 'Rückgängig',
        onClick: async () => {
          try {
            await trashApi.restore('note', id);
            await reload();
            navigate(paths.notes(projectId, id));
          } catch {
            toast({ message: 'Die Notiz konnte nicht wiederhergestellt werden.', tone: 'error' });
          }
        },
      },
    });
  }

  const failed = (error: unknown, fallback: string) =>
    toast({
      message:
        error instanceof ApiError && error.code === 'name_taken'
          ? 'Hier gibt es schon einen Ordner mit diesem Namen.'
          : error instanceof ApiError && error.code === 'too_deep'
            ? 'Ordner gehen höchstens fünf Ebenen tief.'
            : fallback,
      tone: 'error',
    });

  const folderActions: FolderActions = {
    createNoteIn: (folderId) => {
      openFolders([folderId]);
      void handleCreate('', undefined, folderId);
    },
    createFolder: async (parentId) => {
      try {
        const folder = await createFolder(freeFolderName(folders, parentId), parentId);
        if (parentId !== null) openFolders([parentId]);
        setRenamingId(folder.id);
      } catch (error) {
        failed(error, 'Der Ordner konnte nicht angelegt werden.');
      }
    },
    renameFolder: async (id, name) => {
      try {
        await updateFolder(id, { name });
      } catch (error) {
        failed(error, 'Der Ordner konnte nicht umbenannt werden.');
      }
    },
    moveFolderRequest: setFolderToMove,
    deleteFolder: setFolderToDelete,
    dropNote: async (noteId, folderId) => {
      try {
        await moveNote(noteId, folderId);
        if (folderId !== null) openFolders([folderId]);
      } catch {
        toast({ message: 'Die Notiz konnte nicht verschoben werden.', tone: 'error' });
      }
    },
    dropFolder: async (folderId, parentId) => {
      try {
        await updateFolder(folderId, { parentId });
        if (parentId !== null) openFolders([parentId]);
      } catch (error) {
        failed(error, 'Der Ordner konnte nicht verschoben werden.');
      }
    },
  };

  async function confirmDeleteFolder(folder: Folder) {
    setFolderToDelete(null);
    try {
      await deleteFolder(folder.id);
      await refreshFolders();
      toast({ message: `Ordner „${folder.name}“ gelöscht – sein Inhalt liegt jetzt eine Ebene höher.` });
    } catch {
      toast({ message: 'Der Ordner konnte nicht gelöscht werden.', tone: 'error' });
    }
  }

  function toggleTag(tag: string) {
    setSelectedTags(activeTags.includes(tag) ? activeTags.filter((t) => t !== tag) : [...activeTags, tag]);
  }

  // The notebook view (US-34): the open page's section, or the one chosen while no page is open.
  const [searchParams] = useSearchParams();
  const [pageSort, setPageSort] = useStoredState<PageSort>('scrumbanize.pageSort', 'updated', isPageSort);
  const section = currentSection(searchParams.get(SECTION_PARAM), selectedNote, folders, notes);
  const sectionName = section === null ? 'Ohne Abschnitt' : (folders.find((f) => f.id === section)?.name ?? '');
  const pages = useMemo(() => pagesOf(filterNotes(notes, '', activeTags), section, pageSort), [notes, activeTags, section, pageSort]);
  const sectionPath = (s: SectionId) => `${paths.notes(projectId)}?${SECTION_PARAM}=${sectionParam(s)}`;

  // Like OneNote, choosing a section opens its first page.
  function selectSection(s: SectionId) {
    const first = pagesOf(notes, s, pageSort)[0];
    navigate(first ? paths.notes(projectId, first.id) : sectionPath(s));
  }

  async function createSection(parentId: number | null) {
    try {
      const folder = await createFolder(freeFolderName(folders, parentId, 'Neuer Abschnitt'), parentId);
      navigate(sectionPath(folder.id));
      setRenamingId(folder.id);
    } catch (error) {
      failed(error, 'Der Abschnitt konnte nicht angelegt werden.');
    }
  }

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    // A short hold, so a swipe still scrolls the list (US-25).
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );
  const [draggedPage, setDraggedPage] = useState<Note | null>(null);
  const [dropTarget, setDropTarget] = useState<SectionId | undefined>(undefined);
  const sectionOf = (over: DragOverEvent['over']) => over?.data.current?.folderId as SectionId | undefined;
  const onDragStart = ({ active }: DragStartEvent) => setDraggedPage(notes.find((n) => n.id === active.data.current?.noteId) ?? null);
  const onDragOver = ({ over }: DragOverEvent) => setDropTarget(sectionOf(over));
  function endDrag() {
    setDraggedPage(null);
    setDropTarget(undefined);
  }
  function onDragEnd({ over }: DragEndEvent) {
    const page = draggedPage;
    const target = sectionOf(over);
    endDrag();
    if (page && target !== undefined && target !== page.folderId) void folderActions.dropNote(page.id, target);
  }

  const newFolderButton = canEdit && (
    <button
      type="button"
      className={iconButtonClass}
      title="Neuer Ordner"
      aria-label="Neuer Ordner"
      onClick={() => void folderActions.createFolder(null)}
    >
      <FolderPlusIcon />
    </button>
  );
  // One split button: "Neue Notiz" and, joined to it, the arrow for templates. Not for viewers (US-21).
  const newNoteButton = (folderId: number | null = null, label = 'Neue Notiz') =>
    canEdit && (
    <div className="flex shrink-0 items-stretch rounded-md shadow-sm">
      <Button variant="primary" size="sm" className="rounded-r-none !shadow-none active:!scale-100" onClick={() => void handleCreate('', undefined, folderId)}>
        <PlusIcon className="size-3.5" />
        {label}
      </Button>
      <Menu
        label="Neue Notiz aus Vorlage"
        triggerClassName={buttonClass('primary', 'sm', 'w-7 !px-0 rounded-l-none border-l border-accent-fg/30 !shadow-none active:!scale-100')}
        trigger={<ChevronDownIcon className="size-3.5" />}
        items={[
          ...noteTemplates.map((template) => ({
            label: `${template.name}${template.scope === 'global' ? '' : ' (Projekt)'}`,
            onSelect: () => void handleCreate('', template, folderId),
          })),
          {
            label: 'Neue Vorlage …',
            onSelect: () => setTemplateDraft({ kind: 'note', scope: 'project', name: '', title: '', content: '', defaults: { tags: [] } }),
          },
        ]}
      />
    </div>
  );
  const searchAndFilter = (
    <>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <SearchBar value={query} onChange={setQuery} />
        </div>
        <TagFilterButton tags={tagCounts} selected={activeTags} onToggle={toggleTag} onClear={() => setSelectedTags([])} />
      </div>
      <ActiveTags selected={activeTags} onRemove={toggleTag} />
    </>
  );

  const loadingOrError = (
    <>
      {status === 'loading' && (
        <div className="space-y-4 p-4" aria-label="Lade Notizen …">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-2/3" />
              {!inTree && <Skeleton className="h-3 w-full" />}
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
    </>
  );

  const content = (
    <>
      {loadingOrError}
      {status === 'ready' &&
        (filtering || (notes.length === 0 && folders.length === 0) ? (
          <NoteList
            notes={visibleNotes}
            selectedId={selectedId}
            onSelect={(id) => navigate(paths.notes(projectId, id))}
            emptyMessage={notes.length === 0 ? 'Noch keine Notizen vorhanden.' : 'Keine Notizen gefunden.'}
            showTags={notesView.showTags}
          />
        ) : (
          <FolderTree
            tree={tree}
            folders={folders}
            selectedId={selectedId}
            onSelect={(id) => navigate(paths.notes(projectId, id))}
            expanded={expanded}
            onToggle={(id) => setExpanded(expanded.includes(id) ? expanded.filter((e) => e !== id) : [...expanded, id])}
            renamingId={renamingId}
            onRenamingChange={setRenamingId}
            canEdit={canEdit}
            actions={folderActions}
            showTags={notesView.showTags}
          />
        ))}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1">
      {inTree ? (
        // The notebook view (US-34, like OneNote): the sections under the notebook in the sidebar, the pages of the
        // chosen one beside it. Pages are dragged onto a section to move them there.
        <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={endDrag}>
          {slot &&
            createPortal(
              <NotebookSections
                folders={folders}
                notes={notes}
                current={section}
                onSelect={selectSection}
                onCreateSection={(parentId) => void createSection(parentId)}
                canEdit={canEdit}
                actions={folderActions}
                renamingId={renamingId}
                onRenamingChange={setRenamingId}
                dropTarget={draggedPage === null ? undefined : dropTarget}
              />,
              slot,
            )}
          <aside aria-label="Seiten" className="flex w-60 shrink-0 flex-col border-r border-line bg-surface xl:w-64">
            <div className="space-y-2 border-b border-line px-3 py-3">
              <div className="flex items-center gap-2">
                <span className={`h-4 w-1 shrink-0 rounded-full ${sectionColor(section)}`} aria-hidden="true" />
                <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{sectionName}</h1>
                <NotesViewSwitch projectId={projectId} view="list" compact />
              </div>
              <div className="flex items-center gap-1">
                {newNoteButton(section, 'Seite hinzufügen')}
                <div className="ml-auto flex items-center gap-0.5">
                  {notesView.showTags && (
                    <TagFilterButton tags={tagCounts} selected={activeTags} onToggle={toggleTag} onClear={() => setSelectedTags([])} />
                  )}
                  <Menu
                    label="Seiten sortieren"
                    trigger={<SortIcon />}
                    triggerClassName={iconButtonClass}
                    items={PAGE_SORTS.map((option) => ({ label: `${option.value === pageSort ? '✓ ' : ''}${option.label}`, onSelect: () => setPageSort(option.value) }))}
                  />
                </div>
              </div>
              {notesView.showTags && <ActiveTags selected={activeTags} onRemove={toggleTag} />}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {loadingOrError}
              {status === 'ready' && (
                <PageList
                  pages={pages}
                  selectedId={selectedId}
                  onSelect={(id) => navigate(paths.notes(projectId, id))}
                  canEdit={canEdit}
                  showTags={notesView.showTags}
                  empty={
                    <p className="px-4 py-8 text-center text-sm text-fg-subtle">
                      {activeTags.length > 0 ? 'Keine Seite mit diesen Tags in diesem Abschnitt.' : 'Noch keine Seiten in diesem Abschnitt.'}
                    </p>
                  }
                />
              )}
            </div>
          </aside>
          <DragOverlay dropAnimation={null}>
            {draggedPage && (
              <div className="flex max-w-64 cursor-grabbing items-center gap-1.5 rounded-md border border-accent-line bg-surface px-2.5 py-1.5 text-sm font-medium text-fg shadow-popover">
                <NoteIcon className="size-3.5 shrink-0 text-fg-subtle" />
                <span className="truncate">{draggedPage.title || UNTITLED_NOTE}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        // Phones (US-25) show the list or the open note, never both; the back bar returns to the list.
        <aside className={`flex w-80 shrink-0 flex-col border-r border-line bg-surface max-md:w-full max-md:border-r-0 ${selectedId !== null ? 'max-md:hidden' : ''}`}>
          <div className="space-y-3 border-b border-line p-4">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-fg">Notizen</h1>
              {/* Icons only: title, switch and the split button share the sidebar's width. */}
              <NotesViewSwitch projectId={projectId} view="list" compact />
              <div className="ml-auto" />
              {newFolderButton}
              {newNoteButton()}
            </div>
            {searchAndFilter}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
        </aside>
      )}

      <main className={`min-w-0 flex-1 bg-surface max-md:flex max-md:flex-col ${selectedId === null ? 'max-md:hidden' : ''}`}>
        <MobileBackLink to={paths.notes(projectId)} label="Notizen" />
        {selectedNote ? (
          <div className="h-full max-md:h-auto max-md:min-h-0 max-md:flex-1">
            <NoteEditor
              key={selectedNote.id}
              note={selectedNote}
              remoteEdit={remoteEdits[selectedNote.id]}
              tagSuggestions={tagCounts.map((t) => t.name)}
              autoFocusTitle={selectedNote.id === newNoteId}
              onSave={saveNote}
              onDelete={handleDelete}
              onCreateTask={createTaskFromNote}
              onDiscardTask={discardTask}
              onUpdateAttachments={updateAttachments}
              readOnly={!canEdit}
              folders={folders}
              onMove={async (folderId) => {
                await moveNote(selectedNote.id, folderId);
                if (folderId !== null) openFolders([folderId]);
              }}
              onSaveAsTemplate={(input) =>
                setTemplateDraft({ kind: 'note', scope: 'project', name: input.title || 'Neue Vorlage', title: input.title, content: input.content, defaults: { tags: input.tags } })
              }
            />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-surface-muted text-fg-subtle ring-1 ring-line">
              <NoteIcon className="size-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-fg">Keine Notiz ausgewählt</p>
              <p className="mt-1 text-sm text-fg-subtle">
                {canEdit ? 'Wähle links eine Notiz aus oder lege eine neue an.' : 'Wähle links eine Notiz aus.'}
              </p>
            </div>
            {canEdit && (
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
            )}
          </div>
        )}
      </main>
      {folderToDelete && (
        <ConfirmDialog
          open
          title={`Ordner „${folderToDelete.name}“ löschen?`}
          message="Keine Notiz geht verloren: Notizen und Unterordner darin wandern eine Ebene nach oben."
          confirmLabel="Ordner löschen"
          onConfirm={() => void confirmDeleteFolder(folderToDelete)}
          onCancel={() => setFolderToDelete(null)}
        />
      )}
      {folderToMove && (
        <MoveToFolderDialog
          title={`Ordner „${folderToMove.name}“ verschieben`}
          folders={folders}
          current={folderToMove.parentId}
          isDisabled={(target) => !canMoveFolder(folders, folderToMove.id, target)}
          onMove={async (parentId) => {
            await updateFolder(folderToMove.id, { parentId });
            if (parentId !== null) openFolders([parentId]);
            setFolderToMove(null);
          }}
          onClose={() => setFolderToMove(null)}
        />
      )}
      {templateDraft && (
        <TemplateDialog
          projectId={projectId}
          template={templateDraft}
          board={{ labels: [], columns: [], lanes: [], tags: tagCounts.map((t) => t.name) }}
          onSaved={(template) => {
            setTemplateDraft(null);
            void reloadTemplates();
            toast({ message: `Vorlage „${template.name}“ gespeichert.` });
          }}
          onClose={() => setTemplateDraft(null)}
        />
      )}
    </div>
  );
}

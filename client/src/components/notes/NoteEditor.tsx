import { useDroppable } from '@dnd-kit/core';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useNotesView } from '../../hooks/useNotesView';
import { useProjects } from '../../hooks/useProjects';
import { folderPath } from '../../utils/folders';
import { can } from '../../utils/permissions';
import { getLastProjectId, ofKind } from '../../utils/projects';
import Backlinks from './Backlinks';
import MoveToFolderDialog from './MoveToFolderDialog';
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave';
import { useShowItem, useSoftLock } from '../../hooks/useCollaboration';
import type { RemoteEdit } from '../../hooks/useNotes';
import { useToast } from '../../hooks/useToast';
import type { Attachment } from '../../types/attachment';
import type { Folder, Note, NoteInput } from '../../types/note';
import type { RealtimeActor } from '../../types/realtime';
import type { Task } from '../../types/task';
import { buildTaskDraft, UNTITLED_NOTE, type TaskDraft } from '../../utils/taskFromNote';
import { ApiError, exportUrls, startDownload, type ExportFormat } from '../../utils/api';
import { BoardIcon, DownloadIcon, FolderIcon, MindmapIcon } from '../icons';
import Menu from '../Menu';
import AttachmentsPanel from '../attachments/AttachmentsPanel';
import MarkdownEditor from '../editor/MarkdownEditor';
import type { InsertLink, LinkDropTarget } from '../editor/linkDrop';
import LockNotice, { isTextField } from '../LockNotice';
import Button, { buttonClass } from '../ui/Button';
import ConvertToTaskDialog from './ConvertToTaskDialog';
import LinkedTasks from './LinkedTasks';
import TagInput from './TagInput';

// Loaded when first opened, with its layout code.
const MindmapDialog = lazy(() => import('../mindmap/MindmapDialog'));

interface NoteEditorProps {
  /** The editor keeps its own draft; remount it (via `key`) to edit another note. */
  note: Note;
  tagSuggestions: string[];
  autoFocusTitle: boolean;
  /** Saves based on the version `baseUpdatedAt`; fails with 409 if the note changed elsewhere since (US-24). */
  onSave: (id: number, input: NoteInput, baseUpdatedAt: string) => Promise<Note>;
  onDelete: (id: number) => Promise<void>;
  onCreateTask: (noteId: number, draft: TaskDraft, projectId: number) => Promise<Task>;
  /** Takes back a task just created from this note. */
  onDiscardTask: (taskId: number) => Promise<void>;
  onUpdateAttachments: (noteId: number, update: (attachments: Attachment[]) => Attachment[]) => void;
  /** Opens the template editor with this note as starting point. */
  onSaveAsTemplate?: (input: NoteInput) => void;
  /** Viewers (US-21): read, export and view as mindmap; no changes. */
  readOnly?: boolean;
  /** The project's folders (US-22), for showing and changing where the note is. */
  folders?: Folder[];
  onMove?: (folderId: number | null) => Promise<void>;
  /** Someone else changed this note's text (US-24); `note` then holds their version. */
  remoteEdit?: RemoteEdit;
}

const sameInput = (a: NoteInput, b: NoteInput) =>
  a.title === b.title && a.content === b.content && a.tags.length === b.tags.length && a.tags.every((tag, i) => tag === b.tags[i]);

export default function NoteEditor({
  note,
  tagSuggestions,
  autoFocusTitle,
  onSave,
  onDelete,
  onCreateTask,
  onDiscardTask,
  onUpdateAttachments,
  onSaveAsTemplate,
  readOnly = false,
  folders = [],
  onMove,
  remoteEdit,
}: NoteEditorProps) {
  // Tasks may go into any project the user may add tasks to (US-22): the note's own, or the last one used.
  const { projects } = useProjects();
  const taskProjects = ofKind(projects, 'project').filter((p) => can(p.role, 'edit'));
  const defaultTaskProject =
    taskProjects.find((p) => p.id === note.projectId) ?? taskProjects.find((p) => p.id === getLastProjectId()) ?? taskProjects[0];
  const [moving, setMoving] = useState(false);
  const path = folderPath(folders, note.folderId);
  const sections = useNotesView()[0].layout === 'tree';
  const [draft, setDraft] = useState<NoteInput>({ title: note.title, content: note.content, tags: note.tags });
  const [conversion, setConversion] = useState<{ draft: TaskDraft; fromSelection: boolean } | null>(null);
  const toast = useToast();
  // The version the draft builds on (US-24): a save based on an older one than the server's is refused (409).
  const base = useRef(note.updatedAt);
  const { status, schedule, flush, cancel } = useAutosave<NoteInput>(async (input) => {
    try {
      base.current = (await onSave(note.id, input, base.current)).updatedAt;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setConflict({ by: null, latest: error.details.note as Note });
      throw error;
    }
  });
  // Others see who has the note open; while someone else edits it, it is read-only here.
  useShowItem(note.projectId, { type: 'note', id: note.id });
  const lock = useSoftLock(note.projectId, { type: 'note', id: note.id }, !readOnly);
  const lockedBy = readOnly ? null : lock.holder;
  const editable = !readOnly && !lockedBy;
  // Markdown of what is selected in the editor, for "Auswahl in Task umwandeln".
  const [selection, setSelection] = useState('');
  const [mindmapOpen, setMindmapOpen] = useState(false);

  // A page dragged from the notebook tree onto the text becomes a link to it (US-34); NotesPage handles the drop.
  const insertLink = useRef<InsertLink | null>(null);
  const linkDrop: LinkDropTarget = { noteId: note.id, insert: (link, at) => insertLink.current?.(link, at) };
  const { setNodeRef: setLinkDropRef, isOver, active } = useDroppable({
    id: `link-into:${note.id}`,
    data: { linkInto: linkDrop },
    disabled: !editable,
  });
  const linkDropActive = isOver && typeof active?.data.current?.noteId === 'number' && active.data.current.noteId !== note.id;

  // A change from elsewhere (US-24) is taken over right away while nobody works in this editor; otherwise the user
  // decides, also when a save was refused (409) because of it. The rich text editor starts over (new key) to show the
  // new text.
  const rootRef = useRef<HTMLDivElement>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [conflict, setConflict] = useState<{ by: RealtimeActor | null; latest?: Note } | null>(null);
  const seenEdit = useRef(remoteEdit?.seq);
  /** The newest version known: from the list (live updates) or from a refused save. */
  const latest = () => (conflict?.latest && conflict.latest.updatedAt > note.updatedAt ? conflict.latest : note);

  function takeRemote() {
    const source = latest();
    cancel();
    base.current = source.updatedAt;
    setDraft({ title: source.title, content: source.content, tags: source.tags });
    setEditorKey((key) => key + 1);
    setConflict(null);
  }

  function keepMine() {
    base.current = latest().updatedAt;
    setConflict(null);
    schedule(draft);
    void flush();
  }

  // Someone else took over editing: what was typed here is saved first, then the editor follows their changes.
  useEffect(() => {
    if (lockedBy) void flush();
  }, [lockedBy, flush]);

  useEffect(() => {
    if (!remoteEdit || remoteEdit.seq === seenEdit.current) return;
    seenEdit.current = remoteEdit.seq;
    if (sameInput(draft, { title: note.title, content: note.content, tags: note.tags })) {
      base.current = note.updatedAt;
      setConflict(null);
      return;
    }
    const working = editable && (status !== 'saved' || rootRef.current?.contains(document.activeElement));
    if (working) setConflict({ by: remoteEdit.by });
    else takeRemote();
    // Only a new change from elsewhere decides; draft and status are read as they are at that moment.
  }, [remoteEdit]);

  function change(patch: Partial<NoteInput>) {
    lock.touch();
    const next = { ...draft, ...patch };
    setDraft(next);
    schedule(next);
  }

  // No confirmation: the note goes to the trash, and the toast offers "Rückgängig".
  async function moveToTrash() {
    cancel();
    await flush(); // let a save that is already running finish before the note is gone
    try {
      await onDelete(note.id);
    } catch {
      toast({ message: 'Die Notiz konnte nicht gelöscht werden. Bitte versuche es erneut.', tone: 'error' });
    }
  }

  // Saves pending edits first, so the file has what the editor shows.
  async function download(format: ExportFormat) {
    await flush();
    startDownload(exportUrls.note(note.id, format));
  }

  function startConversion() {
    setConversion({ draft: buildTaskDraft(draft, selection), fromSelection: selection !== '' });
    void flush();
  }

  async function createTask(taskDraft: TaskDraft, projectId: number) {
    const task = await onCreateTask(note.id, taskDraft, projectId);
    setConversion(null);
    const elsewhere = projectId === note.projectId ? '' : ` in „${projects.find((p) => p.id === projectId)?.name ?? ''}“`;
    toast({
      message: `Task #${task.id} „${task.title}“${elsewhere} angelegt.`,
      action: {
        label: 'Rückgängig',
        onClick: async () => {
          try {
            await onDiscardTask(task.id);
          } catch {
            toast({ message: 'Rückgängig machen fehlgeschlagen.', tone: 'error' });
          }
        },
      },
    });
  }


  return (
    <div
      ref={rootRef}
      className="flex h-full flex-col"
      // The lock starts when a field gets the focus and ends a moment after the focus left the note (US-24).
      onFocus={(event) => {
        if (isTextField(event.target)) lock.touch();
      }}
      onBlur={() => lock.blur(() => !!rootRef.current?.contains(document.activeElement), flush)}
      onKeyDown={(event) => {
        if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void flush();
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-6 py-2.5">
        {!readOnly && defaultTaskProject && (
          <Button
            size="sm"
            // Keep the text selection (and the editor's focus) when the button is clicked.
            onMouseDown={(event) => event.preventDefault()}
            onClick={startConversion}
            className={selection ? 'border-accent-line text-accent-text' : ''}
          >
            <BoardIcon className="size-3.5" />
            {selection ? 'Auswahl in Task umwandeln' : 'In Task umwandeln'}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setMindmapOpen(true)} title="Überschriften und Listen der Notiz als Mindmap">
          <MindmapIcon className="size-3.5" />
          Als Mindmap
        </Button>
        <Menu
          label="Notiz exportieren"
          align="left"
          triggerClassName={buttonClass('ghost', 'sm')}
          trigger={
            <>
              <DownloadIcon className="size-3.5" />
              Exportieren
            </>
          }
          items={[
            { label: 'Als Markdown (.md)', onSelect: () => void download('md') },
            { label: 'Als HTML (druckbar)', onSelect: () => void download('html') },
            ...(onSaveAsTemplate && !readOnly ? [{ label: 'Als Vorlage speichern …', onSelect: () => onSaveAsTemplate(draft) }] : []),
          ]}
        />
        {/* Where the note is (US-22): its folder, a section in the notebook view (US-34); a click moves it. */}
        {(path.length > 0 || (onMove && !readOnly && folders.length > 0)) && (
          <Button
            size="sm"
            variant="ghost"
            className="min-w-0"
            disabled={readOnly || !onMove}
            onClick={() => setMoving(true)}
            title={readOnly ? undefined : `In einen anderen ${sections ? 'Abschnitt' : 'Ordner'} verschieben`}
          >
            <FolderIcon className="size-3.5 shrink-0" />
            <span className="truncate">{path.length > 0 ? path.map((f) => f.name).join(' / ') : sections ? 'Ohne Abschnitt' : 'Kein Ordner'}</span>
          </Button>
        )}
        <div className="flex-1" />
        {readOnly ? (
          <span className="text-xs text-fg-subtle">Nur lesen</span>
        ) : (
          <>
            <SaveIndicator status={status} conflict={conflict !== null} onRetry={() => void flush()} />
            <Button variant="danger-ghost" size="sm" onClick={() => void moveToTrash()}>
              Löschen
            </Button>
          </>
        )}
      </div>

      {lockedBy && <LockNotice holder={lockedBy.user.name} what="die Notiz" onTakeOver={() => void lock.takeOver()} />}

      {conflict && (
        <div role="status" className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-muted px-6 py-2 text-sm text-fg-muted">
          <span className="min-w-0 flex-1">
            {conflict.by
              ? `${conflict.by.name} hat diese Notiz gerade geändert.`
              : conflict.latest
                ? 'Diese Notiz wurde inzwischen anderswo geändert – deine Änderungen sind noch nicht gespeichert.'
                : 'Diese Notiz wurde gerade in einem anderen Fenster geändert.'}
          </span>
          <Button size="sm" onClick={takeRemote}>
            Übernehmen
          </Button>
          <Button size="sm" variant="ghost" onClick={keepMine}>
            Meine Fassung behalten
          </Button>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-8 py-8">
          <input
            autoComplete="off"
            enterKeyHint="next"
            value={draft.title}
            readOnly={!editable}
            onChange={(event) => change({ title: event.target.value })}
            placeholder="Titel"
            aria-label="Titel"
            maxLength={200}
            autoFocus={autoFocusTitle}
            className="bg-transparent text-2xl font-semibold tracking-tight text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <fieldset disabled={!editable} className="min-w-0">
            <TagInput tags={draft.tags} suggestions={tagSuggestions} onChange={(tags) => change({ tags })} />
          </fieldset>
          <LinkedTasks projectId={note.projectId} tasks={note.tasks} />
          <hr className="my-1 border-line" />
          <div
            ref={setLinkDropRef}
            className={`-mx-2 rounded-lg px-2 transition-shadow ${linkDropActive ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''}`}
          >
            <MarkdownEditor
              // Also anew when someone else's lock starts or ends: the editor takes `readOnly` only when it is made.
              key={`${editorKey}-${editable}`}
              value={draft.content}
              onChange={(content) => change({ content })}
              onSelectionChange={setSelection}
              label="Inhalt"
              placeholder="Schreibe deine Notiz … ([[ verlinkt Notizen und Tasks)"
              minHeightClass="min-h-64"
              readOnly={!editable}
              links={{ projectId: note.projectId }}
              insertLinkRef={insertLink}
            />
          </div>
          <AttachmentsPanel
            owner={{ type: 'note', id: note.id }}
            attachments={note.attachments}
            onUpdate={(update) => onUpdateAttachments(note.id, update)}
            readOnly={readOnly}
          />
          <Backlinks target={{ type: 'note', id: note.id }} projectId={note.projectId} />
        </div>
      </div>


      {conversion && defaultTaskProject && (
        <ConvertToTaskDialog
          initial={conversion.draft}
          fromSelection={conversion.fromSelection}
          projects={taskProjects}
          initialProjectId={defaultTaskProject.id}
          onSubmit={createTask}
          onCancel={() => setConversion(null)}
        />
      )}
      {mindmapOpen && (
        <Suspense fallback={null}>
          <MindmapDialog title={draft.title} markdown={draft.content} onClose={() => setMindmapOpen(false)} />
        </Suspense>
      )}
      {moving && onMove && (
        <MoveToFolderDialog
          title={`„${draft.title.trim() || UNTITLED_NOTE}“ verschieben`}
          folders={folders}
          current={note.folderId}
          onMove={async (folderId) => {
            await onMove(folderId);
            setMoving(false);
          }}
          onClose={() => setMoving(false)}
        />
      )}
    </div>
  );
}

function SaveIndicator({ status, conflict, onRetry }: { status: SaveStatus; conflict: boolean; onRetry: () => void }) {
  if (conflict && status !== 'saved') {
    return <span className="px-1 text-xs text-warning-text">Nicht gespeichert</span>;
  }
  const busy = status === 'pending' || status === 'saving';
  return (
    <span aria-live="polite" className="flex items-center gap-1.5 px-1 text-xs text-fg-subtle">
      {status !== 'error' && (
        <span
          aria-hidden="true"
          className={`size-1.5 rounded-full transition-colors duration-300 ${busy ? 'animate-pulse bg-amber-400' : 'bg-emerald-500'}`}
        />
      )}
      {status === 'saved' && 'Gespeichert'}
      {busy && 'Speichert …'}
      {status === 'error' && (
        <span className="text-danger-text">
          Speichern fehlgeschlagen ·{' '}
          <button type="button" className="underline" onClick={onRetry}>
            Erneut versuchen
          </button>
        </span>
      )}
    </span>
  );
}

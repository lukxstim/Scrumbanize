import { lazy, Suspense, useState } from 'react';
import { folderPath } from '../../utils/folders';
import MoveToFolderDialog from './MoveToFolderDialog';
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave';
import { useToast } from '../../hooks/useToast';
import type { Attachment } from '../../types/attachment';
import type { Folder, Note, NoteInput } from '../../types/note';
import type { Task } from '../../types/task';
import { buildTaskDraft, UNTITLED_NOTE, type TaskDraft } from '../../utils/taskFromNote';
import { exportUrls, startDownload, type ExportFormat } from '../../utils/api';
import { BoardIcon, DownloadIcon, FolderIcon, MindmapIcon } from '../icons';
import Menu from '../Menu';
import AttachmentsPanel from '../attachments/AttachmentsPanel';
import MarkdownEditor from '../editor/MarkdownEditor';
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
  onSave: (id: number, input: NoteInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onCreateTask: (noteId: number, draft: TaskDraft) => Promise<Task>;
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
  /** False in notebooks: they have no board to put tasks on. */
  withTasks?: boolean;
}

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
  withTasks = true,
}: NoteEditorProps) {
  const [moving, setMoving] = useState(false);
  const path = folderPath(folders, note.folderId);
  const [draft, setDraft] = useState<NoteInput>({ title: note.title, content: note.content, tags: note.tags });
  const [conversion, setConversion] = useState<{ draft: TaskDraft; fromSelection: boolean } | null>(null);
  const toast = useToast();
  const { status, schedule, flush, cancel } = useAutosave<NoteInput>((input) => onSave(note.id, input));
  // Markdown of what is selected in the editor, for "Auswahl in Task umwandeln".
  const [selection, setSelection] = useState('');
  const [mindmapOpen, setMindmapOpen] = useState(false);

  function change(patch: Partial<NoteInput>) {
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

  async function createTask(taskDraft: TaskDraft) {
    const task = await onCreateTask(note.id, taskDraft);
    setConversion(null);
    toast({
      message: `Task #${task.id} „${task.title}“ angelegt.`,
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
      className="flex h-full flex-col"
      onKeyDown={(event) => {
        if (event.key === 's' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          void flush();
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-line px-6 py-2.5">
        {!readOnly && withTasks && (
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
        {/* Where the note is (US-22); a click moves it. */}
        {(path.length > 0 || (onMove && !readOnly && folders.length > 0)) && (
          <Button
            size="sm"
            variant="ghost"
            className="min-w-0"
            disabled={readOnly || !onMove}
            onClick={() => setMoving(true)}
            title={readOnly ? undefined : 'In einen anderen Ordner verschieben'}
          >
            <FolderIcon className="size-3.5 shrink-0" />
            <span className="truncate">{path.length > 0 ? path.map((f) => f.name).join(' / ') : 'Kein Ordner'}</span>
          </Button>
        )}
        <div className="flex-1" />
        {readOnly ? (
          <span className="text-xs text-fg-subtle">Nur lesen</span>
        ) : (
          <>
            <SaveIndicator status={status} onRetry={() => void flush()} />
            <Button variant="danger-ghost" size="sm" onClick={() => void moveToTrash()}>
              Löschen
            </Button>
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-8 py-8">
          <input
            value={draft.title}
            readOnly={readOnly}
            onChange={(event) => change({ title: event.target.value })}
            placeholder="Titel"
            aria-label="Titel"
            maxLength={200}
            autoFocus={autoFocusTitle}
            className="bg-transparent text-2xl font-semibold tracking-tight text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <fieldset disabled={readOnly} className="min-w-0">
            <TagInput tags={draft.tags} suggestions={tagSuggestions} onChange={(tags) => change({ tags })} />
          </fieldset>
          <LinkedTasks projectId={note.projectId} tasks={note.tasks} />
          <hr className="my-1 border-line" />
          <MarkdownEditor
            value={draft.content}
            onChange={(content) => change({ content })}
            onSelectionChange={setSelection}
            label="Inhalt"
            placeholder="Schreibe deine Notiz …"
            minHeightClass="min-h-64"
            readOnly={readOnly}
          />
          <AttachmentsPanel
            owner={{ type: 'note', id: note.id }}
            attachments={note.attachments}
            onUpdate={(update) => onUpdateAttachments(note.id, update)}
            readOnly={readOnly}
          />
        </div>
      </div>


      {conversion && (
        <ConvertToTaskDialog
          initial={conversion.draft}
          fromSelection={conversion.fromSelection}
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

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
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

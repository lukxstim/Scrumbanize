import { useRef, useState } from 'react';
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave';
import { useTextSelection } from '../../hooks/useTextSelection';
import { useToast } from '../../hooks/useToast';
import type { Note, NoteInput } from '../../types/note';
import type { Task } from '../../types/task';
import { buildTaskDraft, UNTITLED_NOTE, type TaskDraft } from '../../utils/taskFromNote';
import ConfirmDialog from '../ConfirmDialog';
import { BoardIcon } from '../icons';
import Button from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import ConvertToTaskDialog from './ConvertToTaskDialog';
import LinkedTasks from './LinkedTasks';
import MarkdownPreview from './LazyMarkdownPreview';
import TagInput from './TagInput';

interface NoteEditorProps {
  /** The editor keeps its own draft; remount it (via `key`) to edit another note. */
  note: Note;
  tagSuggestions: string[];
  autoFocusTitle: boolean;
  onSave: (id: number, input: NoteInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onCreateTask: (noteId: number, draft: TaskDraft) => Promise<Task>;
  onDeleteTask: (taskId: number) => Promise<void>;
}

export default function NoteEditor({
  note,
  tagSuggestions,
  autoFocusTitle,
  onSave,
  onDelete,
  onCreateTask,
  onDeleteTask,
}: NoteEditorProps) {
  const [draft, setDraft] = useState<NoteInput>({ title: note.title, content: note.content, tags: note.tags });
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [conversion, setConversion] = useState<{ draft: TaskDraft; fromSelection: boolean } | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const toast = useToast();
  const { status, schedule, flush, cancel } = useAutosave<NoteInput>((input) => onSave(note.id, input));
  const { selection, textareaHandlers } = useTextSelection(mode, previewRef);

  function change(patch: Partial<NoteInput>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    schedule(next);
  }

  async function confirmDelete() {
    setConfirmingDelete(false);
    cancel();
    await flush(); // let a save that is already running finish before the note is gone
    try {
      await onDelete(note.id);
    } catch {
      toast({ message: 'Die Notiz konnte nicht gelöscht werden. Bitte versuche es erneut.', tone: 'error' });
    }
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
            await onDeleteTask(task.id);
          } catch {
            toast({ message: 'Rückgängig machen fehlgeschlagen.', tone: 'error' });
          }
        },
      },
    });
  }

  const taskCount = note.tasks.length;
  const deleteMessage =
    `„${draft.title || UNTITLED_NOTE}“ wird dauerhaft gelöscht.` +
    (taskCount === 1 ? ' 1 verknüpfter Task bleibt erhalten.' : taskCount > 1 ? ` ${taskCount} verknüpfte Tasks bleiben erhalten.` : '');

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
        <SegmentedControl
          label="Ansicht"
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'edit', label: 'Bearbeiten' },
            { value: 'preview', label: 'Vorschau' },
          ]}
        />
        <Button
          size="sm"
          // Keep the text selection (and the textarea's focus) when the button is clicked.
          onMouseDown={(event) => event.preventDefault()}
          onClick={startConversion}
          className={selection ? 'border-accent-line text-accent-text' : ''}
        >
          <BoardIcon className="size-3.5" />
          {selection ? 'Auswahl in Task umwandeln' : 'In Task umwandeln'}
        </Button>
        <div className="flex-1" />
        <SaveIndicator status={status} onRetry={() => void flush()} />
        <Button variant="danger-ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
          Löschen
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-8 py-8">
          <input
            value={draft.title}
            onChange={(event) => change({ title: event.target.value })}
            placeholder="Titel"
            aria-label="Titel"
            maxLength={200}
            autoFocus={autoFocusTitle}
            className="bg-transparent text-2xl font-semibold tracking-tight text-fg placeholder:text-fg-faint focus:outline-none"
          />
          <TagInput tags={draft.tags} suggestions={tagSuggestions} onChange={(tags) => change({ tags })} />
          <LinkedTasks projectId={note.projectId} tasks={note.tasks} />
          <hr className="my-1 border-line" />
          {mode === 'edit' ? (
            <textarea
              value={draft.content}
              onChange={(event) => change({ content: event.target.value })}
              {...textareaHandlers}
              placeholder="Schreibe deine Notiz in Markdown …"
              aria-label="Inhalt"
              className="min-h-64 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-fg placeholder:text-fg-faint focus:outline-none"
            />
          ) : (
            <div ref={previewRef}>
              <MarkdownPreview content={draft.content} />
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Notiz löschen?"
        message={deleteMessage}
        confirmLabel="Löschen"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />

      {conversion && (
        <ConvertToTaskDialog
          initial={conversion.draft}
          fromSelection={conversion.fromSelection}
          onSubmit={createTask}
          onCancel={() => setConversion(null)}
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

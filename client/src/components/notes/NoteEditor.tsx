import { useState } from 'react';
import { useAutosave, type SaveStatus } from '../../hooks/useAutosave';
import type { Note, NoteInput } from '../../types/note';
import ConfirmDialog from '../ConfirmDialog';
import MarkdownPreview from './MarkdownPreview';
import TagInput from './TagInput';

interface NoteEditorProps {
  /** The editor keeps its own draft; remount it (via `key`) to edit another note. */
  note: Note;
  tagSuggestions: string[];
  autoFocusTitle: boolean;
  onSave: (id: number, input: NoteInput) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export default function NoteEditor({ note, tagSuggestions, autoFocusTitle, onSave, onDelete }: NoteEditorProps) {
  const [draft, setDraft] = useState<NoteInput>({ title: note.title, content: note.content, tags: note.tags });
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const { status, schedule, flush, cancel } = useAutosave<NoteInput>((input) => onSave(note.id, input));

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
      setDeleteFailed(true);
    }
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
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-2">
        <div className="flex rounded-md bg-slate-100 p-0.5 text-sm" role="group" aria-label="Ansicht">
          {(['edit', 'preview'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
              className={`rounded px-3 py-1 ${mode === value ? 'bg-white font-medium shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {value === 'edit' ? 'Bearbeiten' : 'Vorschau'}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <SaveIndicator status={status} onRetry={() => void flush()} />
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          className="rounded-md px-3 py-1 text-sm text-red-600 hover:bg-red-50"
        >
          Löschen
        </button>
      </div>

      {deleteFailed && (
        <p role="alert" className="bg-red-50 px-6 py-2 text-sm text-red-700">
          Die Notiz konnte nicht gelöscht werden. Bitte versuche es erneut.
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
        <input
          value={draft.title}
          onChange={(event) => change({ title: event.target.value })}
          placeholder="Titel"
          aria-label="Titel"
          maxLength={200}
          autoFocus={autoFocusTitle}
          className="bg-transparent text-2xl font-semibold placeholder:text-slate-300 focus:outline-none"
        />
        <TagInput tags={draft.tags} suggestions={tagSuggestions} onChange={(tags) => change({ tags })} />
        <hr className="border-slate-200" />
        {mode === 'edit' ? (
          <textarea
            value={draft.content}
            onChange={(event) => change({ content: event.target.value })}
            placeholder="Schreibe deine Notiz in Markdown …"
            aria-label="Inhalt"
            className="min-h-64 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed placeholder:text-slate-400 focus:outline-none"
          />
        ) : (
          <MarkdownPreview content={draft.content} />
        )}
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="Notiz löschen?"
        message={`„${draft.title || 'Unbenannte Notiz'}“ wird dauerhaft gelöscht.`}
        confirmLabel="Löschen"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <span aria-live="polite" className="text-xs text-slate-400">
      {status === 'saved' && 'Gespeichert'}
      {(status === 'pending' || status === 'saving') && 'Speichert …'}
      {status === 'error' && (
        <span className="text-red-600">
          Speichern fehlgeschlagen ·{' '}
          <button type="button" className="underline" onClick={onRetry}>
            Erneut versuchen
          </button>
        </span>
      )}
    </span>
  );
}

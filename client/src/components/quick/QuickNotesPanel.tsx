import { useCallback, useEffect, useRef, useState } from 'react';
import { useAutosave } from '../../hooks/useAutosave';
import { useRealtimeProject } from '../../hooks/useRealtime';
import type { Note } from '../../types/note';
import type { Project } from '../../types/project';
import { ApiError, notesApi, projectsApi } from '../../utils/api';
import { notifyNotesChanged, onNotesChanged } from '../../utils/appEvents';
import { fromQuickText, previewLines, QUICK_NOTEBOOK_NAME, quickCards, quickColor, quickText } from '../../utils/quickNotes';
import { PlusIcon, SearchIcon, TrashIcon } from '../icons';
import { iconButtonClass } from '../ui/styles';

interface QuickNotesPanelProps {
  onClose: () => void;
  /**
   * The Picture-in-Picture window shares this tab: its changes go out as another client, so the tab's own lists hear
   * of them (US-24), and it listens to the tab's changes instead of the live updates, which skip this tab.
   */
  inTab?: boolean;
}

/** The client id the Picture-in-Picture panel sends its changes as (see `inTab`). */
const QUICK_CLIENT = `quick-${Math.random().toString(36).slice(2, 12)}`;

const isQuickNotebook = (p: Project) => p.kind === 'notebook' && (p.name === QUICK_NOTEBOOK_NAME || p.name.startsWith(`${QUICK_NOTEBOOK_NAME} (`));

/**
 * The quick notes notebook: found by its name, or made on the first use. One lookup at a time, so two panels (or
 * React's double start in development) do not make two. If the name belongs to someone else's notebook, the next
 * free "Kurznotizen (2)" is used.
 */
let finding: Promise<number> | null = null;
function quickNotebook(): Promise<number> {
  finding ??= (async () => {
    for (let n = 1; n <= 5; n++) {
      const mine = (await projectsApi.list()).filter(isQuickNotebook).sort((a, b) => a.id - b.id)[0];
      if (mine) return mine.id;
      try {
        const name = n === 1 ? QUICK_NOTEBOOK_NAME : `${QUICK_NOTEBOOK_NAME} (${n})`;
        const created = await projectsApi.create({ name, color: 'amber', kind: 'notebook', icon: 'lightbulb' });
        notifyNotesChanged();
        return created.id;
      } catch (error) {
        if (!(error instanceof ApiError && error.code === 'name_taken')) throw error;
      }
    }
    throw new Error('No name left for the quick notes notebook');
  })().finally(() => {
    finding = null;
  });
  return finding;
}

const dayFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });
const when = (iso: string) => {
  const date = new Date(iso);
  return date.toDateString() === new Date().toDateString() ? timeFormat.format(date) : dayFormat.format(date);
};

/**
 * The quick notes (US-26), like the Windows Sticky Notes: "+ Notiz" and a search above colored cards, newest first.
 * A click on a card edits it right there; everything saves by itself into the notebook "Kurznotizen".
 */
export default function QuickNotesPanel({ onClose, inTab = false }: QuickNotesPanelProps) {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  // A new card at the top; it becomes a note with its first word, and stays at the top while it is edited.
  const [draft, setDraft] = useState<{ key: number; noteId: number | null } | null>(null);
  const [query, setQuery] = useState<string | null>(null);
  const asClient = inTab ? QUICK_CLIENT : undefined;

  const load = useCallback(async () => {
    try {
      const id = projectId ?? (await quickNotebook());
      setProjectId(id);
      setNotes(await notesApi.list(id));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);
  useRealtimeProject(projectId ?? undefined, () => void load());
  useEffect(() => (inTab ? onNotesChanged(() => void load()) : undefined), [inTab, load]);

  const upsert = (note: Note) => setNotes((current) => [note, ...(current ?? []).filter((n) => n.id !== note.id)]);
  const remove = async (id: number) => {
    setNotes((current) => (current ?? []).filter((n) => n.id !== id));
    if (draft?.noteId === id) setDraft(null);
    setEditing(null);
    await notesApi.remove(id, asClient).catch(() => void load());
  };

  const cards = notes ? quickCards(notes, query ?? '').filter((n) => n.id !== draft?.noteId) : [];

  return (
    <div className="flex h-screen flex-col bg-canvas text-fg">
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <span aria-hidden="true" className="size-3.5 rounded-sm bg-gradient-to-br from-amber-300 to-amber-500" />
        <h1 className="flex-1 text-sm font-medium">Kurznotizen</h1>
        <button type="button" onClick={onClose} aria-label="Kurznotizen schließen" title="Schließen" className={`${iconButtonClass} !size-7 text-base`}>
          ×
        </button>
      </div>

      <div className="px-3 pb-2">
        <button
          type="button"
          disabled={projectId === null}
          onClick={() => {
            setEditing(null);
            setDraft({ key: Date.now(), noteId: null });
          }}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-line bg-surface text-sm font-medium text-fg shadow-sm transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
        >
          <PlusIcon className="size-3.5" />
          Notiz
        </button>
      </div>

      <div className="flex h-8 shrink-0 items-center gap-1 px-3">
        {query === null ? (
          <>
            <h2 className="flex-1 text-xs text-fg-muted">Aktuelle Notizen</h2>
            <button type="button" onClick={() => setQuery('')} aria-label="Kurznotizen durchsuchen" title="Suchen" className={`${iconButtonClass} !size-7`}>
              <SearchIcon className="size-3.5" />
            </button>
          </>
        ) : (
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && setQuery(null)}
            onBlur={() => query === '' && setQuery(null)}
            placeholder="Suchen …"
            aria-label="Kurznotizen durchsuchen"
            className="h-7 w-full rounded-md border border-line bg-surface px-2 text-xs text-fg focus:border-accent focus:outline-none"
          />
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pt-1 pb-4">
        {failed && <p className="px-1 text-sm text-danger-text">Die Kurznotizen konnten nicht geladen werden.</p>}
        {!failed && notes === null && <p className="px-1 text-sm text-fg-subtle">Lädt …</p>}
        {draft && projectId !== null && (
          <QuickCard
            key={draft.key}
            projectId={projectId}
            note={notes?.find((n) => n.id === draft.noteId) ?? null}
            editing
            asClient={asClient}
            onEdit={() => undefined}
            onSaved={(note) => {
              upsert(note);
              setDraft((current) => (current ? { ...current, noteId: note.id } : current));
            }}
            onDone={() => setDraft(null)}
            onDelete={remove}
          />
        )}
        {cards.map((note) => (
          <QuickCard
            key={note.id}
            projectId={note.projectId}
            note={note}
            editing={editing === note.id}
            asClient={asClient}
            onEdit={() => {
              setDraft(null);
              setEditing(note.id);
            }}
            onSaved={upsert}
            onDone={() => setEditing(null)}
            onDelete={remove}
          />
        ))}
        {notes !== null && cards.length === 0 && !draft && (
          <p className="px-1 pt-6 text-center text-sm text-fg-subtle">
            {query ? 'Keine Kurznotiz gefunden.' : 'Noch keine Kurznotizen. Mit „+ Notiz“ hältst du etwas fest.'}
          </p>
        )}
      </div>
    </div>
  );
}

interface QuickCardProps {
  projectId: number;
  /** Null for a new card that is not saved yet. */
  note: Note | null;
  editing: boolean;
  asClient?: string;
  onEdit: () => void;
  onSaved: (note: Note) => void;
  onDone: () => void;
  onDelete: (id: number) => void;
}

/** One card: the date, the title in bold, the text with list items as bullets; edited in place. */
function QuickCard({ projectId, note, editing, asClient, onEdit, onSaved, onDone, onDelete }: QuickCardProps) {
  const latest = useRef<Note | null>(note);
  const [text, setText] = useState(() => (note ? quickText(note) : ''));
  const { status, schedule, flush } = useAutosave<string>(async (value) => {
    const base = latest.current;
    const input = fromQuickText(value, base?.tags);
    if (!base) {
      if (!input.title && !input.content) return;
      const created = await notesApi.create(projectId, input, null, asClient);
      latest.current = created;
      onSaved(created);
      return;
    }
    let saved: Note;
    try {
      saved = await notesApi.update(base.id, input, base.updatedAt, asClient);
    } catch (error) {
      // Changed elsewhere meanwhile: a quick note is short, the last word counts.
      const current = error instanceof ApiError && error.status === 409 ? (error.details.note as Note | undefined) : undefined;
      if (!current) throw error;
      saved = await notesApi.update(base.id, { ...input, tags: current.tags }, current.updatedAt, asClient);
    }
    latest.current = saved;
    onSaved(saved);
  }, 600);

  // A version from elsewhere is taken over while nothing is typed here.
  useEffect(() => {
    if (!note || note.updatedAt === latest.current?.updatedAt || status !== 'saved' || editing) return;
    latest.current = note;
    setText(quickText(note));
  }, [note, status, editing]);

  const color = quickColor(note?.id ?? latest.current?.id ?? 0);
  const shown = note ?? latest.current;
  const finish = () => void flush().finally(onDone);

  return (
    <div className={`group overflow-hidden rounded-md shadow-sm ring-1 ring-black/5 ${color.card}`}>
      <div className={`h-1 ${color.bar}`} aria-hidden="true" />
      <div className="flex min-h-6 items-center justify-end gap-1 px-3 pt-1.5">
        {status === 'error' && <span className="mr-auto text-[11px] text-danger-text">Nicht gespeichert</span>}
        {shown && <time className="text-[11px] text-fg-subtle">{when(shown.updatedAt)}</time>}
        {shown && (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onDelete(shown.id)}
            aria-label="Kurznotiz löschen"
            title="Löschen (in den Papierkorb)"
            className={`${iconButtonClass} !size-6 ${editing ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'}`}
          >
            <TrashIcon className="size-3.5" />
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          autoFocus
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            schedule(event.target.value);
          }}
          onBlur={finish}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          placeholder="Notiz … (erste Zeile ist der Titel, „- “ macht eine Liste)"
          aria-label="Kurznotiz"
          className="block min-h-24 w-full resize-none bg-transparent px-3 pb-3 text-sm text-fg [field-sizing:content] placeholder:text-fg-subtle focus:outline-none"
        />
      ) : (
        <button type="button" onClick={onEdit} className="block w-full px-3 pb-3 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent">
          {shown?.title && <span className="block font-semibold text-fg">{shown.title}</span>}
          {previewLines(shown?.content ?? '').map((line, index) => (
            <span key={index} className={`block text-fg ${line.bullet ? 'relative pl-4' : ''}`}>
              {line.bullet && (
                <span aria-hidden="true" className="absolute left-1 font-bold">
                  •
                </span>
              )}
              {line.text}
            </span>
          ))}
        </button>
      )}
    </div>
  );
}

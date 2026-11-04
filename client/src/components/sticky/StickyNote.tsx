import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useAutosave } from '../../hooks/useAutosave';
import { useRealtimeProject } from '../../hooks/useRealtime';
import type { Note } from '../../types/note';
import { ApiError, notesApi } from '../../utils/api';
import { onNotesChanged } from '../../utils/appEvents';
import RichTextEditor from '../editor/RichTextEditor';

interface StickyNoteProps {
  noteId: number;
  onClose: () => void;
  /** The desktop app's frameless window: the header moves it. */
  draggable?: boolean;
  /**
   * The Picture-in-Picture window shares this tab: its saves go out as another client, so the tab's own list hears
   * of them (US-24), and it listens to the tab's saves instead of the live updates, which skip this tab.
   */
  inTab?: boolean;
}

type Draft = { title: string; content: string };

/** The client id the Picture-in-Picture note saves as (see `inTab`). */
const STICKY_CLIENT = `sticky-${Math.random().toString(36).slice(2, 12)}`;

const drag = { WebkitAppRegion: 'drag' } as CSSProperties;
const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/**
 * A note as a sticky note (US-26), like the Windows Sticky Notes: yellow paper, the title in a slim bar, the text
 * below and formatted by shortcuts and Markdown typing. Saves by itself; a change made elsewhere is taken over while
 * nothing is pending here, and a save that crossed one wins (the note is short, the last word counts).
 */
export default function StickyNote({ noteId, onClose, draggable = false, inTab = false }: StickyNoteProps) {
  const [note, setNote] = useState<Note | null | 'missing'>(null);
  // Remounts the editor with a version from elsewhere.
  const [version, setVersion] = useState(0);
  const latest = useRef<Note | null>(null);
  const draft = useRef<Draft>({ title: '', content: '' });

  const take = useCallback((fresh: Note) => {
    latest.current = fresh;
    draft.current = { title: fresh.title, content: fresh.content };
    setNote(fresh);
    setVersion((v) => v + 1);
  }, []);

  const asClient = inTab ? STICKY_CLIENT : undefined;
  const { status, schedule, flush } = useAutosave<Draft>(async (value) => {
    const base = latest.current;
    if (!base) return;
    const input = { title: value.title, content: value.content, tags: base.tags };
    let saved: Note;
    try {
      saved = await notesApi.update(noteId, input, base.updatedAt, asClient);
    } catch (error) {
      const current = error instanceof ApiError && error.status === 409 ? (error.details.note as Note | undefined) : undefined;
      if (!current) throw error;
      saved = await notesApi.update(noteId, { ...input, tags: current.tags }, current.updatedAt, asClient);
    }
    latest.current = saved;
  }, 600);

  const refresh = useCallback(async () => {
    try {
      const fresh = await notesApi.get(noteId);
      if (fresh.updatedAt !== latest.current?.updatedAt && status === 'saved') take(fresh);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) setNote('missing');
    }
  }, [noteId, status, take]);

  useEffect(() => {
    notesApi.get(noteId).then(take, () => setNote('missing'));
  }, [noteId, take]);

  // Changes made elsewhere: live updates for the desktop window, the tab's own saves for Picture-in-Picture.
  const projectId = note && note !== 'missing' ? note.projectId : undefined;
  useRealtimeProject(projectId, (events) => {
    if (events.some((e) => ('noteId' in e && e.noteId === noteId) || e.type === 'resync')) void refresh();
  });
  useEffect(() => (inTab ? onNotesChanged(() => void refresh()) : undefined), [inTab, refresh]);

  useEffect(() => {
    if (note && note !== 'missing') document.title = `${note.title || 'Sticky Note'} – Scrumbanize`;
  }, [note]);

  const close = () => void flush().finally(onClose);

  return (
    <div className="sticky-paper flex h-screen flex-col">
      <div style={draggable ? drag : undefined} className="flex h-8 shrink-0 items-center gap-1 bg-black/[0.06] pr-1 pl-3">
        {note && note !== 'missing' ? (
          <input
            key={version}
            style={noDrag}
            defaultValue={note.title}
            placeholder="Titel"
            aria-label="Titel"
            maxLength={200}
            onChange={(event) => {
              draft.current = { ...draft.current, title: event.target.value };
              schedule(draft.current);
            }}
            className="min-w-0 flex-1 bg-transparent text-xs font-semibold text-fg placeholder:text-fg-subtle focus:outline-none"
          />
        ) : (
          <span className="flex-1" />
        )}
        <span
          aria-live="polite"
          title={status === 'error' ? 'Nicht gespeichert – wird erneut versucht' : status === 'saved' ? 'Gespeichert' : 'Wird gespeichert …'}
          className={`size-1.5 shrink-0 rounded-full ${status === 'error' ? 'bg-danger' : status === 'saved' ? 'bg-black/20' : 'bg-amber-600'}`}
        >
          <span className="sr-only">{status === 'error' ? 'Nicht gespeichert' : status === 'saved' ? 'Gespeichert' : 'Wird gespeichert'}</span>
        </span>
        <button
          type="button"
          style={noDrag}
          onClick={close}
          aria-label="Sticky Note schließen"
          title="Schließen"
          className="grid size-6 place-items-center rounded text-base leading-none text-fg-muted hover:bg-black/10 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {note === null && <p className="text-sm text-fg-subtle">Lädt …</p>}
        {note === 'missing' && <p className="text-sm text-fg-muted">Diese Notiz gibt es nicht mehr oder sie liegt im Papierkorb.</p>}
        {note && note !== 'missing' && (
          <RichTextEditor
            key={version}
            value={note.content}
            onChange={(content) => {
              draft.current = { ...draft.current, content };
              schedule(draft.current);
            }}
            label="Text der Sticky Note"
            placeholder="Notiz …"
            toolbar={false}
            contentClassName="text-sm"
          />
        )}
      </div>
    </div>
  );
}

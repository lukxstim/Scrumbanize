import { useEffect, useRef, useState } from 'react';
import { DRAWIO_ORIGIN, DRAWIO_URL, dataUriToBlob } from '../../utils/drawio';
import ConfirmDialog from '../ConfirmDialog';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';

/** Without an answer from diagrams.net by then, it is probably not reachable (offline, blocked). */
const LOAD_TIMEOUT_MS = 20_000;

interface DiagramEditorProps {
  /** Shown above the editor and given to diagrams.net as the diagram's title. */
  name: string;
  /** The diagram to open, as draw.io XML; undefined for a new, empty one. */
  xml?: string;
  /** Saves the picture with the diagram in it (PNG); the editor closes when it resolves. */
  onSave: (png: Blob) => Promise<void>;
  onClose: () => void;
}

type DrawioMessage =
  | { event: 'init' }
  | { event: 'save'; xml: string; exit?: boolean }
  | { event: 'export'; data: string; format: string }
  | { event: 'exit'; modified?: boolean }
  | { event: 'configure' };

/**
 * diagrams.net (draw.io) in a frame over the app (US-32), in its embed mode: it draws, the app keeps the file. The
 * page talks to it only by messages, which are accepted from diagrams.net alone. "Speichern & Beenden" exports an
 * editable PNG, which goes back to the note or task as its attachment.
 */
export default function DiagramEditor({ name, xml, onSave, onClose }: DiagramEditorProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'unreachable' | 'failed'>('loading');
  const [leaving, setLeaving] = useState(false);
  // The latest props and state for the message handler, which is set up once.
  const latest = useRef({ name, xml, onSave, onClose, state });
  useEffect(() => {
    latest.current = { name, xml, onSave, onClose, state };
  });

  useEffect(() => {
    const post = (message: object) => frame.current?.contentWindow?.postMessage(JSON.stringify(message), DRAWIO_ORIGIN);
    const timer = setTimeout(() => {
      if (latest.current.state === 'loading') setState('unreachable');
    }, LOAD_TIMEOUT_MS);

    function onMessage(event: MessageEvent) {
      if (event.origin !== DRAWIO_ORIGIN || event.source !== frame.current?.contentWindow || typeof event.data !== 'string') return;
      let message: DrawioMessage;
      try {
        message = JSON.parse(event.data) as DrawioMessage;
      } catch {
        return;
      }
      const current = latest.current;
      switch (message.event) {
        case 'init':
          clearTimeout(timer);
          setState('ready');
          post({ action: 'load', xml: current.xml ?? '', title: current.name, autosave: 0, saveAndExit: 1, noSaveBtn: 1 });
          break;
        case 'save':
          // Only "Speichern & Beenden" is offered; the picture with the diagram in it is made next.
          setState('saving');
          post({ action: 'export', format: 'xmlpng', spinKey: 'saving', scale: 1, border: 10 });
          break;
        case 'export':
          void current
            .onSave(dataUriToBlob(message.data))
            .then(() => current.onClose())
            .catch(() => {
              setState('failed');
              post({ action: 'spinner', show: false });
            });
          break;
        case 'exit':
          // diagrams.net's own "Beenden": ask first if something was drawn.
          if (message.modified) setLeaving(true);
          else current.onClose();
          break;
      }
    }

    window.addEventListener('message', onMessage);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMessage);
    };
  }, []);

  return (
    <Dialog
      onClose={onClose}
      labelledBy="diagram-editor-title"
      // Escape belongs to the drawing (and would lose it); closing goes through "Abbrechen".
      dismissible={false}
      className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-none flex-col overflow-hidden p-0"
    >
      <div className="flex items-center gap-3 border-b border-line px-4 py-2">
        <h2 id="diagram-editor-title" className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">
          {name}
        </h2>
        {state === 'failed' && (
          <span role="alert" className="text-xs text-danger-text">
            Speichern fehlgeschlagen – bitte erneut versuchen.
          </span>
        )}
        <span className="text-xs text-fg-subtle max-sm:hidden">Gezeichnet mit diagrams.net</span>
        <Button size="sm" variant="ghost" onClick={() => (state === 'ready' || state === 'failed' ? setLeaving(true) : onClose())} disabled={state === 'saving'}>
          Abbrechen
        </Button>
      </div>
      {state === 'unreachable' ? (
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="max-w-sm space-y-3">
            <p className="text-sm font-medium text-fg">diagrams.net ist nicht erreichbar.</p>
            <p className="text-sm text-fg-subtle">Der Diagramm-Editor braucht eine Internetverbindung. Prüfe sie und versuche es noch einmal.</p>
            <Button size="sm" onClick={onClose}>
              Schließen
            </Button>
          </div>
        </div>
      ) : (
        <iframe
          ref={frame}
          src={DRAWIO_URL}
          title="Diagramm-Editor"
          className="min-h-0 w-full flex-1 border-0"
          // The editor needs scripts, its own storage and pop-ups for help pages; nothing of the app's own.
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
          allow="clipboard-read; clipboard-write"
        />
      )}
      <ConfirmDialog
        open={leaving}
        title="Diagramm schließen?"
        message="Was du seit dem Öffnen gezeichnet hast, geht verloren. Zum Behalten „Speichern & Beenden“ in diagrams.net wählen."
        confirmLabel="Verwerfen"
        onConfirm={onClose}
        onCancel={() => setLeaving(false)}
      />
    </Dialog>
  );
}

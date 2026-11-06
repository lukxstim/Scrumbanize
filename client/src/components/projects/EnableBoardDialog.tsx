import { useState } from 'react';
import type { Project } from '../../types/project';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';

interface EnableBoardDialogProps {
  notebook: Project;
  onEnable: () => Promise<void>;
  onCancel: () => void;
}

/**
 * The board tab of a notebook without board (US-26, US-34): asks once, then the notebook gets its board, calendar
 * and statistics. Its notes stay as they are; switching it off again later hides the tasks, it deletes none.
 */
export default function EnableBoardDialog({ notebook, onEnable, onCancel }: EnableBoardDialogProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function enable() {
    setBusy(true);
    setFailed(false);
    try {
      await onEnable();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onCancel} dismissible={!busy} closeOnBackdrop labelledBy="enable-board-title" mobile="compact" className="max-w-sm p-6">
      <h2 id="enable-board-title" className="text-base font-semibold text-fg">
        Board für „{notebook.name}“ einschalten?
      </h2>
      <p className="mt-2 text-sm text-fg-muted">
        Das Notizbuch bekommt ein eigenes Scrumban-Board, einen Kalender und Statistiken. Die Notizen bleiben, wie sie
        sind. In den Einstellungen des Notizbuchs lässt es sich wieder ausschalten.
      </p>
      {failed && (
        <p role="alert" className="mt-3 text-sm text-danger-text">
          Das Board konnte nicht eingeschaltet werden. Bitte versuche es erneut.
        </p>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" disabled={busy} onClick={onCancel}>
          Abbrechen
        </Button>
        <Button variant="primary" disabled={busy} onClick={() => void enable()} data-autofocus>
          {busy ? 'Wird eingeschaltet …' : 'Board einschalten'}
        </Button>
      </div>
    </Dialog>
  );
}

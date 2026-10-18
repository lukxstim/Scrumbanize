import { useState } from 'react';
import type { Folder } from '../../types/note';
import { flattenFolders } from '../../utils/folders';
import { FolderIcon } from '../icons';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';

interface MoveToFolderDialogProps {
  /** e.g. "„Einkaufsliste“ verschieben" */
  title: string;
  folders: Folder[];
  /** Where it is now; null: the top level. */
  current: number | null;
  /** Targets that do not fit (for a folder: itself, what is inside it, too deep). */
  isDisabled?: (folderId: number | null) => boolean;
  onMove: (folderId: number | null) => Promise<void>;
  onClose: () => void;
}

/** "Verschieben nach …" (US-22): the top level or any folder, as an indented list. The keyboard way besides dragging. */
export default function MoveToFolderDialog({ title, folders, current, isDisabled, onMove, onClose }: MoveToFolderDialogProps) {
  const [target, setTarget] = useState<number | null>(current);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const options = [{ id: null, name: 'Oberste Ebene', depth: 0 }, ...flattenFolders(folders).map(({ folder, depth }) => ({ id: folder.id, name: folder.name, depth }))];

  async function submit() {
    setBusy(true);
    setFailed(false);
    try {
      await onMove(target);
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onClose} dismissible={!busy} labelledBy="move-folder-title" className="max-w-sm p-6">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <h2 id="move-folder-title" className="truncate text-base font-semibold text-fg">
          {title}
        </h2>
        <fieldset className="mt-4">
          <legend className="sr-only">Ziel</legend>
          <div className="max-h-72 overflow-y-auto rounded-md border border-line py-1">
            {options.map((option) => {
              const disabled = isDisabled?.(option.id) ?? false;
              return (
                <label
                  key={option.id ?? 'top'}
                  style={{ paddingLeft: `${0.75 + option.depth * 1}rem` }}
                  className={`flex items-center gap-2 py-1.5 pr-3 text-sm has-checked:bg-accent-muted has-checked:text-fg has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-accent ${
                    disabled ? 'cursor-not-allowed text-fg-faint' : 'cursor-pointer text-fg-muted hover:bg-surface-hover'
                  }`}
                >
                  <input
                    type="radio"
                    name="move-target"
                    className="sr-only"
                    checked={target === option.id}
                    disabled={disabled}
                    onChange={() => setTarget(option.id)}
                    data-autofocus={target === option.id || undefined}
                  />
                  {option.id !== null && <FolderIcon className="size-3.5 shrink-0" />}
                  <span className={`truncate ${option.id === null ? 'font-medium' : ''}`}>{option.name}</span>
                  {option.id === current && <span className="ml-auto shrink-0 text-xs text-fg-subtle">aktuell</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
        {failed && (
          <p role="alert" className="mt-3 text-sm text-danger-text">
            Das Verschieben hat nicht geklappt.
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" variant="primary" disabled={busy || target === current}>
            Verschieben
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

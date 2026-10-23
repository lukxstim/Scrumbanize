import { useState } from 'react';
import type { ProjectColor } from '../../types/project';
import type { Label } from '../../types/task';
import { labelsApi } from '../../utils/api';
import { PROJECT_COLORS } from '../../utils/projects';
import ConfirmDialog from '../ConfirmDialog';
import { ChevronDownIcon, PlusIcon, TrashIcon } from '../icons';
import { ColorChoice } from '../tasks/LabelChip';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { fieldClass, iconButtonClass } from '../ui/styles';

interface LabelsDialogProps {
  labels: Label[];
  onCreate: (name: string, color: ProjectColor) => Promise<Label | undefined>;
  onUpdate: (id: number, patch: { name?: string; color?: ProjectColor }) => Promise<boolean>;
  onMove: (id: number, index: number) => Promise<boolean>;
  onDelete: (id: number) => Promise<boolean>;
  /** Shown when a change failed (from the board). */
  error: string | null;
  onClose: () => void;
}

/** Create, rename, recolor, reorder and delete the project's labels. */
export default function LabelsDialog({ labels, onCreate, onUpdate, onMove, onDelete, error, onClose }: LabelsDialogProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState<ProjectColor>(() => PROJECT_COLORS[labels.length % PROJECT_COLORS.length]!.value);
  const [deleting, setDeleting] = useState<{ label: Label; tasks: number } | null>(null);

  async function add() {
    if (!name.trim()) return;
    if (await onCreate(name.trim(), color)) {
      setName('');
      setColor(PROJECT_COLORS[(labels.length + 1) % PROJECT_COLORS.length]!.value);
    }
  }

  async function askDelete(label: Label) {
    // The confirmation says how many tasks lose the label.
    const { tasks } = await labelsApi.usage(label.id).catch(() => ({ tasks: 0 }));
    setDeleting({ label, tasks });
  }

  return (
    <Dialog onClose={onClose} closeOnBackdrop labelledBy="labels-title" className="max-w-lg p-0">
      <div className="border-b border-line px-6 py-4">
        <h2 id="labels-title" className="text-base font-semibold text-fg">
          Labels verwalten
        </h2>
        <p className="mt-0.5 text-sm text-fg-subtle">Farbige Labels für die Tasks dieses Projekts.</p>
      </div>

      <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
        {error && (
          <p role="alert" className="mb-3 rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}
        <ul className="divide-y divide-line">
          {labels.map((label, index) => (
            <LabelRow
              key={`${label.id}-${label.name}-${label.color}`}
              label={label}
              first={index === 0}
              last={index === labels.length - 1}
              onRename={(next) => void onUpdate(label.id, { name: next })}
              onRecolor={(next) => void onUpdate(label.id, { color: next })}
              onUp={() => void onMove(label.id, index - 1)}
              onDown={() => void onMove(label.id, index + 1)}
              onDelete={() => void askDelete(label)}
            />
          ))}
          {labels.length === 0 && <li className="py-3 text-sm text-fg-subtle">Noch keine Labels.</li>}
        </ul>

        <form
          className="mt-4 space-y-2 rounded-lg border border-line bg-surface-muted p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void add();
          }}
        >
          <div className="flex gap-2">
            <input
              autoComplete="off"
              enterKeyHint="done"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={30}
              placeholder="Neues Label, z. B. Einkauf"
              aria-label="Name des neuen Labels"
              className={`!py-1 ${fieldClass}`}
            />
            <Button type="submit" size="sm" variant="primary" disabled={!name.trim()}>
              <PlusIcon className="size-3.5" />
              Anlegen
            </Button>
          </div>
          <ColorChoice value={color} onChange={setColor} label="Farbe des neuen Labels" />
        </form>
      </div>

      <div className="flex justify-end border-t border-line px-6 py-3">
        <Button variant="ghost" onClick={onClose} data-autofocus>
          Fertig
        </Button>
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title="Label löschen?"
        message={
          deleting
            ? deleting.tasks > 0
              ? `„${deleting.label.name}“ wird gelöscht und von ${deleting.tasks === 1 ? '1 Task' : `${deleting.tasks} Tasks`} entfernt.`
              : `„${deleting.label.name}“ wird gelöscht. Kein Task trägt es gerade.`
            : ''
        }
        confirmLabel="Löschen"
        onConfirm={() => {
          if (deleting) void onDelete(deleting.label.id);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </Dialog>
  );
}

interface LabelRowProps {
  label: Label;
  first: boolean;
  last: boolean;
  onRename: (name: string) => void;
  onRecolor: (color: ProjectColor) => void;
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
}

function LabelRow({ label, first, last, onRename, onRecolor, onUp, onDown, onDelete }: LabelRowProps) {
  const [name, setName] = useState(label.name);
  const save = () => {
    const next = name.trim();
    if (next && next !== label.name) onRename(next);
    else setName(label.name);
  };
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-2">
        <input
          autoComplete="off"
          enterKeyHint="done"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur();
            if (event.key === 'Escape') {
              event.stopPropagation();
              setName(label.name);
            }
          }}
          maxLength={30}
          aria-label={`Name des Labels „${label.name}“`}
          className={`!py-1 ${fieldClass}`}
        />
        <button type="button" disabled={first} onClick={onUp} aria-label={`„${label.name}“ nach oben`} className={`${iconButtonClass} disabled:opacity-30`}>
          <ChevronDownIcon className="size-4 rotate-180" />
        </button>
        <button type="button" disabled={last} onClick={onDown} aria-label={`„${label.name}“ nach unten`} className={`${iconButtonClass} disabled:opacity-30`}>
          <ChevronDownIcon className="size-4" />
        </button>
        <button type="button" onClick={onDelete} aria-label={`„${label.name}“ löschen`} className={`${iconButtonClass} hover:text-danger-text`}>
          <TrashIcon className="size-4" />
        </button>
      </div>
      <ColorChoice value={label.color} onChange={onRecolor} label={`Farbe von „${label.name}“`} />
    </li>
  );
}

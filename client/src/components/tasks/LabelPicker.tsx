import { useEffect, useId, useRef, useState } from 'react';
import type { ProjectColor } from '../../types/project';
import type { Label } from '../../types/task';
import { LABEL_STYLES } from '../../utils/labels';
import { PROJECT_COLORS } from '../../utils/projects';
import { PlusIcon } from '../icons';
import { fieldClass, popoverClass } from '../ui/styles';
import { ColorChoice, LabelChips } from './LabelChip';

interface LabelPickerProps {
  /** All labels of the project. */
  labels: Label[];
  selected: number[];
  onChange: (ids: number[]) => void;
  /** Creates a label from the search text; resolves to it, or undefined if that failed. */
  onCreate: (name: string, color: ProjectColor) => Promise<Label | undefined>;
}

/** The task's labels, and a popover to tick them or create a new one from the search text. */
export default function LabelPicker({ labels, selected, onChange, onCreate }: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // New labels take the next color, so a few new ones do not all look alike.
  const [color, setColor] = useState<ProjectColor>(() => PROJECT_COLORS[labels.length % PROJECT_COLORS.length]!.value);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const trimmed = query.trim();
  const shown = labels.filter((l) => l.name.toLocaleLowerCase('de').includes(trimmed.toLocaleLowerCase('de')));
  const exact = labels.some((l) => l.name.toLocaleLowerCase('de') === trimmed.toLocaleLowerCase('de'));
  const toggle = (id: number) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);

  async function create() {
    if (!trimmed || exact || creating) return;
    setCreating(true);
    const label = await onCreate(trimmed, color);
    setCreating(false);
    if (label) {
      onChange([...selected, label.id]);
      setQuery('');
      setColor(PROJECT_COLORS[(labels.length + 1) % PROJECT_COLORS.length]!.value);
    }
  }

  const chosen = labels.filter((l) => selected.includes(l.id));
  return (
    <div ref={containerRef} className="relative">
      <span className="mb-1 block text-sm font-medium text-fg-muted">Labels</span>
      <div className="flex flex-wrap items-center gap-1">
        <LabelChips labels={chosen} max={8} />
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-fg-subtle ring-1 ring-line ring-inset hover:bg-surface-hover hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <PlusIcon className="size-3" />
          {chosen.length ? 'Ändern' : 'Label hinzufügen'}
        </button>
      </div>

      {open && (
        <div
          className={`absolute left-0 z-30 mt-1 w-72 p-2 ${popoverClass}`}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <input
            autoComplete="off"
            enterKeyHint="done"
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                if (shown.length === 1 && trimmed) toggle(shown[0]!.id);
                else void create();
              }
            }}
            maxLength={30}
            placeholder="Suchen oder neu anlegen …"
            aria-label="Label suchen oder anlegen"
            className={`!py-1 !text-sm ${fieldClass}`}
          />
          <ul id={listId} role="listbox" aria-multiselectable="true" aria-label="Labels" className="mt-1 max-h-56 overflow-y-auto">
            {shown.map((label) => {
              const checked = selected.includes(label.id);
              return (
                <li key={label.id} role="option" aria-selected={checked}>
                  <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-fg hover:bg-surface-hover">
                    <input type="checkbox" checked={checked} onChange={() => toggle(label.id)} />
                    <span aria-hidden="true" className={`size-2 rounded-full ${LABEL_STYLES[label.color].dot}`} />
                    <span className="truncate">{label.name}</span>
                  </label>
                </li>
              );
            })}
            {shown.length === 0 && !trimmed && <li className="px-2 py-1.5 text-sm text-fg-subtle">Noch keine Labels.</li>}
          </ul>
          {trimmed && !exact && (
            <div className="mt-1 space-y-2 border-t border-line px-1 pt-2">
              <ColorChoice value={color} onChange={setColor} label="Farbe des neuen Labels" />
              <button
                type="button"
                disabled={creating}
                onClick={() => void create()}
                className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left text-sm text-accent-text hover:bg-surface-hover disabled:opacity-50"
              >
                <PlusIcon className="size-3.5" />„{trimmed}“ anlegen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

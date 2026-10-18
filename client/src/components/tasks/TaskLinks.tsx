import { Command } from 'cmdk';
import { useState } from 'react';
import type { LinkKind, Task } from '../../types/task';
import { groupLinks, LINK_KIND_LABELS, LINK_KIND_ORDER } from '../../utils/links';
import { LinkIcon, PlusIcon } from '../icons';
import SegmentedControl from '../ui/SegmentedControl';
import { iconButtonClass, labelClass } from '../ui/styles';

interface TaskLinksProps {
  task: Task;
  /** Tasks that can be linked: the project's others without a link to this one yet. */
  candidates: Task[];
  onAdd: (kind: LinkKind, targetId: number) => Promise<void>;
  onRemove: (linkId: number) => Promise<void>;
  /** Shows the linked task's details instead. */
  onOpen: (id: number) => void;
  /** Viewers (US-21): links can be followed, not added or removed. */
  readOnly?: boolean;
}

/** "Verknüpfungen" in the task details: links grouped by kind, and a picker to add one. */
export default function TaskLinks({ task, candidates, onAdd, onRemove, onOpen, readOnly = false }: TaskLinksProps) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<LinkKind>('relates');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const groups = groupLinks(task.links);

  async function add(targetId: number) {
    setError(null);
    try {
      await onAdd(kind, targetId);
      setAdding(false);
      setQuery('');
    } catch {
      setError('Die Verknüpfung konnte nicht angelegt werden.');
    }
  }

  async function remove(linkId: number) {
    setError(null);
    try {
      await onRemove(linkId);
    } catch {
      setError('Die Verknüpfung konnte nicht entfernt werden.');
    }
  }

  return (
    <section aria-labelledby="task-links-heading">
      <div className="mb-2 flex items-center justify-between">
        <h3 id="task-links-heading" className={labelClass}>
          Verknüpfungen
        </h3>
        {!adding && !readOnly && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-accent-text hover:bg-accent-muted"
          >
            <PlusIcon className="size-3.5" />
            Verknüpfung
          </button>
        )}
      </div>

      {groups.length === 0 && !adding && <p className="text-sm text-fg-subtle">Keine Verknüpfungen.</p>}

      <div className="flex flex-col gap-3">
        {groups.map((group) => (
          <div key={group.kind}>
            <h4 className="mb-1 text-xs font-medium text-fg-subtle">{LINK_KIND_LABELS[group.kind]}</h4>
            <ul className="flex flex-col gap-1">
              {group.links.map((link) => (
                <li key={link.id} className="group/link flex items-center gap-2 rounded-md border border-line px-2 py-1">
                  <LinkIcon className="size-3.5 shrink-0 text-fg-subtle" />
                  <button
                    type="button"
                    onClick={() => onOpen(link.task.id)}
                    className="min-w-0 flex-1 truncate text-left text-sm text-fg hover:text-accent-text hover:underline"
                  >
                    <span className="font-mono text-xs text-fg-subtle">#{link.task.id}</span> {link.task.title}
                  </button>
                  <span
                    className={`shrink-0 rounded bg-surface-muted px-1.5 py-px text-[11px] text-fg-subtle ${link.task.done ? 'line-through' : ''}`}
                    title={link.task.done ? 'Erledigt' : undefined}
                  >
                    {link.task.columnName}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => void remove(link.id)}
                      aria-label={`Verknüpfung mit „${link.task.title}“ entfernen`}
                      title="Verknüpfung entfernen"
                      className={`!size-6 text-base leading-none ${iconButtonClass}`}
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {adding && (
        <div
          className="mt-3 rounded-lg border border-line bg-surface-muted/50 p-3"
          // Escape closes the picker, not the whole dialog.
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            setAdding(false);
          }}
        >
          <SegmentedControl
            label="Art der Verknüpfung"
            size="sm"
            value={kind}
            onChange={setKind}
            options={LINK_KIND_ORDER.map((k) => ({ value: k, label: LINK_KIND_LABELS[k] }))}
          />
          <Command label="Task zum Verknüpfen" loop className="mt-2">
            <Command.Input
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder="Task suchen (Titel oder #Nummer) …"
              className="h-8 w-full rounded-md border border-line bg-surface px-2.5 text-sm text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none focus:ring-3 focus:ring-accent/20"
            />
            <Command.List className="mt-1 max-h-48 overflow-y-auto overscroll-contain">
              <Command.Empty className="px-2 py-3 text-center text-xs text-fg-subtle">
                {candidates.length === 0 ? 'Keine weiteren Tasks in diesem Projekt.' : 'Kein Task gefunden.'}
              </Command.Empty>
              {candidates.map((candidate) => (
                <Command.Item
                  key={candidate.id}
                  value={`#${candidate.id} ${candidate.title}`}
                  onSelect={() => void add(candidate.id)}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg-muted data-[selected=true]:bg-surface-hover data-[selected=true]:text-fg"
                >
                  <span className="font-mono text-xs text-fg-subtle">#{candidate.id}</span>
                  <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={() => setAdding(false)} className="text-xs font-medium text-fg-subtle hover:text-fg">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          {error}
        </p>
      )}
    </section>
  );
}

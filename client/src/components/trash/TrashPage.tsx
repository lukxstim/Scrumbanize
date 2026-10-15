import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useProjects } from '../../hooks/useProjects';
import { useStoredState } from '../../hooks/useStoredState';
import { useToast } from '../../hooks/useToast';
import { useTrash } from '../../hooks/useTrash';
import type { TrashItem, TrashType } from '../../types/trash';
import { groupByDay, timeLabel } from '../../utils/activity';
import { trashApi } from '../../utils/api';
import { formatDate } from '../../utils/format';
import { colorDot, countLabel } from '../../utils/projects';
import { filterTrash, restoredMessage, trashSummary, trashTitle, type TrashFilter } from '../../utils/trash';
import ConfirmDialog from '../ConfirmDialog';
import { FolderIcon, NoteIcon, RestoreIcon, TaskIcon, TrashIcon } from '../icons';
import Button from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import Skeleton from '../ui/Skeleton';

type Scope = 'project' | 'all';
const isScope = (value: unknown): value is Scope => value === 'project' || value === 'all';

const TYPE_ICONS: Record<TrashType, ReactNode> = { note: <NoteIcon />, task: <TaskIcon />, project: <FolderIcon /> };
const TYPE_LABELS: Record<TrashType, string> = { note: 'Notiz', task: 'Task', project: 'Projekt' };

const FILTERS: { value: TrashFilter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'note', label: 'Notizen' },
  { value: 'task', label: 'Tasks' },
  { value: 'project', label: 'Projekte' },
];

type Confirming = { kind: 'purge'; item: TrashItem } | { kind: 'empty' } | null;

/** Deleted notes, tasks and projects at /p/:projectId/trash: restore them or delete them for good. */
export default function TrashPage() {
  const projectId = Number(useParams().projectId);
  const navigate = useNavigate();
  const toast = useToast();
  const { reload: reloadProjects } = useProjects();
  const [scope, setScope] = useStoredState<Scope>('scrumbanize.trashScope', 'project', isScope);
  const [filter, setFilter] = useState<TrashFilter>('all');
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const trash = useTrash(scope === 'project' ? projectId : undefined);
  const shown = filterTrash(trash.items, filter);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /** Runs one action on an item; the list reloads by itself (see useTrash). */
  async function run(item: TrashItem, action: () => Promise<void>, failure: string) {
    setBusyKey(`${item.type}:${item.id}`);
    try {
      await action();
    } catch {
      toast({ message: failure, tone: 'error' });
    } finally {
      setBusyKey(null);
    }
  }

  function restore(item: TrashItem) {
    void run(
      item,
      async () => {
        const result = await trashApi.restore(item.type, item.id);
        if (result.type === 'project') await reloadProjects();
        const { message, link } = restoredMessage(result);
        toast({ message, action: { label: 'Öffnen', onClick: () => navigate(link) } });
      },
      `„${trashTitle(item)}“ konnte nicht wiederhergestellt werden.`,
    );
  }

  function purge(item: TrashItem) {
    setConfirming(null);
    void run(
      item,
      async () => {
        await trashApi.purge(item.type, item.id);
        toast({ message: `„${trashTitle(item)}“ endgültig gelöscht.` });
      },
      `„${trashTitle(item)}“ konnte nicht gelöscht werden.`,
    );
  }

  async function empty() {
    setConfirming(null);
    try {
      const result = await trashApi.empty(scope === 'project' ? projectId : undefined);
      const total = result.notes + result.tasks + result.projects;
      toast({ message: `Papierkorb geleert: ${total === 1 ? '1 Element' : `${total} Elemente`} endgültig gelöscht.` });
    } catch {
      toast({ message: 'Der Papierkorb konnte nicht geleert werden.', tone: 'error' });
    }
  }

  // "Leeren" in this project's view leaves trashed projects alone; they only go with "Alle Projekte".
  const emptied = scope === 'project' ? trash.items.filter((i) => i.type !== 'project') : trash.items;
  const summary = trashSummary(emptied);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">Papierkorb</h1>
            <p className="mt-1 text-sm text-fg-subtle">
              Gelöschte Notizen, Tasks und Projekte. Sie bleiben hier, bis du sie endgültig löschst.
            </p>
          </div>
          <Button variant="danger-ghost" size="sm" disabled={emptied.length === 0} onClick={() => setConfirming({ kind: 'empty' })}>
            <TrashIcon className="size-3.5" />
            Papierkorb leeren
          </Button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <SegmentedControl
            label="Umfang"
            size="sm"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'project', label: 'Dieses Projekt' },
              { value: 'all', label: 'Alle Projekte' },
            ]}
          />
          <SegmentedControl label="Art filtern" size="sm" value={filter} onChange={setFilter} options={FILTERS} />
        </div>

        <div className="mt-6">
          {trash.status === 'loading' && (
            <div className="space-y-3" aria-label="Lade Papierkorb …">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          )}

          {trash.status === 'error' && (
            <div className="py-10 text-center text-sm text-danger-text">
              <p>Der Papierkorb konnte nicht geladen werden.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => void trash.reload()}>
                Erneut versuchen
              </Button>
            </div>
          )}

          {trash.status === 'ready' && shown.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="grid size-12 place-items-center rounded-xl bg-surface-muted text-fg-subtle ring-1 ring-line">
                <TrashIcon className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-fg">Der Papierkorb ist leer</p>
                <p className="mt-1 text-sm text-fg-subtle">
                  {trash.items.length > 0 ? 'Für diesen Filter gibt es nichts im Papierkorb.' : 'Gelöschte Inhalte erscheinen hier und lassen sich wiederherstellen.'}
                </p>
              </div>
            </div>
          )}

          {trash.status === 'ready' &&
            groupByDay(shown, now, (item) => item.deletedAt).map((group) => (
              <section key={group.label} aria-label={`Gelöscht: ${group.label}`} className="mb-6">
                <h2 className="sticky top-0 z-10 -mx-1 bg-canvas/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle backdrop-blur">
                  {group.label}
                </h2>
                <ul className="divide-y divide-line rounded-xl border border-line bg-surface shadow-card">
                  {group.items.map((item) => (
                    <TrashRow
                      key={`${item.type}:${item.id}`}
                      item={item}
                      now={now}
                      showProject={scope === 'all' || item.type === 'project'}
                      busy={busyKey === `${item.type}:${item.id}`}
                      onRestore={() => restore(item)}
                      onPurge={() => setConfirming({ kind: 'purge', item })}
                    />
                  ))}
                </ul>
              </section>
            ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirming?.kind === 'purge'}
        title="Endgültig löschen?"
        message={
          confirming?.kind === 'purge'
            ? confirming.item.type === 'project'
              ? `„${trashTitle(confirming.item)}“ wird mit allen Notizen, Tasks und dem Aktivitätsprotokoll endgültig gelöscht. Das lässt sich nicht rückgängig machen.`
              : `„${trashTitle(confirming.item)}“ wird endgültig gelöscht. Das lässt sich nicht rückgängig machen.`
            : ''
        }
        confirmLabel="Endgültig löschen"
        onConfirm={() => confirming?.kind === 'purge' && purge(confirming.item)}
        onCancel={() => setConfirming(null)}
      />
      <ConfirmDialog
        open={confirming?.kind === 'empty'}
        title="Papierkorb leeren?"
        message={`${summary} ${emptied.length === 1 ? 'wird' : 'werden'} endgültig gelöscht${
          scope === 'project' ? ' (nur dieses Projekt)' : ''
        }. Das lässt sich nicht rückgängig machen.`}
        confirmLabel="Leeren"
        onConfirm={() => void empty()}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}

interface TrashRowProps {
  item: TrashItem;
  now: Date;
  showProject: boolean;
  busy: boolean;
  onRestore: () => void;
  onPurge: () => void;
}

function TrashRow({ item, now, showProject, busy, onRestore, onPurge }: TrashRowProps) {
  const title = trashTitle(item);
  const details =
    item.type === 'note'
      ? item.snippet
      : item.type === 'task'
        ? `Kommt zurück in „${item.columnName}“`
        : `Mit ${countLabel(item.noteCount ?? 0, 'Notiz', 'Notizen')} und ${countLabel(item.taskCount ?? 0, 'Task', 'Tasks')}`;

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span
        className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-surface-muted text-fg-subtle ring-1 ring-line [&_svg]:size-4"
        title={TYPE_LABELS[item.type]}
      >
        {TYPE_ICONS[item.type]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">
          <span className="sr-only">{TYPE_LABELS[item.type]}: </span>
          {title}
        </p>
        <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
          {showProject && item.type !== 'project' && (
            <span className="flex items-center gap-1">
              <span aria-hidden="true" className={`size-2 rounded-full ${colorDot(item.projectColor)}`} />
              {item.projectName}
            </span>
          )}
          {item.type === 'project' && <span aria-hidden="true" className={`size-2 rounded-full ${colorDot(item.projectColor)}`} />}
          {details && <span className="min-w-0 truncate">{details}</span>}
        </p>
      </div>
      <time dateTime={item.deletedAt} title={`Gelöscht ${formatDate(item.deletedAt)}`} className="shrink-0 pt-1 text-xs text-fg-subtle tabular-nums">
        {timeLabel(new Date(item.deletedAt), now)}
      </time>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="secondary" disabled={busy} onClick={onRestore} aria-label={`„${title}“ wiederherstellen`}>
          <RestoreIcon className="size-3.5" />
          Wiederherstellen
        </Button>
        <Button size="sm" variant="danger-ghost" disabled={busy} onClick={onPurge} aria-label={`„${title}“ endgültig löschen`}>
          Endgültig löschen
        </Button>
      </div>
    </li>
  );
}

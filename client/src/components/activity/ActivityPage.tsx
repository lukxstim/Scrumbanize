import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { useActivities } from '../../hooks/useActivities';
import type { ActivityEntity } from '../../types/activity';
import { groupByDay } from '../../utils/activity';
import { ClockIcon } from '../icons';
import Button from '../ui/Button';
import SegmentedControl from '../ui/SegmentedControl';
import Skeleton from '../ui/Skeleton';
import ActivityItem from './ActivityItem';

type Filter = 'all' | ActivityEntity;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'note', label: 'Notizen' },
  { value: 'task', label: 'Tasks' },
  { value: 'board', label: 'Board' },
  { value: 'project', label: 'Projekt' },
];

/** The project's activity log at /p/:projectId/activity, grouped by day, with older entries loading on scroll. */
export default function ActivityPage() {
  const projectId = Number(useParams().projectId);
  const [filter, setFilter] = useState<Filter>('all');
  const log = useActivities(projectId, filter === 'all' ? undefined : filter);
  const { hasMore, loadingMore, loadMore } = log;

  // Relative times ("vor 5 Min.") stay current while the page is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Load the next page when the end of the list scrolls into view.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!element || !hasMore) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !loadingMore) void loadMore();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-fg">Aktivität</h1>
            <p className="mt-1 text-sm text-fg-subtle">Was in diesem Projekt passiert ist, die neuesten Einträge zuerst.</p>
          </div>
          <SegmentedControl label="Bereich filtern" size="sm" value={filter} onChange={setFilter} options={FILTERS} />
        </div>

        <div className="mt-6">
          {log.status === 'loading' && (
            <div className="space-y-4" aria-label="Lade Aktivität …">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-3 px-3">
                  <Skeleton className="size-7 shrink-0 rounded-md" />
                  <Skeleton className={`h-4 ${['w-2/3', 'w-1/2', 'w-3/5', 'w-2/5', 'w-1/2'][i]}`} />
                </div>
              ))}
            </div>
          )}

          {log.status === 'error' && (
            <div className="py-10 text-center text-sm text-danger-text">
              <p>Die Aktivität konnte nicht geladen werden.</p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => void log.reload()}>
                Erneut versuchen
              </Button>
            </div>
          )}

          {log.status === 'ready' && log.items.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="grid size-12 place-items-center rounded-xl bg-surface-muted text-fg-subtle ring-1 ring-line">
                <ClockIcon className="size-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-fg">Noch keine Aktivität</p>
                <p className="mt-1 text-sm text-fg-subtle">
                  {filter === 'all'
                    ? 'Sobald du Notizen, Tasks oder das Board änderst, erscheint das hier.'
                    : 'In diesem Bereich gibt es noch keine Einträge.'}
                </p>
              </div>
            </div>
          )}

          {log.status === 'ready' &&
            groupByDay(log.items, now, (a) => a.createdAt).map((group) => (
              <section key={group.label} aria-label={group.label} className="mb-6">
                <h2 className="sticky top-0 z-10 -mx-1 bg-canvas/90 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle backdrop-blur">
                  {group.label}
                </h2>
                <ul className="rounded-xl border border-line bg-surface p-1 shadow-card">
                  {group.items.map((activity) => (
                    <ActivityItem key={activity.id} activity={activity} now={now} />
                  ))}
                </ul>
              </section>
            ))}

          {log.status === 'ready' && hasMore && (
            <div ref={sentinel} className="flex justify-center py-4">
              <Button variant="secondary" size="sm" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? 'Lädt …' : 'Mehr laden'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

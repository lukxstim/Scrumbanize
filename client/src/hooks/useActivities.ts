import { useCallback, useEffect, useRef, useState } from 'react';
import type { Activity, ActivityEntity } from '../types/activity';
import { activitiesApi } from '../utils/api';
import type { LoadStatus } from './useNotes';

const PAGE_SIZE = 30;

/**
 * The project's activity log, newest first, filtered by area. Older entries load page by page;
 * the first page reloads when the filter changes and when the browser window regains focus.
 */
export function useActivities(projectId: number, type?: ActivityEntity) {
  const [items, setItems] = useState<Activity[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  // Ignores responses for a filter that is no longer selected.
  const requestId = useRef(0);

  const reload = useCallback(
    async (showLoading: boolean) => {
      const id = ++requestId.current;
      if (showLoading) setStatus('loading');
      try {
        const page = await activitiesApi.list(projectId, { type, limit: PAGE_SIZE });
        if (id !== requestId.current) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setStatus('ready');
      } catch {
        if (id === requestId.current && showLoading) setStatus('error');
      }
    },
    [projectId, type],
  );

  useEffect(() => {
    void reload(true);
    // Back in the window: show what happened meanwhile (e.g. in another tab), without a loading flash.
    const onFocus = () => void reload(false);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const loadMore = useCallback(async () => {
    if (nextCursor === null || loadingMore) return;
    const id = requestId.current;
    setLoadingMore(true);
    try {
      const page = await activitiesApi.list(projectId, { type, before: nextCursor, limit: PAGE_SIZE });
      if (id !== requestId.current) return;
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch {
      // The "Mehr laden" button stays, so the user can try again.
    } finally {
      setLoadingMore(false);
    }
  }, [projectId, type, nextCursor, loadingMore]);

  return { items, status, hasMore: nextCursor !== null, loadingMore, loadMore, reload: () => reload(true) };
}

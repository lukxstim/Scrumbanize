import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalyticsQuery, AnalyticsReport } from '../types/analytics';
import { analyticsApi } from '../utils/api';
import type { LoadStatus } from './useNotes';

/**
 * The project's figures for the filter. They are computed on request, so they reload when the filter changes and
 * when the browser window regains focus. While reloading, the previous report stays (`refreshing`), so the charts
 * keep their frame instead of flashing.
 */
export function useAnalytics(projectId: number, query: AnalyticsQuery) {
  const [report, setReport] = useState<AnalyticsReport | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  // Ignores responses for a filter that is no longer selected.
  const requestId = useRef(0);
  const { from, to, granularity } = query;

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setRefreshing(true);
    try {
      const next = await analyticsApi.get(projectId, { from, to, granularity });
      if (id !== requestId.current) return;
      setReport(next);
      setStatus('ready');
    } catch {
      if (id === requestId.current) setStatus((current) => (current === 'ready' ? current : 'error'));
    } finally {
      if (id === requestId.current) setRefreshing(false);
    }
  }, [projectId, from, to, granularity]);

  // Another project starts over with a loading state.
  useEffect(() => {
    setReport(null);
    setStatus('loading');
  }, [projectId]);

  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  return { report, status, refreshing, reload };
}

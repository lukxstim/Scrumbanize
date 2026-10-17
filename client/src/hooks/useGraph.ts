import { useCallback, useEffect, useRef, useState } from 'react';
import type { GraphData } from '../types/graph';
import { graphApi } from '../utils/api';
import type { LoadStatus } from './useNotes';

/** The project's notes, tasks and their connections; reloads silently when the browser window regains focus. */
export function useGraph(projectId: number) {
  const [graph, setGraph] = useState<GraphData | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  // Ignores responses for a project that is no longer shown.
  const requestId = useRef(0);

  const reload = useCallback(
    async (showLoading: boolean) => {
      const id = ++requestId.current;
      if (showLoading) setStatus('loading');
      try {
        const next = await graphApi.get(projectId);
        if (id !== requestId.current) return;
        setGraph(next);
        setStatus('ready');
      } catch {
        if (id === requestId.current && showLoading) setStatus('error');
      }
    },
    [projectId],
  );

  useEffect(() => {
    void reload(true);
    const onFocus = () => void reload(false);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  return { graph, status, reload: () => reload(true) };
}

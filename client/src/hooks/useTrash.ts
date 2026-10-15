import { useCallback, useEffect, useState } from 'react';
import type { TrashItem } from '../types/trash';
import { trashApi } from '../utils/api';
import { onTrashChanged } from '../utils/appEvents';
import type { LoadStatus } from './useNotes';

/**
 * The trash: notes and tasks of `projectId` (all projects if undefined) plus all trashed projects.
 * Reloads by itself whenever something goes into or out of the trash anywhere in the app.
 */
export function useTrash(projectId: number | undefined) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');

  const reload = useCallback(async () => {
    try {
      setItems(await trashApi.list(projectId));
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
    return onTrashChanged(() => void reload());
  }, [reload]);

  return { items, status, reload };
}

/** How many entries the project's trash view shows, for the tab badge; 0 while unknown. */
export function useTrashCount(projectId: number | undefined): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (projectId === undefined) return;
    let current = true;
    // The list of all projects, counted here: right after a project went to the trash, the header still
    // shows it for a moment, and asking for that project's trash would fail.
    const load = () =>
      trashApi
        .list()
        .then((items) => current && setCount(items.filter((i) => i.type === 'project' || i.projectId === projectId).length))
        .catch(() => undefined);
    void load();
    const unsubscribe = onTrashChanged(() => void load());
    return () => {
      current = false;
      unsubscribe();
    };
  }, [projectId]);

  return count;
}
